#!/bin/sh
# Boot hook, linked as /var/lib/webosbrew/init.d/50-emzee-home (Homebrew Channel runs init.d at boot).
# Starts the helper and the watchdog, then puts the launcher in LG's Home's place the way Glasshouse Home does on
# webOS 10/11 (webOS 25/26): bind-mount the overlay, have sam reread Home's appinfo.json (block and release, no sam
# restart), then stop LG's Home process; where it was in front, sam opens Home again as ours.
# Failsafe: once Home is in front, the launcher must report ready within 30 s, or LG's Home comes back for this boot.
# Every step is bounded and runs once per boot; nothing here loops on its own. Log: /tmp/emzee-boot.log.
# Skips everything when /media/developer/emzee/DISABLE exists. The mount lives in RAM: a reboot always undoes it.
# Usage: runs at boot; by hand or from emzee Setup: sh /media/developer/emzee/scripts/boot.sh [now]
#   now   also bring emzee to the front (and reload its page) right away
. "$(dirname "$(readlink -f "$0")")/common.sh"

NOW=$1
[ -e "$L/DISABLE" ] && exit 0

# Set up through the emzee Setup ipk, and that package has since been removed in Homebrew Channel
# (which runs no remove hooks): finish the uninstall now. Nothing is mounted yet this early in boot.
if [ -e "$L/.via-ipk" ] && [ ! -d "$SETUP_APP" ]; then
  log "emzee Setup was removed; removing $INITD and $L" >>/tmp/emzee-boot.log
  rm -f "$INITD"
  case "$L" in /media/developer/emzee) rm -rf "$L" ;; esac
  exit 0
fi

give_back() {
  log "$1; giving LG's Home back for this boot"
  sh "$L/scripts/undo-home.sh" temp
}

takeover() {
  log "takeover starts${NOW:+ ($NOW)}; in front: $(foreground)"
  start_helper
  pgrep -f "[e]mzee/scripts/watchdog.sh" >/dev/null 2>&1 || (sh "$L/scripts/watchdog.sh" </dev/null >>/tmp/emzee-boot.log 2>&1 &)

  [ -f "$S/index.html" ] || sh "$L/scripts/stage-home.sh" || { log "staging failed; leaving LG's Home"; return 1; }
  # a block left by an interrupted run would keep Home from opening at all
  release_home quiet

  if ! home_mounted; then
    mount --bind "$S" "$H" || { log "mount failed; leaving LG's Home"; return 1; }
    log "mounted overlay over $H"
  fi
  rm -f "$READY"

  if ! reread_home web; then
    restart_sam
    [ "$(sam_home_type)" = web ] || { give_back "sam won't take emzee as Home"; return 1; }
    log "sam took emzee as Home after the restart"
  fi

  front=$(foreground)
  log "stopped $(stop_lg_home) LG Home process(es); in front was: ${front:-nothing}"
  if [ "$NOW" = now ]; then
    # an update replaced the files under a page that may still be running: close it so Home opens fresh
    luna luna://com.palm.webappmanager/killApp "{\"appId\":\"$HOME_ID\"}" 5000 >/dev/null
    sleep 1
    launch_home
  elif [ "$front" = "$HOME_ID" ] || [ -z "$front" ]; then
    # sam reopens Home by itself about a second after its process stops; ask once if it hasn't after 6 s
    home_in_front 6 || launch_home
  fi

  # The failsafe counts from when Home is in front: if another app is (the viewer opened one during boot),
  # wait for them to come back to Home, for up to an hour, checking every 2 s.
  i=0
  while [ "$(foreground)" != "$HOME_ID" ]; do
    [ $i -ge 1800 ] && { log "Home not opened within an hour; failsafe not run"; return 0; }
    sleep 2; i=$((i + 1))
  done
  i=0
  while [ $i -lt 30 ]; do
    [ -e "$READY" ] && { log "launcher ready after ${i}s in front"; return 0; }
    sleep 1; i=$((i + 1))
  done
  give_back "launcher in front for 30 s without reporting ready"
}

# never hold up the rest of boot
(takeover </dev/null >>/tmp/emzee-boot.log 2>&1 &)
exit 0
