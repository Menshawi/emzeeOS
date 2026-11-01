// Data sources, tried in order: the helper service (phase 2), the webOS service bridge, then demo data.
(function () {
  var HELPER = 'http://127.0.0.1:8775';
  var TIMEOUT = 800;
  var RETRY = 30000; // at boot the page can come up before the helper; look again after this

  // ---- 1. helper service ----
  function helper(path, body) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(body ? 'POST' : 'GET', HELPER + path, true);
      x.timeout = TIMEOUT;
      x.onload = function () {
        var r = null;
        try { r = JSON.parse(x.responseText); } catch (e) { /* not JSON */ }
        if (x.status < 200 || x.status >= 300 || !r) {
          var err = new Error((r && r.error) || 'helper ' + x.status);
          err.status = x.status; // it answered: the helper is up, this call just failed
          return reject(err);
        }
        resolve(r);
      };
      x.onerror = x.ontimeout = function () { reject(new Error('helper unreachable')); };
      if (body) x.setRequestHeader('Content-Type', 'application/json');
      x.send(body ? JSON.stringify(body) : null);
    });
  }

  // Only probe the helper on the TV (or with ?helper=1), so the desktop preview stays quiet.
  // When it doesn't answer, skip it for RETRY ms so the UI never waits on it twice in a row.
  var onTV = typeof window.PalmServiceBridge !== 'undefined' || /Web0S|webOS/i.test(navigator.userAgent);
  var useHelper = onTV || /[?&]helper=1\b/.test(location.search);
  var downUntil = 0;
  function viaHelper(path, body) {
    if (!useHelper || Date.now() < downUntil) return Promise.reject(new Error('helper down'));
    return helper(path, body).catch(function (e) {
      if (!e.status) downUntil = Date.now() + RETRY;
      throw e;
    });
  }

  // ---- 2. luna via PalmServiceBridge ----
  function luna(uri, params) {
    return new Promise(function (resolve, reject) {
      if (typeof window.PalmServiceBridge === 'undefined') return reject(new Error('no bridge'));
      var bridge = new window.PalmServiceBridge();
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; reject(new Error('luna timeout')); } }, 3000);
      bridge.onservicecallback = function (msg) {
        if (done) return;
        done = true; clearTimeout(timer);
        var r;
        try { r = JSON.parse(msg); } catch (e) { return reject(e); }
        if (r.returnValue === false) reject(new Error(r.errorText || 'luna error')); else resolve(r);
      };
      bridge.call(uri, JSON.stringify(params || {}));
    });
  }

  // apps that are inputs or system bits, not things to put in the dock
  var SKIP = /^com\.webos\.app\.(hdmi|livetv|home|discovery|browser\.|camera|screensaver|inputcommon|externalinput|miracast|screenshare|tvhotkey|channelsetting|softwareupdate|settings|notificationcenter)|^com\.emzee\.launcher$/; // emzee Setup stays listed: the way back without SSH

  function lunaApps() {
    return luna('luna://com.webos.applicationManager/listLaunchPoints', {}).then(function (r) {
      return (r.launchPoints || []).filter(function (p) {
        return !SKIP.test(p.id) && !p.systemApp;
      }).map(function (p) {
        return { id: p.id, name: p.title, icon: p.largeIcon || p.icon || null, sub: '' };
      });
    });
  }

  // ---- 3. demo data (desktop preview) ----
  var DEMO_APPS = [
    { id: 'youtube.leanback.v4', name: 'YouTube', glyph: 'Y', c1: '#D8443A', c2: '#8E1A14', sub: 'Last opened this morning' },
    { id: 'netflix', name: 'Netflix', glyph: 'N', c1: '#2A2A2E', c2: '#0B0B0D', sub: 'Last opened yesterday' },
    { id: 'amazon', name: 'Prime Video', glyph: 'P', c1: '#2C8BD8', c2: '#124A80', sub: 'Last opened 3 days ago' },
    { id: 'com.disney.disneyplus-prod', name: 'Disney+', glyph: 'D', c1: '#2B4FC9', c2: '#101F5E', sub: 'Last opened last week' },
    { id: 'cdp-30', name: 'Plex', glyph: 'X', c1: '#E2A635', c2: '#8C5A0C', sub: 'Your library · 214 films' },
    { id: 'spotify-beehive', name: 'Spotify', glyph: 'S', c1: '#27A85A', c2: '#0E5129', sub: 'Last opened on Tuesday' },
    { id: 'com.apple.appletv', name: 'Apple TV+', glyph: 'A', c1: '#3A3A40', c2: '#121214', sub: 'Not opened yet' },
    { id: 'twitch', name: 'Twitch', glyph: 'T', c1: '#7B4FD0', c2: '#3A1F70', sub: 'Last opened last month' }
  ];
  var DEMO_INPUTS = [
    { id: 'com.webos.app.hdmi1', name: 'PlayStation', port: 'HDMI 1', kind: 'game', status: 'playing', detail: 'HDMI 1 · Playing', sub: 'HDMI 1 · On and ready' },
    { id: 'com.webos.app.hdmi2', name: 'Apple TV', port: 'HDMI 2', kind: 'box', status: 'asleep', detail: 'HDMI 2 · Asleep', sub: 'HDMI 2 · Asleep' },
    { id: 'com.webos.app.hdmi3', name: 'PC', port: 'HDMI 3', kind: 'pc', status: 'off', detail: 'HDMI 3 · Not connected', sub: 'HDMI 3 · Not connected' },
    { id: 'com.webos.app.livetv', name: 'Live TV', port: 'Antenna', kind: 'tv', status: 'ready', detail: 'Antenna', sub: 'Antenna' },
    { id: 'com.webos.app.miracast', name: 'Screen share', port: 'Cast', kind: 'cast', status: 'ready', detail: 'From a phone or laptop', sub: 'From a phone or laptop' }
  ];
  // the preview's stand-in forecast for the weather page: a plausible autumn week
  function demoForecast() {
    var codes = [61, 51, 3, 1, 0, 2, 2, 3, 71, 45], wd = ['Today', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
    var h = new Date().getHours(), next = [], i;
    for (i = 1; i <= 24; i++) {
      var hh = (h + i) % 24;
      next.push({ t: (hh < 10 ? '0' : '') + hh + ':00', temp: Math.round(8 - 2 * Math.cos((hh - 15) / 24 * 2 * Math.PI)), code: i < 4 ? 61 : i < 9 ? 51 : 3,
        pop: i < 4 ? 55 : i < 9 ? 25 : 0, mm: i < 4 ? 0.4 : i < 9 ? 0.1 : 0, wind: 2 + (i % 5 > 2 ? 1 : 0) + (i > 16 ? 1 : 0), gust: 4 + (i % 4), dir: 240 + i, day: hh >= 7 && hh < 16 });
    }
    return {
      next: next,
      days: codes.map(function (c, n) {
        return { wd: wd[n], code: c, max: [8, 9, 9, 9, 11, 7, 7, 7, 7, 7][n], min: [2, 3, 2, 4, 4, 2, 2, 2, 2, 3][n], pop: [55, 60, 0, 0, 0, 10, 0, 0, 40, 20][n],
          rain: [1, 1, 0, 0, 0, 0, 0, 0, 0.6, 0][n], windMin: [1, 1, 2, 2, 3, 2, 2, 1, 1, 1][n], windMax: [4, 4, 3, 3, 4, 3, 3, 2, 2, 2][n], gust: 7 };
      }),
      feels: 8, humidity: 93, dew: 6, wind: { speed: 2, gust: 4, dir: 242 }, precip: 0.1, pressure: 1027, pressureTrend: 'steady', cloudCover: 100,
      visibility: 15, rainLast24: 0.6, rainNext24: 0.9, uv: 0, uvLeft: 0, popNow: 55, daylight: 8.7, normalHigh: 6,
      sunriseNext: '07:09', sunsetNext: '15:51', units: { temp: '°C', wind: 'm/s' },
      air: { aqi: 18, pm25: 5, pm10: 7, pollen: [{ name: 'Birch', value: 0 }, { name: 'Grass', value: 0 }] },
      sky: { kind: (location.search.match(/[?&]wx=(\w+)/) || [])[1] || 'drizzle', strength: 0.5 }, code: 51, condition: 'Drizzle', high: 8, low: 2,
      temp: 7, isDay: false, place: 'Täby'
    };
  }
  var DEMO_WEATHER = {
    condition: 'Partly cloudy', clouds: 'partly cloudy',
    temp: null, high: 17, low: 9, // temp follows the sky phase in the preview (weather.js)
    sunrise: '07:00', sunset: '17:30',
    hours: null // filled from the current hour by weather.js
  };
  var DEFAULT_CONFIG = { order: [], hidden: [], pins: null, dockSize: 6, wallpaper: 'sky', location: null, unit: 'c', clock24: true, idleMinutes: 2, motion: 'full', saver: 'sky', fireSpeed: 0.9 };

  function copy(list) { return list.map(function (o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }); }
  function merge(a, b) { var c = {}, k; for (k in a) c[k] = a[k]; for (k in b) c[k] = b[k]; return c; }

  // Without the helper, settings live in this browser (preview) or the app's own storage (TV).
  function localConfig() {
    try { return merge(DEFAULT_CONFIG, JSON.parse(localStorage.getItem('emzee.config') || '{}')); } catch (e) { return merge(DEFAULT_CONFIG, {}); }
  }
  function saveLocal(patch) {
    var next = merge(localConfig(), patch);
    try { localStorage.setItem('emzee.config', JSON.stringify(next)); } catch (e) { /* storage blocked */ }
    return next;
  }

  // the helper orders and marks hidden apps itself; for luna and demo lists do it here
  function arrange(apps, conf) {
    var rank = function (id) { var i = conf.order.indexOf(id); return i < 0 ? 1e6 : i; };
    return apps.map(function (a, i) { a.hidden = conf.hidden.indexOf(a.id) >= 0; return { a: a, i: i }; })
      .sort(function (x, y) { return rank(x.a.id) - rank(y.a.id) || x.i - y.i; })
      .map(function (x) { return x.a; });
  }

  var conf = null; // last known settings

  EZ.api = {
    source: 'demo',

    config: function () {
      return viaHelper('/api/config')
        .catch(function () { return localConfig(); })
        .then(function (c) { conf = merge(DEFAULT_CONFIG, c); return conf; });
    },

    saveConfig: function (patch) {
      return viaHelper('/api/config', patch)
        .catch(function () { return saveLocal(patch); })
        .then(function (c) { conf = merge(DEFAULT_CONFIG, c); EZ.emit('config', conf); return conf; });
    },

    // every launchable app, in the user's order, each with .hidden
    apps: function () {
      return viaHelper('/api/apps')
        .then(function (r) {
          EZ.api.source = 'helper';
          return (r.apps || []).map(function (a) { if (a.icon && a.icon.charAt(0) === '/') a.icon = HELPER + a.icon; return a; });
        })
        .catch(function () {
          return Promise.all([lunaApps(), EZ.api.config()]).then(function (r) { EZ.api.source = 'luna'; return arrange(r[0], r[1]); });
        })
        .catch(function () {
          return EZ.api.config().then(function (c) { EZ.api.source = 'demo'; return arrange(copy(DEMO_APPS), c); });
        });
    },

    inputs: function () {
      // Input status needs the helper (eim service); without it the demo list stands in.
      return viaHelper('/api/inputs')
        .then(function (r) { return r.inputs || r; })
        .catch(function () { return copy(DEMO_INPUTS); });
    },

    launch: function (id) {
      return viaHelper('/api/launch', { id: id })
        .catch(function () { return luna('luna://com.webos.applicationManager/launch', { id: id }); })
        .catch(function () { console.log('[emzee] launch (preview):', id); return { returnValue: true, preview: true }; });
    },

    // the fireplace video: its state on the TV, starting its download, and where to stream it from
    fireplace: function () { return viaHelper('/api/fireplace').catch(function () { return { state: 'none' }; }); },
    fireplaceStart: function () { return viaHelper('/api/fireplace', {}).catch(function () { return { state: 'none' }; }); },
    fireplaceUrl: function () { return HELPER + '/fireplace'; },

    // a line for the helper's log, for what can only be seen on the TV
    note: function (text) {
      return viaHelper('/api/note', { text: text }).catch(function () {});
    },
    // a smoothness summary for the helper's log (EZ.perf)
    perf: function (label, fps, worst, slow, frames) {
      return viaHelper('/api/perf', { label: label, fps: fps, worst: worst, slow: slow, frames: frames }).catch(function () {});
    },

    // where emzee thinks the TV is: {name, lat, lon, source: ip | timezone | manual}, or null
    location: function () {
      return viaHelper('/api/location').then(function (r) { return r.location; })
        .catch(function () { return localConfig().location || { name: 'Stockholm', lat: 59.33, lon: 18.07, source: 'ip' }; });
    },
    // town search for setting it by hand; the preview answers with a stand-in list
    places: function (q) {
      return viaHelper('/api/places?q=' + encodeURIComponent(q)).then(function (r) { return r.places; })
        .catch(function (e) {
          if (e.status) throw e;
          return [{ name: q.charAt(0).toUpperCase() + q.slice(1), region: 'Stockholm', country: 'Sweden', lat: 59.44, lon: 18.07 },
            { name: q.charAt(0).toUpperCase() + q.slice(1) + ' kyrkby', region: 'Stockholm', country: 'Sweden', lat: 59.5, lon: 18.06 }];
        });
    },

    // the helper finds the location itself (internet, else the TV's time zone); without the helper,
    // the demo values (and a 07:00/17:30 sun) stand in
    weather: function () {
      return viaHelper('/api/weather').catch(function () { return merge(merge(DEMO_WEATHER, demoForecast()), {}); });
    },

    // the photo wallpaper the helper serves, or a ?wallpaper=<url> override for the preview
    wallpaperUrl: function () {
      var m = /[?&]wallpaper=([^&]+)/.exec(location.search);
      if (m) return decodeURIComponent(m[1]);
      return useHelper ? HELPER + '/wallpaper?t=' + Date.now() : null;
    },

    // tells boot.sh's failsafe the launcher came up
    ready: function () { return viaHelper('/api/ready', {}).catch(function () { return null; }); }
  };
})();
