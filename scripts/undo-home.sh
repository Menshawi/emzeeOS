#!/bin/sh
# Gives LG's Home back right now, the way Glasshouse Home does: unmount the overlay, have sam reread Home's
# appinfo.json (block and release; restarting sam only if that fails), then close our page. Where it was in front,
# the TV opens LG's Home in its place. Also resets the last-app preference.
#   sh undo-home.sh        also creates DISABLE, so later boots keep LG's Home
#   sh undo-home.sh temp   this boot only; the next boot takes over again
. "$(dirname "$(readlink -f "$0")")/common.sh"

if [ "$1" != "temp" ]; then
  touch "$L/DISABLE"
  log "created $L/DISABLE; boots will keep LG's Home until you delete it"
fi

# a "last app" pointing at us would reopen us after a reboot
if [ -f "$LASTAPP" ] && grep -q emzee "$LASTAPP" 2>/dev/null; then
  echo '{"lastAppId":"com.webos.app.home"}' > "$LASTAPP"
fi

front=$(foreground)
# unmount every layer, in case the overlay was mounted more than once
while home_mounted; do
  umount "$H" 2>/dev/null || umount -l "$H" || break
  log "unmounted overlay"
done
if home_mounted; then log "could not unmount $H; a reboot will clear it"; fi

# sam must have LG's appinfo.json again before our page closes, or it is left with a web type and nothing to run
if [ "$(sam_home_type)" = web ]; then
  reread_home lg || restart_sam
fi
# and Home must not stay blocked by an interrupted reread
release_home quiet

luna luna://com.palm.webappmanager/killApp "{\"appId\":\"$HOME_ID\"}" 5000 >/dev/null
if [ "$front" = "$HOME_ID" ] || [ -z "$front" ]; then
  home_in_front 6 || launch_home
fi
log "LG's Home is back (sam has it as '$(sam_home_type)')"
