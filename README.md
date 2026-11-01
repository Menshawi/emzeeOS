<h1 align="center">emzeeOS</h1>

<p align="center"><b>A calm Home screen for rooted LG OLED TVs.</b><br>
A live sky that follows the real sun, moon and weather. A dock that magnifies like the Mac's. A fireplace screen saver that keeps your OLED safe.</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-blue"></a>
  <img alt="webOS" src="https://img.shields.io/badge/webOS-rooted%20LG%20OLED-a50034">
  <img alt="No build step" src="https://img.shields.io/badge/app-plain%20HTML%2FCSS%2FJS-lightgrey">
</p>

<!-- Hero capture: add docs/media/hero.gif (see docs/media/README.md), then uncomment the line below.
<p align="center"><img src="docs/media/hero.gif" alt="emzeeOS on an LG OLED: the sky, the dock, the fireplace" width="860"></p>
-->

## Why

LG's Home screen is full of ads and bright tiles, and it does nothing to protect an OLED. emzeeOS replaces it with something you'd actually leave on:

- **Live sky.** Sun arc, moon phase, stars, drifting clouds, and rain, snow, fog or lightning from the real weather where you live.
- **Dock.** Your pinned apps and inputs, magnifying like the Mac's. Pin, unpin and rearrange from the remote.
- **Weather page.** Wind, UV, air quality, 24 hours and 10 days, in the style of Apple Weather.
- **OLED-safe by design.** Dim palette, everything drifting slowly, only `transform` and `opacity` animated, and a screen saver that fades to near black.
- **Fireplace.** A crackling 4K fire that loops with no seam.
- **Safe to try.** Only writes to `/media/developer/emzee`, the takeover lasts until reboot, a failsafe returns LG's Home if emzeeOS doesn't start, and one button gives LG's Home back.

## Install in three steps

You need a TV rooted with [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) (running as root) and a Mac or Linux machine on the same network.

```sh
git clone https://github.com/Menshawi/emzeeOS && cd emzeeOS
tools/package.sh                          # builds dist/, with a Homebrew Channel repository
cd dist && python3 -m http.server 8096    # serve it on your network
```

On the TV:
1. Homebrew Channel → Settings → Repositories: add the `hbrepo/apps.json` URL that `package.sh` printed.
2. Install **emzeeOS Setup** and open it.
3. Press **Make emzeeOS my Home**.

Want it gone? Press **Give LG's Home back**, or **Remove emzeeOS completely**. Full walkthrough, SSH route and troubleshooting: [docs/install.md](docs/install.md).

## Tested on

| TV | webOS | Status |
| --- | --- | --- |
| LG OLED77C26LD (C2) | 25 | Works, daily driver |
| Other 2022–2025 OLEDs (C3, C4, G2, G3, B-series…) | 22–25 | Untested. **Reports welcome:** [open a compatibility report](../../issues/new?template=compatibility_report.yml) |

## Try it without a TV

```sh
tools/preview.sh        # http://localhost:8090/
```

The keyboard stands in for the remote. URL parameters like `?phase=dusk`, `?wx=snow` and `?idle=1` let you see every sky and weather state. See [docs/development.md](docs/development.md).

## Docs

- [Install, update, uninstall, SSH route](docs/install.md)
- [Features and controls](docs/features.md)
- [Development, layout, OLED rules](docs/development.md)
- [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## Help it grow

If emzeeOS made your TV nicer, a ⭐ helps other OLED owners find it. Post a photo of your setup in [Discussions](../../discussions), tell us which TV model works, or send a PR.

Built and used on an LG OLED77C26LD (C2) running webOS 25. Other models are untested.

> [!WARNING]
> **Use at your own risk.** emzeeOS replaces LG's Home screen on a **rooted** TV, using root through Homebrew Channel. Rooting your TV and running root code on it can void your warranty and, in the worst case, leave the TV unusable.
>
> emzeeOS is provided "as is", without warranty of any kind (see [LICENSE](LICENSE)). By installing it, you accept full responsibility for your TV. The author is not liable for any damage, data loss, voided warranty or other harm arising from its use.
>
> emzeeOS takes care to be safe: it only ever writes to `/media/developer/emzee`, its bind mount lasts until the next reboot, and a failsafe brings LG's Home back if emzeeOS doesn't start. But none of this is a guarantee.
>
> emzeeOS is an independent project. It is not affiliated with or endorsed by LG Electronics. "LG" and "webOS" are trademarks of their owners.

## Credits and third-party services

emzeeOS calls these services from the TV. Each has its own terms; the free tiers are meant for personal, non-commercial use.
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
