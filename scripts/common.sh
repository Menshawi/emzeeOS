# Shared by the emzee scripts. Sourced, not run. Runs on the TV as root (busybox sh).
# shellcheck shell=sh disable=SC2034

L=${EMZEE_HOME:-/media/developer/emzee}           # everything of ours lives here
H=${EMZEE_STOCK_HOME:-/usr/palm/applications/com.webos.app.home}  # LG's Home; we only ever bind-mount over it
S=$L/home-overlay                                 # the staged launcher, shown in place of $H
B=$L/backup
READY=/tmp/emzee-ready
LASTAPP=/var/luna/preferences/bootd_last_foreground_app_id.json
INITD=${EMZEE_INITD:-/var/lib/webosbrew/init.d/50-emzee-home}
SETUP_APP=${EMZEE_SETUP_APP:-/media/developer/apps/usr/palm/applications/com.emzee.home}  # the emzee Setup ipk, when installed that way
BLOCK_SCHEMA=${EMZEE_BLOCK_SCHEMA:-/etc/palm/schemas/sam/applicationManager.blockSystemApp.schema}
HOME_ID=com.webos.app.home
export PATH="/usr/bin:/usr/sbin:/bin:/sbin:$PATH"
# local tests only: fake mount, luna-send and friends ahead of the real ones
[ -n "$EMZEE_TEST_BIN" ] && PATH="$EMZEE_TEST_BIN:$PATH"

# each line carries the clock time and the seconds since power-on, so a boot log shows how long each step took
log() { echo "[emzee $(date '+%H:%M:%S') +$(cut -d' ' -f1 /proc/uptime 2>/dev/null)s] $*"; }

luna() { luna-send -n 1 -w "${3:-5000}" -f "$1" "$2" </dev/null 2>/dev/null; }
# a luna reply on one line, shortened, for the log
brief() { tr -d '\n' | tr -s ' ' | cut -c1-160; }

home_mounted() { grep -q " $H " "${EMZEE_MOUNTS:-/proc/mounts}"; }

helper_running() { pgrep -f "[e]mzee/service/service.js" >/dev/null 2>&1; }

start_helper() {
  helper_running && return 0
  log "starting helper"
  (cd "$L/service" && nohup node "$L/service/service.js" >>/tmp/emzee-helper.log 2>&1 </dev/null &)
}

# the app in front, e.g. com.webos.app.home
foreground() {
  luna luna://com.webos.applicationManager/getForegroundAppInfo '{}' 2000 | sed -n 's/.*"appId": *"\([^"]*\)".*/\1/p' | head -n 1
}

# The type sam has on record for Home: "web" while it has our overlay's appinfo.json, LG's own type otherwise.
sam_home_type() {
  luna luna://com.webos.applicationManager/getAppInfo "{\"id\":\"$HOME_ID\"}" 3000 |
    node -e 'var s="";process.stdin.on("data",function(d){s+=d}).on("end",function(){try{process.stdout.write(String((JSON.parse(s).appInfo||{}).type||""))}catch(e){}})' 2>/dev/null
}

# The way Glasshouse Home and Luma switch Home on webOS 10/11 (webOS 25/26), instead of restarting sam:
# sam reads an appinfo.json only when it scans, and blockSystemApp followed by releaseBlockSystemApp makes it drop
# and reread that one app, overlay included, without restarting (restarting sam is what left screens black).
# webOS 11 wants forceBlockSystemApp:false on the block, and only where its schema names it.
# The release is retried: an app left blocked cannot open. Returns 0 if the release went through.
release_home() {
  n=0
  while [ $n -lt 3 ]; do
    r=$(luna luna://com.webos.applicationManager/releaseBlockSystemApp "{\"id\":\"$HOME_ID\"}" 5000)
    echo "$r" | grep -q '"returnValue": *true' && return 0
    # "not blocked" also means it is free to open
    echo "$r" | tr '[:upper:]' '[:lower:]' | grep -q 'not.*blocked' && return 0
    [ "$1" = quiet ] && return 1
    log "releaseBlockSystemApp: $(echo "$r" | brief)"
    sleep 1; n=$((n + 1))
  done
  log "could not release Home; it stays blocked until released (sh $L/scripts/undo-home.sh)"
  return 1
}

# Makes sam reread Home and waits up to ~8 s for it to report the type wanted ("web" for ours, "lg" for LG's).
reread_home() {
  want=$1
  sam_has() { t=$(sam_home_type); if [ "$want" = web ]; then [ "$t" = web ]; else [ -n "$t" ] && [ "$t" != web ]; fi; }
  sam_has && { log "sam already has the $want Home"; return 0; }
  payload="{\"id\":\"$HOME_ID\"}"
  grep -q '"forceBlockSystemApp"' "$BLOCK_SCHEMA" 2>/dev/null && payload="{\"id\":\"$HOME_ID\",\"forceBlockSystemApp\":false}"
  r=$(luna luna://com.webos.applicationManager/blockSystemApp "$payload" 5000)
  log "blockSystemApp: $(echo "$r" | brief)"
  # a block that timed out may still have happened, so release either way
  release_home loud || return 1
  i=0
  while [ $i -lt 8 ]; do
    sam_has && { log "sam reread Home: type $(sam_home_type)"; return 0; }
    sleep 1; i=$((i + 1))
  done
  log "sam still reports Home as '$(sam_home_type)'"
  return 1
}

# The last resort when sam won't reread Home (it was the only way on webOS 5/6): restart it.
restart_sam() {
  log "restarting sam (fallback)"
  systemctl restart sam
  i=0
  while [ $i -lt 30 ]; do
    luna luna://com.webos.applicationManager/getForegroundAppInfo '{}' 1000 | grep -q '"returnValue": *true' && return 0
    sleep 1; i=$((i + 1))
  done
  log "sam slow to come back"
  return 1
}

# LG's own Home process: its executable (webOS 9), or the Flutter runner given its id (webOS 10/11:
# "/usr/bin/flutter-client -i com.webos.app.home"). Stopped with SIGTERM after sam has our appinfo.json;
# where it was in front, sam opens Home again about a second later, as ours. Prints how many it stopped.
stop_lg_home() {
  n=0
  for d in /proc/[0-9]*; do
    [ -r "$d/cmdline" ] || continue
    c=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null) || continue
    case "$c" in
      "/usr/bin/$HOME_ID "*|*"flutter-client "*"-i $HOME_ID "*) kill -TERM "${d#/proc/}" 2>/dev/null && n=$((n + 1)) ;;
    esac
  done
  echo $n
}

# Waits up to $1 seconds for Home to be in front.
home_in_front() {
  i=0
  while [ $i -lt "$1" ]; do
    [ "$(foreground)" = "$HOME_ID" ] && return 0
    sleep 1; i=$((i + 1))
  done
  return 1
}

launch_home() {
  r=$(luna luna://com.webos.applicationManager/launch "{\"id\":\"$HOME_ID\"}" 10000)
  log "launch Home: $(echo "$r" | brief)"
}
