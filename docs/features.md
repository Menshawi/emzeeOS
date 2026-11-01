# Features and controls

## What's in it

- **Sky:** a canvas sky that follows the real sun and moon for your location (phase, sun arc, moon phase, stars, drifting clouds), with Apple Weather-style rain, drizzle, snow, fog and lightning from the live weather.
- **Dock:** your pinned apps and inputs. It magnifies like the Mac's, and a small light sits under the selected tile. **All apps** slides up underneath, with pin and Arrange.
- **Weather page:** wind, moon, sunrise and sunset, UV, feels like, precipitation, humidity, pressure, visibility, air quality, 24 hours and 10 days.
- **Settings:** location, °C/°F, 12/24-hour clock, screen saver timing and style, fireplace speed, and sky motion.
- **Screen saver:** the sky with a wandering clock, or a real 4K fireplace video with its crackle, looping seamlessly.
- **OLED-friendly throughout:** a dim palette, everything drifting slowly, and only `transform` and `opacity` animated (see [OLED rules](#oled-rules)).

## Controls

On Home:
- ↑ from the dock reaches the round gear by the weather; OK opens **Settings** (location, °C/°F, 12/24-hour clock, when the screen saver starts, calm or full sky motion, and a way into emzeeOS Setup). ◀ ▶ change a setting; it saves at once.
- → from the gear reaches the weather tile; OK (or a click) opens the **weather page** (after Apple Weather): the place and temperature over the live sky; cards for wind (compass), the moon, sunrise/sunset (arc), UV, feels like, precipitation, humidity, pressure (dial), visibility and air quality; Conditions for the next 24 hours and the next 10 days, each in temperature, rain or wind view (▲ ▼ switch view, ◀ ▶ scroll the hours, Back closes).
- Settings → Screen saver → Style: **Sky**, **Fireplace** (a real 4K wood fire with its crackle, boosted 2.5× since the clip is quiet, "Burning Logs in a Fireplace" by Volodymyr Kostiev on Pexels, at the **Fire speed** set just below it, 0.5× to 1×, 0.9× by default) or **Fireplace, silent**. It loops seamlessly: the helper serves the clip as fragmented MP4 (`service/fmp4.js`, converted on the fly, nothing stored twice) and the page appends it again and again through Media Source Extensions, so one decoder plays one continuous stream. Over the fire the clock shrinks to a small, faint time in the top-right corner. emzeeOS Setup carries the video (`media/fireplace.mp4`, 49 MB) and hard-links it into `data/` when it installs. Installed by hand, the TV downloads it once instead, and the sky shows until it has it.
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

