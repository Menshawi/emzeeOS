# Media for the README

The README expects `hero.gif` here (about 860 px wide, under 8 MB, 10–15 s loop). Suggested shots: the sky at dusk, the dock magnifying as you move along it, the weather page, then the fireplace.

Capture from the TV with a phone on a tripod (best), or from the preview: `tools/preview.sh`, then `?hour=17.4` for a sunset and `?idle=1` for the screen saver. Convert with:

```sh
ffmpeg -i capture.mp4 -vf "fps=15,scale=860:-1:flags=lanczos" -loop 0 hero.gif
```

Add more photos here and reference them from the README.
