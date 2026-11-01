#!/bin/sh
# One-time setup after copying emzee-os to /media/developer/emzee: links the boot hook and stages the launcher.
# Does not take over Home until the next boot (or run boot.sh by hand).
. "$(dirname "$(readlink -f "$0")")/common.sh"
set -e

[ -f "$L/service/service.js" ] && [ -f "$L/app/index.html" ] || { log "copy app/, service/ and scripts/ to $L first"; exit 1; }
node -e '(()=>1)()' || { log "node not found"; exit 1; }
command -v systemctl >/dev/null || { log "systemctl not found"; exit 1; }
[ -d "$(dirname "$INITD")" ] || { log "no $(dirname "$INITD"); is Homebrew Channel installed and rooted?"; exit 1; }

chmod 700 "$L"
chmod 755 "$L"/scripts/*.sh
mkdir -p "$L/data" && chmod 700 "$L/data"
sh "$L/scripts/stage-home.sh"
ln -sf "$L/scripts/boot.sh" "$INITD"
log "linked $INITD -> $L/scripts/boot.sh"
log "installed. Next: 'sh $L/scripts/undo-home.sh temp' (prove the way back), then 'sh $L/scripts/boot.sh'"
