#!/bin/sh
# Copies the launcher into $S with an appinfo.json based on LG's own Home appinfo (switched to type web).
# Writes nothing under /usr. Safe to re-run; the original appinfo is backed up once.
# Usage: sh /media/developer/emzee/scripts/stage-home.sh
. "$(dirname "$0")/common.sh"
set -e

[ -d "$H" ] || { log "no $H on this TV; stopping"; exit 1; }
[ -f "$L/app/index.html" ] || { log "no launcher at $L/app"; exit 1; }
mkdir -p "$B"

# Back up LG's appinfo once. If our overlay is mounted right now, $H shows OUR files, so never copy then.
if [ ! -s "$B/home-appinfo.orig.json" ]; then
  if home_mounted; then
    log "overlay is mounted and no backup exists; run undo-home.sh temp first"; exit 1
  fi
  cp "$H/appinfo.json" "$B/home-appinfo.orig.json"
  log "backed up $H/appinfo.json"
fi

# stage into a fresh folder, then swap it in
rm -rf "$S.new"
mkdir -p "$S.new"
cp -R "$L/app/." "$S.new/"
node "$L/scripts/stage-appinfo.js" "$B/home-appinfo.orig.json" "$L/app/appinfo.json" > "$S.new/appinfo.json"
# a mounted overlay keeps pointing at the old folder's inode; replacing its contents in place keeps the mount valid
if home_mounted && [ -d "$S" ]; then
  find "$S" -mindepth 1 -maxdepth 1 -exec rm -rf {} \;
  cp -R "$S.new/." "$S/"
  rm -rf "$S.new"
else
  rm -rf "$S"
  mv "$S.new" "$S"
fi
log "staged launcher in $S"
