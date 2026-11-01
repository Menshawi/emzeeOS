#!/bin/sh
# Keeps the helper running. If it stays down for about 60 s, gives LG's Home back for this boot and stops.
# Started by boot.sh; exits on its own when DISABLE appears or the overlay is gone.
. "$(dirname "$(readlink -f "$0")")/common.sh"

down=0
while true; do
  sleep 15
  [ -e "$L/DISABLE" ] && exit 0
  home_mounted || exit 0
  if helper_running; then
    down=0
    continue
  fi
  down=$((down + 15))
  log "helper down for ${down}s"
  if [ $down -ge 60 ]; then
    log "helper won't stay up; restoring LG's Home"
    sh "$L/scripts/undo-home.sh" temp
    exit 0
  fi
  start_helper
done
