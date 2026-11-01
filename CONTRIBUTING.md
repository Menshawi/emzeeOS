# Contributing

Thanks for helping. The most valuable contribution right now is a **[compatibility report](../../issues/new?template=compatibility_report.yml)** for a TV model we haven't tested.

## Ground rules
- The app (`app/`) is plain HTML, CSS and classic `<script>` files. No build step, no framework, no bundler. Keep it that way.
- Follow the [OLED rules](docs/development.md#oled-rules): dim palette, only `transform` and `opacity` animate, nothing static and bright.
- Anything that touches `scripts/` or `takeover/` runs as root on someone's TV. Keep it small, keep the failsafe intact, and describe how you tested it.
- Don't commit the fireplace video (Pexels licence).

## Run it locally
```sh
tools/preview.sh   # http://localhost:8090/, keyboard stands in for the remote
```
See [docs/development.md](docs/development.md) for URL parameters and the code layout.

## Pull requests
Keep them focused, say which TV and webOS version you tested on (or that you only used the preview), and add a line to [CHANGELOG.md](CHANGELOG.md).

Good first ideas: new sky or weather touches, translations of the UI, more input/app icons, docs fixes, and compatibility notes.
