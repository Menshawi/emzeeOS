// Sky: a painted atmosphere that follows the real sun, procedural clouds, a turning star field and the real moon.
// Everything is rendered once into canvases or sprites; on screen only transform and opacity ever animate.
// Base colours are the canvas palettes; between phases they blend smoothly instead of jumping.
(function () {
  // dim on purpose: OLED-friendly, no bright full-screen blue
  var P = {
    night: { sky: 'linear-gradient(180deg,#010208 0%,#050A1C 55%,#0B1430 100%)', horizon: 'rgba(40,60,120,.25)', cloud: 'rgba(110,125,170,.16)', core: '#000', glow: 'transparent' },
    dawn: { sky: 'linear-gradient(180deg,#0A0F2A 0%,#2A2550 40%,#7A4258 72%,#C9714C 100%)', horizon: 'rgba(255,150,90,.45)', cloud: 'rgba(255,190,175,.30)', core: '#FFE2B8', glow: 'rgba(255,170,100,.45)' },
    day: { sky: 'linear-gradient(180deg,#08203F 0%,#154270 45%,#3C6E9C 80%,#6A93B5 100%)', horizon: 'rgba(170,205,235,.25)', cloud: 'rgba(240,245,255,.30)', core: '#FFF4DA', glow: 'rgba(255,240,200,.40)' },
    dusk: { sky: 'linear-gradient(180deg,#0B1030 0%,#322556 38%,#8A3E52 70%,#D9673A 100%)', horizon: 'rgba(255,120,60,.50)', cloud: 'rgba(255,165,130,.28)', core: '#FFD09A', glow: 'rgba(255,140,70,.50)' }
  };
  // fixed hours for ?phase= testing
  var FIXED = { dawn: 7.3, day: 12.5, dusk: 17.2, night: 22.5 };
  // clouds per cover: far ones sit low and small near the horizon, near ones high and large
  var LAYOUT = { clear: [2, 1], 'partly cloudy': [3, 4], cloudy: [5, 7] };
  var BLEND = 0.4; // hours either side of a phase boundary over which palettes cross-fade

  var rise = 7.0, set = 17.5;
  var cover = 'partly cloudy';
  var forced = (location.search.match(/[?&]phase=(dawn|day|dusk|night)\b/) || [])[1] || null;
  var fixedHour = (location.search.match(/[?&]hour=(\d+(?:\.\d+)?)/) || [])[1]; // ?hour=17.6 for testing
  fixedHour = fixedHour == null ? null : +fixedHour;
  var current = null;
  var sky, stars, horizon, sun, moon, clouds, fill;
  var bodyPos = { x: -999, y: -999 }; // where the sun or moon is, for layouts that should keep clear of it

  // ---------- small maths ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a.map(function (v, i) { return v + (b[i] - v) * t; }); }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? (c[3] == null ? 1 : c[3]) : a).toFixed(3) + ')'; }
  function hm(s) { var p = String(s).split(':'); return +p[0] + (+p[1] || 0) / 60; }

  function rng(seed) { // mulberry32
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // value noise + fractal sum, seeded, good enough for clouds and the Milky Way
  function noise2(seed) {
    var r = rng(seed), p = new Uint8Array(512), v = new Float32Array(256), i;
    for (i = 0; i < 256; i++) { p[i] = i; v[i] = r(); }
    for (i = 255; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 256; i++) p[i + 256] = p[i];
    function at(x, y) { return v[p[(p[x & 255] + y) & 255]]; }
    function n(x, y) {
      var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      var u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
      var a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
      return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
    }
    return function fbm(x, y, oct) {
      var s = 0, amp = 0.5, f = 1, norm = 0;
      for (var o = 0; o < oct; o++) { s += amp * n(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.03; }
      return s / norm;
    };
  }

  // ---------- palettes ----------
  var N = 9; // gradient samples, so palettes with different stop counts can blend
  function parseColor(s) {
    if (s === 'transparent') return [0, 0, 0, 0];
    if (s.charAt(0) === '#') {
      var h = s.length === 4 ? s.replace(/[0-9a-f]/gi, '$&$&') : s; // #000 -> #000000
      return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16), 1];
    }
    var m = s.match(/[\d.]+/g).map(Number);
    return [m[0], m[1], m[2], m[3] == null ? 1 : m[3]];
  }
  function parsePalette(p) {
    var stops = [], re = /#([0-9a-f]{6})\s+(\d+)%/gi, m;
    while ((m = re.exec(p.sky))) stops.push({ at: +m[2] / 100, c: parseColor('#' + m[1]) });
    var samples = [];
    for (var i = 0; i < N; i++) {
      var x = i / (N - 1), k = 0;
      while (k < stops.length - 2 && x > stops[k + 1].at) k++;
      var a = stops[k], b = stops[k + 1];
      samples.push(mix(a.c, b.c, clamp((x - a.at) / (b.at - a.at), 0, 1)));
    }
    return { sky: samples, horizon: parseColor(p.horizon), cloud: parseColor(p.cloud), core: parseColor(p.core), glow: parseColor(p.glow) };
  }
  var PAL = {};
  Object.keys(P).forEach(function (k) { PAL[k] = parsePalette(P[k]); });

  function phaseAt(hour) {
    return hour < rise - 0.6 || hour >= set + 0.9 ? 'night' : hour < rise + 1.1 ? 'dawn' : hour < set - 0.8 ? 'day' : 'dusk';
  }

  // the palette for this exact hour: one phase, or two blended near a boundary
  function paletteAt(hour) {
    var bounds = [[rise - 0.6, 'night', 'dawn'], [rise + 1.1, 'dawn', 'day'], [set - 0.8, 'day', 'dusk'], [set + 0.9, 'dusk', 'night']];
    var a = phaseAt(hour), b = a, w = 0;
    if (!forced) {
      bounds.forEach(function (bd) {
        if (Math.abs(hour - bd[0]) < BLEND) { a = bd[1]; b = bd[2]; w = smooth(bd[0] - BLEND, bd[0] + BLEND, hour); }
      });
    }
    var A = PAL[a], B = PAL[b];
    var night = (a === 'night' ? 1 - w : 0) + (b === 'night' ? w : 0);
    return {
      sky: A.sky.map(function (c, i) { return mix(c, B.sky[i], w); }),
      horizon: mix(A.horizon, B.horizon, w), cloud: mix(A.cloud, B.cloud, w),
      core: mix(A.core, B.core, w), glow: mix(A.glow, B.glow, w),
      night: night, key: a + b + Math.round(w * 4)
    };
  }

  // ---------- atmosphere: one small canvas, scaled up (gradients stay smooth; grain hides banding) ----------
  var FW = 480, FH = 270, FS = FW / 1920;
  function paintSky(cv, pal, sx, sy, mx, my) {
    var g = cv.getContext('2d');
    var lin = g.createLinearGradient(0, 0, 0, FH);
    pal.sky.forEach(function (c, i) { lin.addColorStop(i / (N - 1), rgba(c, 1)); });
    g.fillStyle = lin; g.fillRect(0, 0, FW, FH);

    var day = 1 - pal.night, hz = pal.horizon, gl = pal.glow;
    // aerial perspective: the air near the horizon is paler and hazier
    var haze = g.createLinearGradient(0, FH * 0.45, 0, FH);
    haze.addColorStop(0, rgba(hz, 0)); haze.addColorStop(1, rgba(hz, hz[3] * 0.5));
    g.fillStyle = haze; g.fillRect(0, 0, FW, FH);

    // the bright band of horizon light under the sun, much wider than tall
    g.save();
    g.translate(sx * FS, FH); g.scale(2.6, 1);
    var band = g.createRadialGradient(0, 0, 0, 0, 0, FH * 0.62);
    band.addColorStop(0, rgba(hz, hz[3] * 0.9)); band.addColorStop(0.5, rgba(hz, hz[3] * 0.3)); band.addColorStop(1, rgba(hz, 0));
    g.fillStyle = band; g.fillRect(-FW, -FH, FW * 2, FH * 2);
    g.restore();

    if (day > 0.01 && gl[3] > 0) {
      // forward scattering around the sun: wide soft bloom, then a tighter warm aureole
      var x = sx * FS, y = sy * FS;
      var wide = g.createRadialGradient(x, y, 0, x, y, FH * 1.15);
      wide.addColorStop(0, rgba(gl, gl[3] * 0.55 * day)); wide.addColorStop(0.35, rgba(gl, gl[3] * 0.18 * day)); wide.addColorStop(1, rgba(gl, 0));
      g.fillStyle = wide; g.fillRect(0, 0, FW, FH);
      var tight = g.createRadialGradient(x, y, 0, x, y, FH * 0.22);
      tight.addColorStop(0, rgba(pal.core, 0.32 * day)); tight.addColorStop(1, rgba(pal.core, 0));
      g.fillStyle = tight; g.fillRect(0, 0, FW, FH);
    }
    if (pal.night > 0.01) {
      // moonlight scattered in the air, and a faint green-grey airglow along the horizon
      var mg = g.createRadialGradient(mx * FS, my * FS, 0, mx * FS, my * FS, FH * 0.55);
      mg.addColorStop(0, 'rgba(150,170,220,' + (0.11 * pal.night).toFixed(3) + ')'); mg.addColorStop(1, 'rgba(150,170,220,0)');
      g.fillStyle = mg; g.fillRect(0, 0, FW, FH);
      var air = g.createLinearGradient(0, FH * 0.7, 0, FH);
      air.addColorStop(0, 'rgba(60,95,100,0)'); air.addColorStop(1, 'rgba(60,95,100,' + (0.07 * pal.night).toFixed(3) + ')');
      g.fillStyle = air; g.fillRect(0, 0, FW, FH);
    }
    if (cover === 'cloudy') {
      // overcast: a grey, flattening veil over everything
      var mid = pal.sky[5], lum = mid[0] * 0.3 + mid[1] * 0.59 + mid[2] * 0.11;
      g.fillStyle = rgba(mix(mid, [lum, lum, lum], 0.7), 0.3);
      g.fillRect(0, 0, FW, FH);
    }
    // the weather itself, painted into the sky (no extra layer): rain and storms lower and darken it, snow
    // pales it to a cool grey, fog lays a thick haze from the ground up
    var k = wx.kind, st = wx.strength;
    if (k === 'rain' || k === 'drizzle' || k === 'storm') {
      g.fillStyle = 'rgba(' + (k === 'storm' ? '14,16,24' : '34,40,52') + ',' + (0.22 + 0.3 * st).toFixed(3) + ')';
      g.fillRect(0, 0, FW, FH);
    } else if (k === 'snow') {
      g.fillStyle = 'rgba(150,160,175,' + (0.12 + 0.16 * st).toFixed(3) + ')';
      g.fillRect(0, 0, FW, FH);
    } else if (k === 'fog') {
      var fog = g.createLinearGradient(0, 0, 0, FH);
      var fc = pal.night > 0.5 ? '70,76,88' : '170,176,184';
      fog.addColorStop(0, 'rgba(' + fc + ',0.18)'); fog.addColorStop(0.55, 'rgba(' + fc + ',0.45)'); fog.addColorStop(1, 'rgba(' + fc + ',0.62)');
      g.fillStyle = fog; g.fillRect(0, 0, FW, FH);
    }
  }

  // a faint signed noise tile above the sky: dithers 8-bit gradients so they never band on the OLED
  function grain() {
    var c = document.createElement('canvas'), S = 128;
    c.width = c.height = S;
    var g = c.getContext('2d'), img = g.createImageData(S, S), r = rng(7);
    for (var i = 0; i < S * S; i++) {
      var v = r() * 2 - 1, k = i * 4, on = v > 0 ? 255 : 0;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = on;
      img.data[k + 3] = Math.round(Math.abs(v) * 7);
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  // ---------- clouds ----------
  // Procedural sprites, rendered small and scaled up softly.
  // Cumulus: a union of billows (spheres with noise-roughened edges) gives a real height field, so each
  // billow is shaded by the sun's direction; the base is flat and soft, tops are sunlit, undersides grey.
  // Stratus: a stretched fractal streak, lit the same way.
  // Cumulus only: the thin stratus streaks ('st', still drawable below) came out as glitchy stripes on the TV
  // (a C2 on webOS 25) while looking fine in desktop Chrome, so they are left out of the sky.
  var KINDS = [['cu', 11], ['cu', 23], ['cu', 37]];
  // separable box blur, in place
  function blur(f, W, H, r) {
    var t = new Float32Array(W * H), x, y, acc, n = 2 * r + 1;
    for (y = 0; y < H; y++) {
      acc = 0;
      for (x = -r; x <= r; x++) acc += f[y * W + clamp(x, 0, W - 1)];
      for (x = 0; x < W; x++) {
        t[y * W + x] = acc / n;
        acc += f[y * W + clamp(x + r + 1, 0, W - 1)] - f[y * W + clamp(x - r, 0, W - 1)];
      }
    }
    for (x = 0; x < W; x++) {
      acc = 0;
      for (y = -r; y <= r; y++) acc += t[clamp(y, 0, H - 1) * W + x];
      for (y = 0; y < H; y++) {
        f[y * W + x] = acc / n;
        acc += t[clamp(y + r + 1, 0, H - 1) * W + x] - t[clamp(y - r, 0, H - 1) * W + x];
      }
    }
  }

  function billows(seed, W, H) {
    var r = rng(seed), out = [], n, i, b;
    var base = H * 0.66, span = W * 0.78, left = W * 0.11;
    n = 4 + Math.floor(r() * 3);          // a broad, uneven bottom row
    for (i = 0; i < n; i++) out.push([left + span * (i + 0.5) / n + (r() - 0.5) * 22, base - r() * 10, W * (0.07 + r() * 0.08)]);
    n = 3 + Math.floor(r() * 2);          // a narrower middle row
    for (i = 0; i < n; i++) out.push([W * 0.22 + W * 0.56 * (i + 0.5) / n + (r() - 0.5) * 26, base - H * (0.18 + r() * 0.12), W * (0.07 + r() * 0.07)]);
    n = 1 + Math.floor(r() * 2);          // a towering top
    for (i = 0; i < n; i++) out.push([W * (0.36 + r() * 0.28), base - H * (0.36 + r() * 0.1), W * (0.06 + r() * 0.04)]);
    // small sub-billows bubbling up along the upper rims: the cauliflower look
    var big = out.length;
    for (i = 0; i < big; i++) {
      b = out[i];
      for (var k = 0; k < 3; k++) {
        var ang = -Math.PI * (0.18 + r() * 0.64), d = b[2] * (0.75 + r() * 0.2);
        out.push([b[0] + Math.cos(ang) * d, b[1] + Math.sin(ang) * d, b[2] * (0.28 + r() * 0.22)]);
      }
    }
    return out;
  }

  // The costly part of a cloud, its shape (height field, coverage, texture), doesn't depend on the light or
  // the colours, so it is worked out once per cloud and kept; re-lighting only redoes the shading below.
  var shapes = {};
  function cloudShape(kind, seed) {
    var cu = kind === 'cu', W = cu ? 320 : 420, H = cu ? 180 : 90;
    var fbm = noise2(seed), z = new Float32Array(W * H), a = new Float32Array(W * H), x, y, i, j;
    var ox = seed * 3.1, oy = seed * 1.7;
    if (cu) {
      var B = billows(seed, W, H), base = H * 0.66 + W * 0.06;
      for (y = 0; y < H; y++) {
        for (x = 0; x < W; x++) {
          var rough = (fbm(x / 38 + ox, y / 38 + oy, 3) - 0.5) * 0.4;  // cauliflower edges
          // smooth union of the billows (a p-norm, not max) so they merge without creases
          var sum = 0;
          for (j = 0; j < B.length; j++) {
            var b = B[j], dx = x - b[0], dy = y - b[1];
            var rr = b[2] * (1 + rough), q = rr * rr - dx * dx - dy * dy;
            if (q > 0) { var h = Math.sqrt(q); sum += h * h * h; }
          }
          var best = Math.cbrt(sum);
          i = y * W + x;
          z[i] = best;
          // coverage: thin, translucent rims thickening inward, and a flat base that fades instead of cutting
          a[i] = smooth(0, 16, best) * (0.55 + 0.45 * smooth(8, 40, best)) * (1 - smooth(base - 14, base + 8, y));
        }
      }
    } else {
      for (y = 0; y < H; y++) {
        for (x = 0; x < W; x++) {
          var nx = x / W, ny = y / H, sx = (nx - 0.5) / 0.48, sy = (ny - 0.5) / 0.4;
          var d = clamp((1 - sx * sx - sy * sy) * 0.95 + (fbm(nx * 6 + ox, ny * 2 + oy, 4) - 0.5) * 1.8 - 0.25, 0, 1);
          i = y * W + x;
          z[i] = d * 18; a[i] = smooth(0.02, 0.6, d);
        }
      }
    }
    blur(z, W, H, 3); blur(z, W, H, 3);   // soften the height field: rounded billows, no seams
    var tex = new Float32Array(W * H);    // a little texture, not rock
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) tex[y * W + x] = fbm(x / 14 + ox, y / 14 + oy, 3);
    return { cu: cu, W: W, H: H, z: z, a: a, tex: tex };
  }

  function cloudSprite(kind, seed, pal, lightX, lightY, done) {
    var sh = shapes[kind + seed] || (shapes[kind + seed] = cloudShape(kind, seed));
    var cu = sh.cu, W = sh.W, H = sh.H, z = sh.z, a = sh.a, tex = sh.tex, x, y, i;
    // light comes from above, from the sun's side, and a little toward us
    var L = [lightX * 0.45, lightY, 0.55], ln = Math.sqrt(L[0] * L[0] + L[1] * L[1] + L[2] * L[2]);
    L = [L[0] / ln, L[1] / ln, L[2] / ln];
    var lit = mix(pal.cloud, pal.core, clamp(pal.glow[3] * 0.75, 0, 0.5));
    var shade = mix(pal.sky[4], pal.cloud.map(function (c) { return c * 0.36; }), 0.55);
    var maxA = clamp(pal.cloud[3] * 2.1, 0.3, 0.66);
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'), img = g.createImageData(W, H), out = img.data;
    for (y = 1; y < H - 1; y++) {
      for (x = 1; x < W - 1; x++) {
        i = y * W + x;
        if (a[i] <= 0.003) continue;
        // surface normal from the height field
        var gx = (z[i + 1] - z[i - 1]) * 0.5, gy = (z[i + W] - z[i - W]) * 0.5;
        var nl = Math.sqrt(gx * gx + gy * gy + 1);
        var lam = clamp((-gx * L[0] - gy * L[1] + L[2]) / nl, 0, 1);
        var l = 0.3 + 0.7 * lam;                                         // sky light fills the shadows
        l *= 0.7 + 0.3 * (1 - y / H);                                   // undersides greyer
        l *= 0.96 + 0.08 * tex[i];
        l = clamp(l, 0, 1);
        var k = i * 4;
        out[k] = shade[0] + (lit[0] - shade[0]) * l;
        out[k + 1] = shade[1] + (lit[1] - shade[1]) * l;
        out[k + 2] = shade[2] + (lit[2] - shade[2]) * l;
        out[k + 3] = a[i] * maxA * 255;
      }
    }
    g.putImageData(img, 0, 0);
    // one soft blur pass (where supported) so the scaled-up sprite reads as vapour, not pixels
    var soft = document.createElement('canvas'); soft.width = W; soft.height = H;
    var sg = soft.getContext('2d');
    if (typeof sg.filter === 'string') sg.filter = 'blur(' + (cu ? 1.6 : 2.2) + 'px)';
    sg.drawImage(c, 0, 0);
    // toBlob encodes off the main thread; the data-URL fallback blocks while it encodes
    if (soft.toBlob && window.URL && URL.createObjectURL) {
      soft.toBlob(function (blob) {
        done(blob ? { url: URL.createObjectURL(blob), blob: true, w: W, h: H, kind: kind } : { url: soft.toDataURL('image/png'), w: W, h: H, kind: kind });
      }, 'image/png');
    } else done({ url: soft.toDataURL('image/png'), w: W, h: H, kind: kind });
  }

  // ---------- weather in the sky ----------
  // wx comes from the forecast (weather.js -> setWeather): clear | partly | cloudy | fog | drizzle | rain | snow | storm
  var wx = { kind: (location.search.match(/[?&]wx=(\w+)/) || [])[1] || 'clear', strength: 0.7 }, wind = 1;
  if (wx.kind === 'clear') wx.strength = 0;

  // ---------- rain, snow and fog: layered particles ----------
  // Inspired by Apple Weather: every drop or flake is its own particle at a depth (far ones small, faint and slow,
  // near ones long, bright and fast), so the eye reads distance and nothing repeats like a tiled pattern. Drawn on
  // one half-size canvas, scaled up 2x (softening the streaks the way motion blur does), at 30 fps, from a few
  // pre-rendered sprites, so each frame is a few hundred cheap image copies. It waits while a screen slides
  // (EZ.hold), stops while hidden, and holds still in calm motion.
  var FX_W = 960, FX_H = 540, FX_STEP = 1000 / 30;
  var fx = { canvas: null, g: null, kind: null, parts: [], fog: [], sprites: null, last: 0, slant: 0, running: false };

  function sprite(w, h, paint) { var c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); return c; }
  function fxSprites() {
    // a rain streak: brightest at its falling end, soft at the sides
    function streak(alpha) {
      return sprite(6, 64, function (g, w, h) {
        var lg = g.createLinearGradient(0, 0, 0, h);
        lg.addColorStop(0, 'rgba(210,222,240,0)'); lg.addColorStop(0.7, 'rgba(215,226,242,' + alpha * 0.7 + ')'); lg.addColorStop(1, 'rgba(225,234,248,' + alpha + ')');
        var sg = g.createLinearGradient(0, 0, w, 0);
        g.fillStyle = lg; g.fillRect(1.5, 0, 3, h);
        g.globalCompositeOperation = 'destination-in';
        sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.5, 'rgba(0,0,0,1)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sg; g.fillRect(0, 0, w, h);
      });
    }
    function flake(r, alpha) {
      return sprite(r * 2 + 2, r * 2 + 2, function (g, w) {
        var c = w / 2, rg = g.createRadialGradient(c, c, 0, c, c, r);
        rg.addColorStop(0, 'rgba(250,252,255,' + alpha + ')'); rg.addColorStop(0.45, 'rgba(245,248,255,' + alpha * 0.75 + ')'); rg.addColorStop(1, 'rgba(240,245,255,0)');
        g.fillStyle = rg; g.fillRect(0, 0, w, w);
      });
    }
    // a bank of mist: soft fractal noise, faded at every edge
    function mist(seed) {
      return sprite(640, 180, function (g, w, h) {
        var img = g.createImageData(w, h), f = noise2(seed);
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
          var ex = Math.min(x, w - x) / (w * 0.3), ey = Math.min(y, h - y) / (h * 0.45);
          var edge = clamp(Math.min(ex, ey), 0, 1), v = smooth(0.35, 0.8, f(x / 90, y / 45, 4)) * edge * edge;
          var k = (y * w + x) * 4;
          img.data[k] = img.data[k + 1] = 214; img.data[k + 2] = 222; img.data[k + 3] = v * 150;
        }
        g.putImageData(img, 0, 0);
      });
    }
    return { streak: [streak(0.35), streak(0.6), streak(0.9)], flake: [flake(2, 0.6), flake(3.5, 0.8), flake(6, 0.9)], mist: [mist(5), mist(9), mist(13)] };
  }

  // depth 0 (far) .. 2 (near); counts and speeds per kind and strength (pixels on the half-size canvas)
  function spawn(p, kind, top) {
    var d = Math.random(), layer = d < 0.55 ? 0 : d < 0.85 ? 1 : 2;
    p.layer = layer;
    p.x = Math.random() * (FX_W + 80) - 40;
    if (kind === 'snow') {
      p.y = top ? -10 - Math.random() * 40 : Math.random() * FX_H;
      p.v = [14, 26, 44][layer] * (0.8 + Math.random() * 0.4);
      p.sway = 6 + Math.random() * [6, 10, 16][layer]; p.freq = 0.4 + Math.random() * 0.6; p.ph = Math.random() * 6.3;
    } else {
      var drizzle = kind === 'drizzle';
      p.len = (drizzle ? [5, 9, 15] : [10, 18, 30])[layer] * (0.7 + Math.random() * 0.6);
      p.v = (drizzle ? [260, 380, 520] : [420, 620, 860])[layer] * (0.85 + Math.random() * 0.3);
      p.y = top ? -p.len - Math.random() * FX_H * 0.5 : Math.random() * FX_H;
    }
    return p;
  }

  function fxCount(kind, st) {
    return kind === 'snow' ? Math.round(60 + 120 * st) : kind === 'drizzle' ? Math.round(35 + 55 * st) : Math.round(80 + 200 * st);
  }

  function frame(dt, t) {
    var g = fx.g, k = fx.kind, sp = fx.sprites, i, p;
    g.clearRect(0, 0, FX_W, FX_H);
    // mist banks first (fog, and a little low mist in heavy rain), drifting slowly with the wind
    for (i = 0; i < fx.fog.length; i++) {
      var m = fx.fog[i];
      m.x += m.v * dt;
      if (m.x > FX_W + 40) m.x = -m.w - 40;
      g.globalAlpha = m.a;
      g.drawImage(sp.mist[i % 3], m.x, m.y, m.w, m.h);
    }
    g.globalAlpha = 1;
    if (k === 'snow') {
      for (i = 0; i < fx.parts.length; i++) {
        p = fx.parts[i];
        p.y += p.v * dt;
        if (p.y > FX_H + 10) spawn(p, k, true);
        var fl = sp.flake[p.layer], x = p.x + Math.sin(t * p.freq + p.ph) * p.sway + fx.slant * p.y * 0.5;
        g.drawImage(fl, x - fl.width / 2, p.y - fl.height / 2);
      }
    } else if (k) {
      // the slant follows the wind; each streak is the sprite stretched to its length and sheared along the slant
      var sl = fx.slant;
      for (i = 0; i < fx.parts.length; i++) {
        p = fx.parts[i];
        p.y += p.v * dt; p.x += sl * p.v * dt;
        if (p.y > FX_H + 4 || p.x < -60 || p.x > FX_W + 60) spawn(p, k, true);
        g.setTransform(1, 0, -sl, 1, p.x, p.y);
        g.drawImage(sp.streak[p.layer], -3, -p.len, 6, p.len);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  function fxLoop(t) {
    if (!fx.kind && !fx.fog.length) { fx.running = false; return; }
    if (document.hidden) { fx.running = false; fx.last = 0; return; }
    requestAnimationFrame(fxLoop);
    var calm = document.body.classList.contains('calm');
    if (fx.last && t - fx.last < FX_STEP) return;
    if ((Date.now() < EZ.quietUntil || document.body.classList.contains('fire')) && fx.last) { fx.last = t; return; }   // a screen is sliding, or the fireplace covers the sky
    var dt = fx.last ? Math.min((t - fx.last) / 1000, 0.1) : 0;
    fx.last = t;
    if (calm && fx.drawn) return;   // calm motion: one still frame
    fx.drawn = true;
    var t0 = performance.now();
    frame(calm ? 0 : dt, t / 1000);
    // for the smoothness log: how long drawing takes, and a 2 s frame sample every couple of minutes
    fx.cost = (fx.cost || 0) * 0.95 + (performance.now() - t0) * 0.05;
    if (!calm && Date.now() - (fx.sampled || 0) > 120000) {
      fx.sampled = Date.now();
      EZ.perf('weather fx ' + (fx.kind || 'fog') + ' (draw ' + fx.cost.toFixed(1) + ' ms)', 2000);
    }
  }

  function applyFall() {
    var el = EZ.$('#fall'), k = wx.kind === 'storm' ? 'rain' : wx.kind;
    var want = k === 'rain' || k === 'drizzle' || k === 'snow' ? k : null, foggy = wx.kind === 'fog';
    if (!fx.canvas) {
      fx.canvas = document.createElement('canvas'); fx.canvas.width = FX_W; fx.canvas.height = FX_H;
      fx.canvas.className = 'fx';
      fx.g = fx.canvas.getContext('2d');
      el.appendChild(fx.canvas);
    }
    if (want || foggy) fx.sprites = fx.sprites || fxSprites();
    if (want !== fx.kind) {
      fx.kind = want; fx.parts = [];
      for (var i = 0; want && i < fxCount(want, wx.strength); i++) fx.parts.push(spawn({}, want, false));
    } else if (want) {
      var n = fxCount(want, wx.strength);
      while (fx.parts.length < n) fx.parts.push(spawn({}, want, true));
      fx.parts.length = n;
    }
    // mist: three banks for fog, one faint low one in heavy rain
    var banks = foggy ? 3 : want === 'rain' && wx.strength > 0.6 ? 1 : 0;
    if (fx.fog.length !== banks) {
      fx.fog = [];
      for (var b = 0; b < banks; b++) {
        fx.fog.push({ x: Math.random() * FX_W - 300, y: foggy ? 200 + b * 95 : 380, w: foggy ? 900 : 1000, h: foggy ? 260 : 200,
          v: (foggy ? 6 + b * 4 : 10) * wind, a: foggy ? 0.55 - b * 0.1 : 0.25 });
      }
    }
    fx.drawn = false;
    el.className = want || foggy ? 'on' : '';
    el.style.opacity = want || foggy ? '1' : '0';
    if ((want || foggy) && !fx.running) { fx.running = true; fx.last = 0; requestAnimationFrame(fxLoop); }
  }

  // Thunderstorms: a soft flash in the clouds now and then (not in calm motion, not while hidden or idle-dark)
  var flashTimer = null;
  function lightning() {
    clearTimeout(flashTimer);
    if (wx.kind !== 'storm') return;
    flashTimer = setTimeout(function () {
      var f = EZ.$('#flash');
      if (!document.hidden && !document.body.classList.contains('calm') && !document.body.classList.contains('deep')) {
        f.style.setProperty('--fx', Math.round(20 + Math.random() * 60) + '%');
        f.style.setProperty('--fy', Math.round(8 + Math.random() * 25) + '%');
        f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      }
      lightning();
    }, 18000 + Math.random() * 22000);
  }

  var sprites = [], spriteKey = null, spriteJob = 0;
  // when the page has nothing else to do, so neither the first paint nor a key press waits on clouds
  var whenIdle = window.requestIdleCallback
    ? function (f) { window.requestIdleCallback(f, { timeout: 2000 }); }
    : function (f) { setTimeout(f, 16); };
  // one sprite per idle slot
  function makeSprites(pal, lightX, lightY, done) {
    var job = ++spriteJob, out = [];
    (function next() {
      whenIdle(function () {
        if (job !== spriteJob) return;
        var k = KINDS[out.length];
        cloudSprite(k[0], k[1], pal, lightX, lightY, function (sp) {
          if (job !== spriteJob) { if (sp.blob) URL.revokeObjectURL(sp.url); return; }
          out.push(sp);
          if (out.length < KINDS.length) next(); else done(out);
        });
      });
    })();
  }

  var cloudEls = [], layoutCover = null;
  function layoutClouds() {
    if (layoutCover === cover) return;
    layoutCover = cover;
    clouds.innerHTML = ''; cloudEls = [];
    var L = LAYOUT[cover] || LAYOUT['partly cloudy'], r = rng(101), k;
    function add(far) {
      var el = EZ.el('div', 'cloud' + (far ? ' far' : ''));
      var s = far ? 0.42 + r() * 0.25 : 0.9 + r() * 0.45;
      el.style.top = Math.round(far ? 400 + r() * 200 : 20 + r() * 300) + 'px';
      el.style.setProperty('--s', s.toFixed(2));
      el.style.opacity = (far ? 0.55 + r() * 0.2 : 0.85 + r() * 0.15).toFixed(2);
      el._dur = far ? 380 + r() * 160 : 170 + r() * 90;   // seconds to cross
      el._off = r() * el._dur;
      el._s = s.toFixed(2);
      el._kind = Math.floor(r() * KINDS.length);
      clouds.appendChild(el); cloudEls.push(el);
    }
    for (k = 0; k < L[0]; k++) add(true);
    for (k = 0; k < L[1]; k++) add(false);
    applySprites();
  }
  // Cloud drift: all clouds step together from one loop at 24 fps. They move 7-22 px a second, so the
  // steps don't show, and the TV redraws the sky 24 times a second instead of 60 (seven CSS animations
  // out of step kept it redrawing every frame). Stops by itself while the page is hidden.
  // Each cloud keeps its own position and moves by speed × time, so stopping and starting never jumps.
  // Calm motion (Settings) eases the drift down to a standstill over a couple of seconds, and back up when
  // it's turned off; while fully still, nothing is written and the TV redraws nothing.
  var FROM = -1400, SPAN = 3800, STEP = 1000 / 24, lastDrift = 0, pace = 1;
  function drift(t) {
    if (document.hidden) { lastDrift = 0; return; }
    requestAnimationFrame(drift);
    if (lastDrift && t - lastDrift < STEP) return;
    // a screen is sliding (EZ.hold), or the fireplace covers the sky: the clouds wait rather than add work
    if ((Date.now() < EZ.quietUntil || document.body.classList.contains('fire')) && lastDrift) { lastDrift = t; return; }
    var dt = lastDrift ? Math.min((t - lastDrift) / 1000, 0.25) : 0;
    lastDrift = t;
    var target = document.body.classList.contains('calm') ? 0 : 1;
    pace += (target - pace) * Math.min(1, dt * 1.6);
    if (Math.abs(target - pace) < 0.002) pace = target;
    var still = pace === 0;
    for (var i = 0; i < cloudEls.length; i++) {
      var el = cloudEls[i];
      if (el._x == null) el._x = FROM + (el._off / el._dur) * SPAN;   // first placement
      else if (still) continue;
      else {
        el._x += (SPAN / el._dur) * dt * pace * wind;
        if (el._x > FROM + SPAN) el._x -= SPAN;
      }
      el.style.transform = 'translate3d(' + el._x.toFixed(1) + 'px,0,0) scale(' + el._s + ')';
    }
  }

  // swap images in place, so drifting clouds keep their positions when colours change
  function applySprites() {
    if (!sprites.length) return;
    cloudEls.forEach(function (el) {
      var sp = sprites[el._kind];
      el.style.width = Math.round(sp.w * 2.6) + 'px';
      el.style.height = Math.round(sp.h * 2.6) + 'px';
      el.style.backgroundImage = 'url(' + sp.url + ')';
    });
  }

  // ---------- stars ----------
  // A star field painted once at half size: ~700 stars by a power law of brightness, tinted by temperature,
  // thinning toward the horizon, over a faint Milky Way. The whole layer turns very slowly (sky.css).
  var starsBuilt = false;
  function buildStars() {
    if (starsBuilt) return;
    starsBuilt = true;
    var CW = 1100, CH = 600, c = document.createElement('canvas');
    c.width = CW; c.height = CH; c.className = 'field';
    var g = c.getContext('2d'), r = rng(2024);

    // Milky Way: a diagonal band of fractal glow with a darker dust lane down its middle
    var mw = document.createElement('canvas'), MW = 220, MH = 120;
    mw.width = MW; mw.height = MH;
    var mg = mw.getContext('2d'), img = mg.createImageData(MW, MH), fbm = noise2(9), fbm2 = noise2(19);
    for (var y = 0; y < MH; y++) {
      for (var x = 0; x < MW; x++) {
        var nx = x / MW, ny = y / MH;
        var t = (ny - (0.95 - 0.8 * nx)) / 1.28;             // distance from the band's centre line
        var band = Math.exp(-(t / 0.13) * (t / 0.13));
        var v = fbm(nx * 7, ny * 7, 5);
        var dust = Math.exp(-(t / 0.035) * (t / 0.035)) * fbm2(nx * 14, ny * 14, 4);
        var a = clamp(band * (0.3 + 0.8 * v) - dust * 0.9, 0, 1) * (1 - smooth(0.55, 1, ny) * 0.8);
        var k = (y * MW + x) * 4;
        img.data[k] = 190; img.data[k + 1] = 200; img.data[k + 2] = 235; img.data[k + 3] = a * 30;
      }
    }
    mg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(mw, 0, 0, CW, CH);

    var TINTS = [[157, 180, 255], [202, 215, 255], [248, 247, 255], [255, 244, 232], [255, 210, 161]];
    var bright = [];
    for (var i = 0; i < 700; i++) {
      var sx = r() * CW, sy;
      if (i % 3 === 0) { // a third cluster along the Milky Way
        var u = r();
        sy = (0.95 - 0.8 * (sx / CW)) * CH + (r() - 0.5) * 0.22 * CH * (0.4 + u);
      } else sy = r() * CH;
      if (sy < 0 || sy > CH) continue;
      var mag = Math.pow(r(), 3.2);
      var fade = 1 - smooth(0.55, 1, sy / CH) * 0.85;     // extinction near the horizon
      var col = TINTS[Math.floor(r() * r() * TINTS.length + 1.2) % TINTS.length];
      var rad = 0.35 + mag * 1.0, al = (0.2 + mag * 0.75) * fade;
      if (mag > 0.55) {
        var gl = g.createRadialGradient(sx, sy, 0, sx, sy, rad * 4);
        gl.addColorStop(0, rgba(col, al * 0.35)); gl.addColorStop(1, rgba(col, 0));
        g.fillStyle = gl; g.fillRect(sx - rad * 4, sy - rad * 4, rad * 8, rad * 8);
        if (bright.length < 12 && fade > 0.6) bright.push([sx * 2, sy * 2]);   // each twinkler is an animated layer: keep it to a few
      }
      g.fillStyle = rgba(col, al);
      g.beginPath(); g.arc(sx, sy, rad, 0, Math.PI * 2); g.fill();
    }
    stars.appendChild(c);
    // the brightest few twinkle (atmospheric scintillation)
    var html = '';
    bright.forEach(function (b, n) {
      html += '<i style="left:' + Math.round(b[0] - 1) + 'px;top:' + Math.round(b[1] - 1) + 'px;width:3px;height:3px;animation-duration:' +
        (3 + (n % 5)) + 's;animation-delay:' + -(n % 9) + 's"></i>';
    });
    stars.insertAdjacentHTML('beforeend', html);
  }

  // ---------- moon ----------
  var SYNODIC = 29.530588853;
  var NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // a known new moon

  // days since the last new moon, 0..29.53
  function moonAge(date) {
    var d = (date.getTime() - NEW_MOON) / 86400000;
    return ((d % SYNODIC) + SYNODIC) % SYNODIC;
  }

  // The moon always shows us the same face, so its maria are a fixed noise pattern with limb darkening.
  var face = null;
  function moonFace(S, R) {
    if (face) return face;
    var c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d'), img = g.createImageData(S, S), fbm = noise2(1969), fbm2 = noise2(1972), h = S / 2;
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var dx = (x + 0.5 - h) / R, dy = (y + 0.5 - h) / R, rr = dx * dx + dy * dy;
        if (rr > 1) continue;
        var limb = 0.72 + 0.28 * Math.pow(1 - rr, 0.35);
        var maria = smooth(0.48, 0.62, fbm(dx * 1.6 + 3, dy * 1.6 + 1, 4));
        var crater = fbm2(dx * 9, dy * 9, 3) * 0.12;
        var b = limb * (1 - maria * 0.3) * (0.94 + crater);
        var k = (y * S + x) * 4;
        img.data[k] = 214 * b; img.data[k + 1] = 218 * b; img.data[k + 2] = 228 * b;
        img.data[k + 3] = 255 * Math.min(1, (1 - rr) * R * 0.9); // anti-aliased edge
      }
    }
    g.putImageData(img, 0, 0);
    return (face = c);
  }

  // Lit part: half the disc plus a half-ellipse terminator. Waxing is lit on the right (northern view).
  function moonCanvas(age) {
    var S = 128, R = 60, h = S / 2;
    var k = Math.cos(2 * Math.PI * age / SYNODIC); // 1 new, 0 quarter, -1 full
    var waxing = age < SYNODIC / 2, src = moonFace(S, R);
    var c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    g.globalAlpha = 0.09; g.drawImage(src, 0, 0); // earthshine on the dark side
    g.globalAlpha = 1;
    if (Math.abs(k) < 0.995 || k < 0) {
      g.save();
      g.beginPath();
      g.arc(h, h, R + 1, -Math.PI / 2, Math.PI / 2, !waxing);
      g.ellipse(h, h, Math.abs(k) * (R + 1), R + 1, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing);
      g.closePath();
      g.clip();
      g.drawImage(src, 0, 0);
      g.restore();
    }
    return c;
  }

  var moonKey = -1;
  function drawMoon(now) {
    var age = moonAge(now), key = Math.round(age * 4); // redraw every ~6 hours of lunar age
    if (key === moonKey) return;
    moonKey = key;
    var holder = EZ.$('.crescent', moon);
    holder.innerHTML = '';
    holder.appendChild(moonCanvas(age));
  }

  // ---------- sun ----------
  // How the sun looks at a given height (elev: 1 overhead-ish, 0 on the horizon, negative below it).
  // Low down the air reddens and dims it, it looks larger, and refraction squashes it slightly.
  var SUNSET_CORE = [255, 128, 64], SUNSET_GLOW = [255, 96, 40];
  function sunLook(pal, elev) {
    var low = 1 - smooth(0, 0.45, elev);               // 0 high in the sky, 1 on the horizon
    var core = mix(pal.core.slice(0, 3), SUNSET_CORE, low * 0.8);
    var hot = mix(core, [255, 255, 250], 0.65 * (1 - low));  // white-hot centre, fading as it reddens
    var glow = mix(pal.glow.slice(0, 3), SUNSET_GLOW, low * 0.6);
    var ga = pal.glow[3] * (1 + 0.35 * low);
    // a crisp disc: hot centre, its own colour, a sharp limb, then the glow falling away
    var bg = 'radial-gradient(circle,' + rgba(hot, 1) + ' 0,' + rgba(hot, 1) + ' 2.6%,' + rgba(core, 1) + ' 4.4%,' +
      rgba(core, 0.92) + ' 5.1%,' + rgba(glow, ga * 0.95) + ' 5.7%,' + rgba(glow, ga * 0.55) + ' 9%,' +
      rgba(glow, ga * 0.24) + ' 18%,' + rgba(glow, ga * 0.08) + ' 36%,transparent 64%)';
    var flat = 1 - smooth(0.12, 0, elev) * 0.12;          // squashed only in the last few degrees
    return {
      bg: bg,
      sx: 1 + 0.22 * low, sy: (1 + 0.22 * low) * flat,
      // a little dimmer through more air (the bottom vignette already darkens it), gone once it has sunk
      op: (0.85 + 0.15 * smooth(0, 0.3, elev)) * smooth(-0.1, 0.02, elev)
    };
  }

  // ---------- frame ----------
  function update() {
    var now = new Date();
    var hour = forced ? FIXED[forced] : fixedHour != null ? fixedHour : now.getHours() + now.getMinutes() / 60;
    var phase = forced || phaseAt(hour);
    var pal = paletteAt(hour);

    // sun arcs from rise to set and keeps going below the horizon (y 760) before and after,
    // so it really sets and rises; the moon arcs over the night
    var t;
    var night = phase === 'night';
    if (night) {
      var nh = hour < 12 ? hour + 24 : hour;
      t = clamp((nh - (set + 0.9)) / (24 + rise - 0.6 - (set + 0.9)), 0, 1);
    } else {
      t = clamp((hour - rise) / (set - rise), -0.12, 1.12);
    }
    var x = Math.round(260 + t * 1400);
    var y = Math.round(760 - Math.sin(Math.PI * t) * 560);
    var elev = (760 - y) / 560;
    bodyPos = { x: x, y: y };

    // repaint the atmosphere; a new phase cross-fades in, minute steps repaint in place
    var first = !fill;
    if (first || phase !== current) {
      var cv = document.createElement('canvas');
      cv.width = FW; cv.height = FH; cv.className = 'fill';
      paintSky(cv, pal, x, y, x, y);
      if (first) {
        // fade in over the first-paint gradient (sky.css), then back it with the solid colour
        cv.style.opacity = '0';
        sky.insertBefore(cv, sky.firstChild);
        requestAnimationFrame(function () { requestAnimationFrame(function () { cv.style.opacity = '1'; }); });
      } else {
        cv.style.opacity = '0';
        fill.parentNode.insertBefore(cv, fill.nextSibling);
        var old = fill;
        requestAnimationFrame(function () { requestAnimationFrame(function () { cv.style.opacity = '1'; }); });
        setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 4500);
      }
      fill = cv;
      var back = rgba(pal.sky[0], 1);
      if (first) setTimeout(function () { sky.style.background = back; }, 4500); else sky.style.background = back;
      document.body.setAttribute('data-phase', phase);
      current = phase;
    } else {
      paintSky(fill, pal, x, y, x, y);
    }

    horizon.style.background = 'radial-gradient(closest-side,' + rgba(pal.horizon) + ',transparent)';
    var look = sunLook(pal, elev);
    sun.style.background = look.bg;

    // clouds: re-light when the palette moves on, keep the drifting layout unless the cover changes
    layoutClouds();
    // light from the sun's side; a high sun lights tops, a low one rakes across from the side
    var lightX = night ? 0 : clamp((x - 960) / 700, -1, 1);
    var lightY = night ? -0.8 : -(0.35 + 0.5 * clamp((760 - y) / 560, 0, 1));
    var key = pal.key + cover + Math.round(lightX * 2) + Math.round(lightY * 4);
    if (key !== spriteKey) {
      spriteKey = key;
      makeSprites(pal, lightX, lightY, function (s) {
        var old = sprites;
        sprites = s; applySprites();
        old.forEach(function (sp) { if (sp.blob) URL.revokeObjectURL(sp.url); });
      });
    }

    var showStars = (night || (phase === 'dawn' && hour < rise)) && ['rain', 'drizzle', 'snow', 'storm', 'fog', 'cloudy'].indexOf(wx.kind) < 0;
    if (showStars) buildStars();

    // the first placement jumps; later minutes glide (60 s transitions in sky.css)
    if (first) { horizon.style.transition = moon.style.transition = stars.style.transition = sun.style.transition = 'none'; }
    horizon.style.transform = 'translateX(' + (night ? 960 : clamp(x, 260, 1660)) + 'px)';
    sun.style.setProperty('--pos', 'translate(' + x + 'px,' + y + 'px)');
    sun.style.setProperty('--sx', look.sx.toFixed(3));
    sun.style.setProperty('--sy', look.sy.toFixed(3));
    // fog leaves a pale disc; rain, snow and storms hide the sun almost entirely
    var veiled = { fog: 0.35, drizzle: 0.3, rain: 0.15, snow: 0.2, storm: 0.05, cloudy: 0.55 }[wx.kind] || 1;
    sun.style.opacity = night ? '0' : (look.op * veiled).toFixed(3);
    moon.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    moon.style.opacity = night ? '1' : '0';
    drawMoon(now);
    stars.classList.toggle('off', !showStars);   // their slow turn and twinkle stop while hidden (sky.css)
    stars.style.opacity = showStars ? String(clamp(pal.night + (phase === 'dawn' ? (rise - hour) / 0.6 : 0), 0.15, 1)) : '0';
    if (first) { void sky.offsetWidth; horizon.style.transition = moon.style.transition = stars.style.transition = sun.style.transition = ''; }
    EZ.emit('phase', { phase: phase, hour: hour, rise: rise, set: set });
  }

  EZ.sky = {
    start: function () {
      sky = EZ.$('#sky'); stars = EZ.$('#stars'); horizon = EZ.$('#horizon');
      sun = EZ.$('#sun'); moon = EZ.$('#moon'); clouds = EZ.$('#clouds');
      // the grain rides on the vignette's layer (sky.css): one full-screen layer instead of two
      EZ.$('.vignette', sky).style.setProperty('--grain', 'url(' + grain() + ')');
      update();
      applyFall(); lightning();
      setInterval(update, 60000);
      requestAnimationFrame(drift);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) return;
        requestAnimationFrame(drift);
        if ((fx.kind || fx.fog.length) && !fx.running) { fx.running = true; fx.last = 0; requestAnimationFrame(fxLoop); }
      });
    },
    // from weather data: "HH:MM" strings and a cover of clear | partly cloudy | cloudy
    // both redraw the sky only when something actually changed: a weather refresh on returning Home must not
    // repaint the sky in the very moments the remote is being used
    setSun: function (sunrise, sunset) {
      var r = sunrise ? hm(sunrise) : rise, s = sunset ? hm(sunset) : set;
      if (r === rise && s === set) return;
      rise = r; set = s;
      // for index.html's first paint next time
      try { localStorage.setItem('emzee.sun', JSON.stringify([rise, set])); } catch (e) { /* storage blocked */ }
      if (sky) update();
    },
    // from the forecast: what kind of weather, how strong, and the wind (km/h) for the cloud drift
    setWeather: function (s, windKmh, windDir) {
      if (/[?&]wx=/.test(location.search)) s = wx;   // ?wx=rain|snow|fog|storm|drizzle forces it in the preview
      wind = Math.max(0.5, Math.min(2.2, 0.55 + (windKmh || 10) / 22));
      // rain leans with the wind: a light breeze barely tilts it (Apple's drizzle falls straight), a gale a lot;
      // wind from the west (180-360°) carries it to the right
      var lean = Math.min(0.35, Math.max(0, ((windKmh || 0) - 8) / 90));
      fx.slant = windDir == null ? 0 : (windDir > 180 ? 1 : -1) * lean;
      if (!s || (s.kind === wx.kind && Math.abs(s.strength - wx.strength) < 0.05)) { applyFall(); return; }
      wx = { kind: s.kind, strength: s.strength };
      current = null;   // repaint the sky with the new veil
      applyFall(); lightning();
      if (sky) update();
    },
    setCover: function (c) {
      if (!LAYOUT[c] || c === cover) return;
      cover = c; current = null; // a new cover repaints the veil too
      if (sky) update();
    },
    phase: function () { return current; },
    hour: function () { var n = new Date(); return forced ? FIXED[forced] : fixedHour != null ? fixedHour : n.getHours() + n.getMinutes() / 60; },
    times: function () { return { rise: rise, set: set }; },
    moonAge: moonAge,
    body: function () { return bodyPos; },
    // photo wallpaper instead of the drawn sky; falls back to the sky if the image won't load
    setWallpaper: function (url) {
      var photo = EZ.$('#photo');
      if (!url) { document.body.classList.remove('wallpaper'); return; }
      var img = new Image();
      img.onload = function () { photo.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")'; document.body.classList.add('wallpaper'); };
      img.onerror = function () { document.body.classList.remove('wallpaper'); };
      img.src = url;
    }
  };
})();
