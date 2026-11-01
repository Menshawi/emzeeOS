# Developing emzeeOS

## Layout

- `app/js/api.js`: data, tried in order: the helper, then `PalmServiceBridge` luna calls, then demo data. Settings go to the helper, or to `localStorage` when there is no helper.
- `app/js/sky.js`, `clock.js`, `weather.js`: the sky (phase, sun arc, moon phase, stars, clouds), the clock and the weather.
- `app/js/focus.js`, `dock.js`, `inputs.js`, `arrange.js`: remote navigation (including hold OK), the dock (your pins), the inputs sheet and All apps (`arrange.js`: pinning and Arrange).
- `app/js/idle.js`, `fire.js`: the screen saver (after 2 minutes by default; nearly black after 15). The clock wanders the whole time; `fire.js` plays the fireplace.
- `app/js/settings.js`, `wxpage.js`: the Settings panel and the weather page.
- `service/`: `service.js` (HTTP), `luna.js` (time-limited `luna-send`), `apps.js`, `inputs.js`, `weather.js`, `location.js`, `fireplace.js`, `config.js`.
- `scripts/`: `install.sh`, `boot.sh`, `stage-home.sh`, `undo-home.sh`, `watchdog.sh` and `uninstall.sh`, plus `common.sh` and `stage-appinfo.js`.
- `takeover/`: **emzeeOS Setup** (`com.emzee.home`), which runs phase 3 without SSH. `app/` is the setup screen; `service/takeover.js` is a webOS JS service that Homebrew Channel elevates to root, and it runs the scripts above.
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

