# emzee

A calm, minimal Home screen for rooted LG OLED TVs (webOS). It shows a live sky that follows the real sun, moon and weather, a magnifying dock of your pinned apps and inputs, an Apple Weather-style weather page, and an OLED-safe screen saver: the sky, or a crackling 4K fireplace.

Built and used on an LG OLED77C26LD (C2) running webOS 25. Other models are untested.

> [!WARNING]
> emzee replaces LG's Home screen on a **rooted** TV, using root through Homebrew Channel. Rooting may void your warranty, and running root code on your TV is at your own risk. emzee only ever writes to `/media/developer/emzee`, its bind mount lasts until the next reboot, and a failsafe brings LG's Home back if emzee doesn't start, but there is no guarantee. It comes with no warranty; see [LICENSE](LICENSE).
>
> emzee is an independent project. It is not affiliated with or endorsed by LG Electronics. "LG" and "webOS" are trademarks of their owners.

## What's in it

- **Sky:** a canvas sky that follows the real sun and moon for your location (phase, sun arc, moon phase, stars, drifting clouds), with Apple Weather-style rain, drizzle, snow, fog and lightning from the live weather.
- **Dock:** your pinned apps and inputs. It magnifies like the Mac's, and a small light sits under the selected tile. **All apps** slides up underneath, with pin and Arrange.
- **Weather page:** wind, moon, sunrise and sunset, UV, feels like, precipitation, humidity, pressure, visibility, air quality, 24 hours and 10 days.
- **Settings:** location, °C/°F, 12/24-hour clock, screen saver timing and style, fireplace speed, and sky motion.
- **Screen saver:** the sky with a wandering clock, or a real 4K fireplace video with its crackle, crossfaded at the loop point so it never stutters.
- **OLED-friendly throughout:** a dim palette, everything drifting slowly, and only `transform` and `opacity` animated (see [OLED rules](#oled-rules)).

## How it's built

It came together in phases:

1. **Phase 1** (`app/`): an ordinary webOS web app with no root needed. Plain HTML, CSS and classic `<script>` files, with no build step.
2. **Phase 2** (`service/`): a Node helper on `127.0.0.1:8775` that supplies apps, icons, inputs, settings, weather and the fireplace video.
3. **Phase 3** (`scripts/`, `takeover/`): runs as root through Homebrew Channel and bind-mounts the launcher over LG's Home, with a failsafe.
4. **Phase 4** adds polish: real sunrise, sunset and moon phase; the Arrange screen; the weather page, Settings and the fireplace.

## Quick start

You need a rooted LG TV with [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) running as root, and a Mac or Linux machine on the same network.

```sh
tools/package.sh                          # builds dist/, including a Homebrew Channel repository
cd dist && python3 -m http.server 8096    # serve it on your network
```

Then, on the TV:
1. Homebrew Channel → Settings → Repositories: add the `hbrepo/apps.json` URL that `package.sh` printed.
2. Install **emzee Setup**, open it, and press **Make emzee my Home**.

The full walkthrough is in [On the TV, without SSH](#on-the-tv-without-ssh-homebrew-channel-repository).

**The fireplace video** isn't in this repository: it's under the Pexels licence, which doesn't allow redistributing copies as they are. Either:
- download ["Burning Logs in a Fireplace"](https://www.pexels.com/video/burning-logs-in-a-fireplace-13270910/) yourself (4K), save it as `media/fireplace.mp4`, and `package.sh` bundles it into emzee Setup; or
- skip it, and the TV downloads it from Pexels the first time you pick Fireplace.

## Layout

- `app/js/api.js`: data, tried in order: the helper, then `PalmServiceBridge` luna calls, then demo data. Settings go to the helper, or to `localStorage` when there is no helper.
- `app/js/sky.js`, `clock.js`, `weather.js`: the sky (phase, sun arc, moon phase, stars, clouds), the clock and the weather.
- `app/js/focus.js`, `dock.js`, `inputs.js`, `arrange.js`: remote navigation (including hold OK), the dock (your pins), the inputs sheet and All apps (`arrange.js`: pinning and Arrange).
- `app/js/idle.js`, `fire.js`: the screen saver (after 2 minutes by default; nearly black after 15). The clock wanders the whole time; `fire.js` plays the fireplace.
- `app/js/settings.js`, `wxpage.js`: the Settings panel and the weather page.
- `service/`: `service.js` (HTTP), `luna.js` (time-limited `luna-send`), `apps.js`, `inputs.js`, `weather.js`, `location.js`, `fireplace.js`, `config.js`.
- `scripts/`: `install.sh`, `boot.sh`, `stage-home.sh`, `undo-home.sh`, `watchdog.sh` and `uninstall.sh`, plus `common.sh` and `stage-appinfo.js`.
- `takeover/`: **emzee Setup** (`com.emzee.home`), which runs phase 3 without SSH. `app/` is the setup screen; `service/takeover.js` is a webOS JS service that Homebrew Channel elevates to root, and it runs the scripts above.
- `tools/`: `preview.sh`, `package.sh`, `make-icons.py` and `make-splash.py` (the launch splash, `app/splash.png`).

## Preview

```sh
tools/preview.sh        # http://localhost:8090/
```

The keyboard stands in for the remote:

| Key | Remote |
| --- | --- |
| ← → | move |
| Enter | OK (hold it to pin or unpin in All apps) |
| Esc / Backspace | Back |
| i | Input |

URL parameters for testing:
- `?phase=dawn|day|dusk|night`: fixes the sky phase.
- `?hour=17.4`: fixes the time the sky shows (decimal hours); good for watching the sun set.
- `?wx=rain|drizzle|snow|fog|storm`: forces that weather in the sky.
- `?open=inputs`: opens the Inputs sheet at start, as a remapped Input button does on the TV.
- `?idle=1`: starts in idle.
- `?meteor=1`: a shooting star every few seconds in idle, in any phase.
- `?blur=0`: forces the solid-glass fallback. On the TV, solid glass is the default (a live blur over the moving sky costs a lot); `?blur=1` brings the blur back to compare.
- `?wallpaper=<url>`: uses a photo instead of the sky.
- `?helper=1`: talks to a helper running locally. Start it with `EMZEE_DEV=1 EMZEE_HOME=/tmp/emzee node service/service.js`; without `luna-send` its app list is empty.

## Controls

On Home:
- ↑ from the dock reaches the round gear by the weather; OK opens **Settings** (location, °C/°F, 12/24-hour clock, when the screen saver starts, calm or full sky motion, and a way into emzee Setup). ◀ ▶ change a setting; it saves at once.
- → from the gear reaches the weather tile; OK (or a click) opens the **weather page** (after Apple Weather): the place and temperature over the live sky; cards for wind (compass), the moon, sunrise/sunset (arc), UV, feels like, precipitation, humidity, pressure (dial), visibility and air quality; Conditions for the next 24 hours and the next 10 days, each in temperature, rain or wind view (▲ ▼ switch view, ◀ ▶ scroll the hours, Back closes).
- Settings → Screen saver → Style: **Sky**, **Fireplace** (a real 4K wood fire with its crackle, boosted 2.5× since the clip is quiet, "Burning Logs in a Fireplace" by Volodymyr Kostiev on Pexels, at the **Fire speed** set just below it, 0.5× to 1×, 0.9× by default) or **Fireplace, silent**. Over the fire the clock shrinks to a small, faint time in the top-right corner. emzee Setup carries the video (`media/fireplace.mp4`, 49 MB) and hard-links it into `data/` when it installs. Installed by hand, the TV downloads it once instead, and the sky shows until it has it.
- The dock magnifies like the Mac's: the focused tile (or the one under the pointer) grows most, its neighbours less.
- ← → move along the dock.
- OK opens the selected item.
- Hold OK on a pin opens All apps in Arrange with that pin picked up.
- ↓ (or the **All apps** hint under the dock) opens All apps.

In All apps (press ↓ on Home; it slides up and pushes Home off the top):
- OK opens an app or switches to an input.
- Hold OK pins it to Home, or unpins it. Home holds up to 10 pins, apps or inputs.
- ↑ from the first row (or Back) goes back to Home. → at the end of the first row reaches the **Arrange** switch; ← or ↓ comes back.
- With Arrange on: OK picks up a pin or an app, the arrows move it, OK puts it down. Back cancels the move, then turns Arrange off.

The dock shows your pins in order (config `pins`). Until you pin something, it shows the first 6 apps and two inputs.

## Build

```sh
tools/package.sh
```

It builds these in `dist/`:
- `com.emzee.launcher_<v>_all.ipk`: phase 1, as an ordinary app.
- `com.emzee.home_<v>_all.ipk`: emzee Setup, carrying `app/`, `service/` and `scripts/`.
- `emzee-home_<v>.tar.gz`: `app/`, `service/` and `scripts/`, for `/media/developer/emzee` on a TV with SSH.
- `hbrepo/`: a Homebrew Channel repository (`apps.json` plus one manifest per package, with sha256 hashes).

`REPO_URL` is where `dist/` will be served. It defaults to this machine's LAN address on port 8096; set it to override. Then serve it:
```sh
REPO_URL=http://192.168.1.20:8096 tools/package.sh
cd dist && python3 -m http.server 8096
```

## On the TV, without SSH (Homebrew Channel repository)

Homebrew Channel doesn't run ipk install or remove scripts. Instead, emzee Setup asks Homebrew Channel to elevate its service (`luna://org.webosbrew.hbchannel.service/elevateService`), then the service runs the same scripts as root. Homebrew Channel must itself be running as root (its Settings show this).

1. In Homebrew Channel → Settings → Repositories, add `http://<mac>:8096/hbrepo/apps.json`.
2. In the Apps tab, install **emzee Setup** (and **emzee Home** if you want the standalone launcher too).
3. Open emzee Setup. The Root fact should say Yes after a few seconds.
4. **Make emzee my Home**: copies the bundled launcher, helper and scripts into `/media/developer/emzee`, links the boot hook, stages the overlay, then takes over Home right away and closes the Setup app. If emzee doesn't report ready within 30 s of being in front, LG's Home comes back for that boot.
5. **Give LG's Home back**: runs `undo-home.sh` (creates `DISABLE`, so later boots keep LG's Home). Pressing **Make emzee my Home** again turns it back on.
6. **Remove emzee completely**: press it twice. It runs `uninstall.sh -y`, which also removes emzee Home and emzee Setup.
7. To update: install the new emzee Setup from Homebrew Channel, open it, and press **Update emzee**.

How to get back:
- emzee Setup stays listed in emzee's own app row, so you can always reach it.
- The failsafe and the watchdog work the same as with SSH.
- If you uninstall emzee Setup from Homebrew Channel instead of using **Remove emzee completely**, the next boot notices that the package is gone. It removes the boot hook and `/media/developer/emzee` without mounting anything. This only happens when the install was done by emzee Setup.

### The Input button

webOS handles the Input button itself, so it opens LG's input screen even with emzee as Home. emzee opens its own Inputs sheet when it is launched with `{"emzee":"inputs"}`, so a button remapper only has to run one command. Use **LG Input Mapper** ([fivefold3/lginputmapper](https://github.com/fivefold3/lginputmapper)): it was built for webOS 24/25 (tested on a 2025 C5) and doesn't inject into LG's processes. The older LG Input Hook has reports of not working on webOS 24/25.
1. In Homebrew Channel → Settings → Add repository, enter `https://raw.githubusercontent.com/fivefold3/webos-homebrew-repo/main/repo.json`, then install LG Input Mapper and open it once.
2. Remap the Input button (press it when asked), choose **Run a command**, and enter:
   ```
   luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.home","params":{"emzee":"inputs"}}'
   ```
   ("Launch an app" alone would open emzee without the Inputs sheet.)
3. Pressing Input now brings emzee forward with its Inputs sheet open, from any app. Removing the mapping gives the button back to LG.

LG Input Mapper is a small community project, untested on a C2 or its remote.

**Show log** in emzee Setup shows the startup log (each step with seconds since power-on), the helper's log and Setup's own: `/tmp/emzee-boot.log`, `/tmp/emzee-helper.log` and `/tmp/emzee-setup.log`. They are cleared at each full restart.

### How the takeover works on webOS 25

It follows Glasshouse Home (`server/lib/home-takeover.js` and `samrescan.js`), the most widely used Home replacement for rooted LG TVs:
1. Bind-mount the staged launcher over `/usr/palm/applications/com.webos.app.home`. Its `appinfo.json` keeps LG's id, is a web app with `appCategory: ["home"]` (webOS 10/11 open the default app of that category for the Home key) and `visible: false`.
2. Make sam reread Home without restarting: `applicationManager/blockSystemApp` then `releaseBlockSystemApp` (with `forceBlockSystemApp: false` where the TV's schema asks for it), then poll `getAppInfo` until it reports type `web` (about 8 s at most). Restarting sam is only the fallback; Glasshouse found it is what left screens black, and CleanYourTV that it breaks other services.
3. Only then stop LG's Home process (`/usr/bin/com.webos.app.home`, or `flutter-client -i com.webos.app.home`). Where it was in front, sam opens Home again by itself, now as emzee; emzee asks once if it hasn't after 6 s.
4. The failsafe counts from when Home is in front. Every step has a fixed number of tries and runs once per boot, so nothing can loop: the worst case is LG's Home for that boot.

Giving LG's Home back is the same in reverse: unmount, reread, then close emzee's page.

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

## OLED rules

- The palette stays dim, and only the selected item is bright.
- The whole Home layer drifts ±10 px over 360 s.
- Idle hands the screen to the sky:
  - The sky drifts slowly, like a camera.
  - The clock moves every minute and keeps clear of the sun and moon.
  - Each new minute rises in, and the clock is tinted by the time of day.
  - A sky line shows the sunset time, or the moon phase and how lit it is.
  - At night there's the occasional shooting star.
  - After 15 minutes it fades nearly to black.
- The photo wallpaper is dimmed and pans slowly.
- Only `transform` and `opacity` animate.
- The sky is painted once into canvases and sprites, then only moved or faded:
  - an atmosphere with horizon haze and sun scattering, blended smoothly between phases
  - procedural cumulus lit from the sun's direction
  - a star field and Milky Way that turn ±2° over hours
  - a textured moon in its real phase
- A faint grain dithers the gradients so they don't band.
- Backdrop blur turns off by itself under about 40 fps.

## Credits and third-party services

emzee calls these services from the TV. Each has its own terms; the free tiers are meant for personal, non-commercial use.
- **Weather, air quality, normals and town search:** [Open-Meteo](https://open-meteo.com/) (data under CC BY 4.0; credited on the weather page).
- **Postcode lookup:** [Nominatim](https://nominatim.openstreetmap.org/), with data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). One lookup per postcode, cached.
- **Location from your connection:** [ipapi.co](https://ipapi.co/), falling back to [ipwho.is](https://ipwho.is/).
- **Fireplace video:** "Burning Logs in a Fireplace" by Volodymyr Kostiev on [Pexels](https://www.pexels.com/video/burning-logs-in-a-fireplace-13270910/), under the [Pexels licence](https://www.pexels.com/license/). Not included here.

Approaches adapted from other community projects, with thanks:
- **Home takeover (bind mount and sam rescan):** [Glasshouse](https://github.com/rorygallagher2024/glasshouse).
- **Helper, luna calls, weather caching and ipk packaging:** [CleanYourTV for webOS](https://github.com/lasharor/cleanyourtv-WebOS) (MIT).
- **Root through Homebrew Channel:** [webOS Homebrew](https://www.webosbrew.org/).

## Licence

[MIT](LICENSE).
