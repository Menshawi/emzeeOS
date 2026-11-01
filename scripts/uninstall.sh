#!/bin/sh
# Removes emzeeOS completely: gives LG's Home back, stops the helper and watchdog, removes the boot hook
# and deletes /media/developer/emzee. Pass -y to confirm.
. "$(dirname "$(readlink -f "$0")")/common.sh"

[ "$1" = "-y" ] || { echo "This deletes $L entirely. Run again with -y to confirm."; exit 1; }

sh "$L/scripts/undo-home.sh"
pkill -f "[e]mzee/scripts/watchdog.sh" 2>/dev/null
pkill -f "[e]mzee/service/service.js" 2>/dev/null
rm -f "$INITD" "$READY" /tmp/emzee-boot.log /tmp/emzee-helper.log
# the ipk version, if it was installed as an ordinary app too (dev/remove is what Homebrew Channel uses)
luna luna://com.webos.appInstallService/dev/remove '{"id":"com.emzee.launcher"}' 20000 >/dev/null || true
case "$L" in /media/developer/emzee) rm -rf "$L" ;; esac
echo "emzeeOS removed. LG's Home is back."
# last, because it stops the Setup app's service, which may be what is running this script
[ -d "$SETUP_APP" ] && luna luna://com.webos.appInstallService/dev/remove '{"id":"com.emzee.home"}' 20000 >/dev/null
exit 0
