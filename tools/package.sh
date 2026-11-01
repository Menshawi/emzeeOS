#!/bin/sh
# Builds into dist/:
#   com.emzee.launcher_<v>_all.ipk  phase 1: the launcher as an ordinary app
#   com.emzee.home_<v>_all.ipk      phase 3 without SSH: "emzeeOS Setup", an app plus a service that Homebrew
#                                   Channel elevates to root; it carries app/, service/ and scripts/ and runs them
#   emzee-home_<v>.tar.gz           phases 2-3 by hand (for TVs with SSH): app/, service/, scripts/
#   hbrepo/                         a Homebrew Channel repository (apps.json + one manifest per package)
# The ipks are assembled by hand (debian-binary + control.tar.gz + data.tar.gz in an ar archive), like
# CleanYourTV's tools/release.sh, with the same layout as ares-package (packageinfo.json included).
# REPO_URL is where dist/ is served from (default: this Mac's LAN address, port 8096), e.g.
#   REPO_URL=http://192.168.1.20:8096 sh tools/package.sh && (cd dist && python3 -m http.server 8096)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist"
if [ -z "$REPO_URL" ]; then
  IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | cut -d' ' -f1)
  REPO_URL="http://${IP:-localhost}:8096"
fi
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/app/appinfo.json")
mkdir -p "$OUT/hbrepo"
export COPYFILE_DISABLE=1
TAROPTS="--format ustar --uid 0 --gid 0 --uname root --gname root"

# copy a folder, leaving out macOS clutter
copy() { mkdir -p "$2" && (cd "$1" && find . -type f ! -name '.DS_Store' ! -name '._*' | tar -cf - -T -) | (cd "$2" && tar -xf -); }

# ipk <package id> <description> <staged data dir> [service id]
ipk() {
  id=$1; desc=$2; data=$3; svc=$4
  work=$(dirname "$data")
  mkdir -p "$data/usr/palm/packages/$id" "$work/control"
  if [ -n "$svc" ]; then services="[\"$svc\"]"; else services="[]"; fi
  # the same fields ares-package writes
  printf '{\n  "id": "%s",\n  "version": "%s",\n  "app": "%s",\n  "services": %s\n}\n' \
    "$id" "$VERSION" "$id" "$services" > "$data/usr/palm/packages/$id/packageinfo.json"
  cat > "$work/control/control" <<EOF
Package: $id
Version: $VERSION
Section: misc
Priority: optional
Architecture: all
Installed-Size: $(du -sk "$data" | cut -f1)
Maintainer: emzeeOS
Description: $desc
webOS-Package-Format-Version: 2
webOS-Packager-Version: x.y.x
EOF
  printf '2.0\n' > "$work/debian-binary"
  # ustar, numeric root owner, no macOS extended attributes
  # shellcheck disable=SC2086 # TAROPTS is meant to split
  for part in control data; do
    if ! (cd "$work/$part" && tar $TAROPTS --no-xattrs -czf "$work/$part.tar.gz" . 2>/dev/null); then
      (cd "$work/$part" && tar $TAROPTS -czf "$work/$part.tar.gz" .)
    fi
  done
  f="$OUT/${id}_${VERSION}_all.ipk"
  rm -f "$f"
  (cd "$work" && ar rc "$f" debian-binary control.tar.gz data.tar.gz)
  echo "built $f ($(du -k "$f" | cut -f1) KB)"
}

# manifest <package id> <title> <description> <rootRequired>: the shape Homebrew Channel's repository client reads
manifest() {
  f="${1}_${VERSION}_all.ipk"
  sha=$(shasum -a 256 "$OUT/$f" | cut -d' ' -f1)
  cat > "$OUT/hbrepo/$1.manifest.json" <<EOF
{
  "id": "$1",
  "title": "$2",
  "version": "$VERSION",
  "iconUri": "$REPO_URL/hbrepo/icon.png",
  "rootRequired": $4,
  "sourceUrl": "$REPO_URL/hbrepo",
  "ipkUrl": "$REPO_URL/$f",
  "ipkHash": { "sha256": "$sha" }
}
EOF
  printf '    {\n      "id": "%s",\n      "title": "%s",\n      "iconUri": "%s/hbrepo/icon.png",\n      "manifestUrl": "%s/hbrepo/%s.manifest.json",\n      "shortDescription": "%s"\n    }' \
    "$1" "$2" "$REPO_URL" "$REPO_URL" "$1" "$3"
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# phase 1: the launcher
copy "$ROOT/app" "$WORK/launcher/data/usr/palm/applications/com.emzee.launcher"
ipk com.emzee.launcher "emzeeOS, a minimal Home launcher" "$WORK/launcher/data"

# phase 3 without SSH: emzeeOS Setup, its root service, and the payload it installs into /media/developer/emzee
D="$WORK/setup/data/usr/palm"
copy "$ROOT/takeover/app" "$D/applications/com.emzee.home"
cp "$ROOT/app/icon.png" "$ROOT/app/largeIcon.png" "$D/applications/com.emzee.home/"
copy "$ROOT/takeover/service" "$D/services/com.emzee.home.service"
for d in app service scripts; do copy "$ROOT/$d" "$D/services/com.emzee.home.service/payload/$d"; done
# the fireplace video (media/fireplace.mp4, Pexels licence) rides along in Setup only, so the TV needn't download it
[ -f "$ROOT/media/fireplace.mp4" ] && copy "$ROOT/media" "$D/services/com.emzee.home.service/payload/media"
ipk com.emzee.home "emzeeOS Setup: makes emzeeOS the Home screen (root via Homebrew Channel)" "$WORK/setup/data" com.emzee.home.service

# phases 2-3 by hand
TGZ="$OUT/emzee-home_${VERSION}.tar.gz"
(cd "$ROOT" && tar --exclude '.DS_Store' --exclude '._*' -czf "$TGZ" app service scripts)
echo "built $TGZ (copy to /media/developer/emzee on a TV with SSH)"

# the Homebrew Channel repository
cp "$ROOT/app/largeIcon.png" "$OUT/hbrepo/icon.png"
{
  printf '{\n  "packages": [\n'
  manifest com.emzee.launcher "emzeeOS Home" "Custom Home launcher" false
  printf ',\n'
  manifest com.emzee.home "emzeeOS Setup" "Makes emzeeOS your Home screen (needs root)" true
  printf '\n  ]\n}\n'
} > "$OUT/hbrepo/apps.json"
echo "wrote $OUT/hbrepo (add $REPO_URL/hbrepo/apps.json in Homebrew Channel > Settings > Repositories)"
