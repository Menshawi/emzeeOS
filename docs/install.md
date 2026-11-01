# Installing emzeeOS

Everything you need to put emzeeOS on a rooted LG OLED, take it off again, and understand how it behaves.

## The fireplace video

It isn't in this repository: it's under the Pexels licence, which doesn't allow redistributing copies as they are. Either:
- download ["Burning Logs in a Fireplace"](https://www.pexels.com/video/burning-logs-in-a-fireplace-13270910/) yourself (4K), save it as `media/fireplace.mp4`, and `package.sh` bundles it into emzeeOS Setup; or
- skip it, and the TV downloads it from Pexels the first time you pick Fireplace.

## Build

```sh
tools/package.sh
```

It builds these in `dist/`:
- `com.emzee.launcher_<v>_all.ipk`: phase 1, as an ordinary app.
- `com.emzee.home_<v>_all.ipk`: emzeeOS Setup, carrying `app/`, `service/` and `scripts/`.
- `emzee-home_<v>.tar.gz`: `app/`, `service/` and `scripts/`, for `/media/developer/emzee` on a TV with SSH.
- `hbrepo/`: a Homebrew Channel repository (`apps.json` plus one manifest per package, with sha256 hashes).

`REPO_URL` is where `dist/` will be served. It defaults to this machine's LAN address on port 8096; set it to override. Then serve it:
```sh
REPO_URL=http://192.168.1.20:8096 tools/package.sh
cd dist && python3 -m http.server 8096
```

## On the TV, without SSH (Homebrew Channel repository)

Homebrew Channel doesn't run ipk install or remove scripts. Instead, emzeeOS Setup asks Homebrew Channel to elevate its service (`luna://org.webosbrew.hbchannel.service/elevateService`), then the service runs the same scripts as root. Homebrew Channel must itself be running as root (its Settings show this).

1. In Homebrew Channel → Settings → Repositories, add `http://<mac>:8096/hbrepo/apps.json`.
2. In the Apps tab, install **emzeeOS Setup** (and **emzeeOS Home** if you want the standalone launcher too).
3. Open emzeeOS Setup. The Root fact should say Yes after a few seconds.
4. **Make emzeeOS my Home**: copies the bundled launcher, helper and scripts into `/media/developer/emzee`, links the boot hook, stages the overlay, then takes over Home right away and closes the Setup app. If emzeeOS doesn't report ready within 30 s of being in front, LG's Home comes back for that boot.
5. **Give LG's Home back**: runs `undo-home.sh` (creates `DISABLE`, so later boots keep LG's Home). Pressing **Make emzeeOS my Home** again turns it back on.
6. **Remove emzeeOS completely**: press it twice. It runs `uninstall.sh -y`, which also removes emzeeOS Home and emzeeOS Setup.
7. To update: install the new emzeeOS Setup from Homebrew Channel, open it, and press **Update emzeeOS**.

How to get back:
- emzeeOS Setup stays listed in emzeeOS's own app row, so you can always reach it.
- The failsafe and the watchdog work the same as with SSH.
- If you uninstall emzeeOS Setup from Homebrew Channel instead of using **Remove emzeeOS completely**, the next boot notices that the package is gone. It removes the boot hook and `/media/developer/emzee` without mounting anything. This only happens when the install was done by emzeeOS Setup.

### The Input button

webOS handles the Input button itself, so it opens LG's input screen even with emzeeOS as Home. emzeeOS opens its own Inputs sheet when it is launched with `{"emzee":"inputs"}`, so a button remapper only has to run one command. Use **LG Input Mapper** ([fivefold3/lginputmapper](https://github.com/fivefold3/lginputmapper)): it was built for webOS 24/25 (tested on a 2025 C5) and doesn't inject into LG's processes. The older LG Input Hook has reports of not working on webOS 24/25.
1. In Homebrew Channel → Settings → Add repository, enter `https://raw.githubusercontent.com/fivefold3/webos-homebrew-repo/main/repo.json`, then install LG Input Mapper and open it once.
2. Remap the Input button (press it when asked), choose **Run a command**, and enter:
   ```
   luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.home","params":{"emzee":"inputs"}}'
   ```
   ("Launch an app" alone would open emzeeOS without the Inputs sheet.)
3. Pressing Input now brings emzeeOS forward with its Inputs sheet open, from any app. Removing the mapping gives the button back to LG.

LG Input Mapper is a small community project, untested on a C2 or its remote.

**Show log** in emzeeOS Setup shows the startup log (each step with seconds since power-on), the helper's log and Setup's own: `/tmp/emzee-boot.log`, `/tmp/emzee-helper.log` and `/tmp/emzee-setup.log`. They are cleared at each full restart.

### How the takeover works on webOS 25

It follows Glasshouse Home (`server/lib/home-takeover.js` and `samrescan.js`), the most widely used Home replacement for rooted LG TVs:
1. Bind-mount the staged launcher over `/usr/palm/applications/com.webos.app.home`. Its `appinfo.json` keeps LG's id, is a web app with `appCategory: ["home"]` (webOS 10/11 open the default app of that category for the Home key) and `visible: false`.
2. Make sam reread Home without restarting: `applicationManager/blockSystemApp` then `releaseBlockSystemApp` (with `forceBlockSystemApp: false` where the TV's schema asks for it), then poll `getAppInfo` until it reports type `web` (about 8 s at most). Restarting sam is only the fallback; Glasshouse found it is what left screens black, and CleanYourTV that it breaks other services.
3. Only then stop LG's Home process (`/usr/bin/com.webos.app.home`, or `flutter-client -i com.webos.app.home`). Where it was in front, sam opens Home again by itself, now as emzeeOS; emzeeOS asks once if it hasn't after 6 s.
4. The failsafe counts from when Home is in front. Every step has a fixed number of tries and runs once per boot, so nothing can loop: the worst case is LG's Home for that boot.

Giving LG's Home back is the same in reverse: unmount, reread, then close emzeeOS's page.

## On the TV, with SSH (rooted, Homebrew Channel)

Everything lives in `/media/developer/emzee`. Nothing is written under `/usr`, and the bind mount only lasts until the next reboot.

1. Copy and unpack the bundle. You need SSH enabled in Homebrew Channel; use a key, not a password.
   ```sh
   scp dist/emzee-home_<v>.tar.gz root@<tv>:/tmp/
   ssh root@<tv> 'mkdir -p /media/developer/emzee && tar xzf /tmp/emzee-home_<v>.tar.gz -C /media/developer/emzee'
   ```
2. Install. This links `/var/lib/webosbrew/init.d/50-emzee-home` and stages the overlay. It doesn't take over Home yet.
   ```sh
   ssh root@<tv> sh /media/developer/emzee/scripts/install.sh
   ```
3. Check the helper on the TV:
   ```sh
   node /media/developer/emzee/service/service.js &
   curl 127.0.0.1:8775/api/apps
   ```
4. The location comes from the TV's postcode or your connection, or set it in Settings. To set it by hand:
   ```sh
   curl -X POST -d '{"location":{"lat":51.5,"lon":-0.12,"name":"London"}}' 127.0.0.1:8775/api/config
   ```
   To use a photo wallpaper, put `/media/developer/emzee/data/wallpaper.jpg` on the TV, then POST `{"wallpaper":"photo"}` the same way.
5. Test in the plan's order:
   1. `sh scripts/undo-home.sh temp`: proves the way back works.
   2. `sh scripts/boot.sh`: takes over Home.
   3. Reboot.
   4. Test the failsafe: break `home-overlay/index.html` and reboot. LG's Home should come back within about 30 seconds.
   5. `touch DISABLE`, then reboot: LG's Home should stay.
   6. `sh scripts/uninstall.sh -y`: removes everything.
   7. Check that the HDMI inputs and Live TV still work.

Logs are in `/tmp/emzee-boot.log` and `/tmp/emzee-helper.log`.

