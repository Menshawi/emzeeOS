// The weather page, after Apple Weather. → from the gear focuses the weather tile; OK (or a click on it) drops the
// page from the top over the live sky. The place and temperature float at the top; below, cards for wind, the
// moon, the sun, UV, feels like, rain, humidity, pressure, visibility and air, a Conditions strip of the next
// 24 hours and the next 10 days. ▲ ▼ switch both between temperature, rain and wind; ◀ ▶ scroll the hours;
// Back sends the page up again. The data is the helper's forecast (weather.js keeps it: EZ.weather.data()).
(function () {
  // ---------- icons ----------
  // line icons on a 24 grid, coloured by part (wx.css): the sun warm, rain blue, lightning gold
  var CLOUD = 'M7 17h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.7 8.2 4.4 4.4 0 0 0 7 17z';
  var CLOUD_LOW = 'M7 15h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.7 6.2 4.4 4.4 0 0 0 7 15z';
  var SUN = '<g class="sun"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4 7 7M17 17l1.6 1.6M5.4 18.6 7 17M17 7l1.6-1.6"/></g>';
  var MOON = '<path class="moon" d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z"/>';
  var SMALL_SUN = '<g class="sun"><circle cx="8.6" cy="8.4" r="3"/><path d="M8.6 2.4v1.4M2.6 8.4H4M4.4 4.2l1 1M12.8 4.2l-1 1"/></g>';
  var SMALL_MOON = '<path class="moon" d="M12.4 9.6A5.2 5.2 0 0 1 5.6 2.8a5.2 5.2 0 1 0 6.8 6.8z"/>';
  var PART_CLOUD = 'M9.5 20H18a3.6 3.6 0 0 0 .5-7.16A4.9 4.9 0 0 0 9.6 12a3.9 3.9 0 0 0-.1 8z';
  function svg(inner) {
    return '<svg class="wx-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  function icon(code, day) {
    code = code == null ? 3 : code;
    if (code <= 1) return svg(day ? SUN : MOON);
    if (code === 2) return svg((day ? SMALL_SUN : SMALL_MOON) + '<path d="' + PART_CLOUD + '"/>');
    if (code === 3) return svg('<path d="' + CLOUD + '"/>');
    if (code === 45 || code === 48) return svg('<path d="' + CLOUD_LOW + '"/><path d="M5 18.5h14M7.5 21.5h9"/>');
    if (code >= 95) return svg('<path d="' + CLOUD_LOW + '"/><path class="bolt" d="M12.8 15.6 10.6 19h3l-1.8 3.4"/>');
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
      return svg('<path d="' + CLOUD_LOW + '"/><g class="drop"><path d="M8 18.2v2.6M6.7 19.5h2.6M12 19.4v2.6M10.7 20.7h2.6M16 18.2v2.6M14.7 19.5h2.6"/></g>');
    }
    var drizzle = code >= 51 && code <= 57;
    return svg('<path d="' + CLOUD_LOW + '"/><g class="drop"><path d="' +
      (drizzle ? 'M8.5 18.5v1M12 19.5v1M15.5 18.5v1' : 'M8.6 18l-1.1 3M12.6 18l-1.1 3M16.6 18l-1.1 3') + '"/></g>');
  }
  function sunEvent(up) {
    return svg('<g class="sun"><path d="M7 17a5 5 0 0 1 10 0"/><path d="M3 17h18M12 ' + (up ? '9V4M9.5 6.5 12 4l2.5 2.5' : '4v5M9.5 6.5 12 9l2.5-2.5') + '"/></g>');
  }
  function line(d, fill) { return '<svg viewBox="0 0 24 24" fill="' + (fill || 'none') + '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
  var I = {
    wind: line('<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>'),
    drop: line('<path d="M12 3.5s6 6.4 6 10.4a6 6 0 0 1-12 0c0-4 6-10.4 6-10.4z"/>'),
    moon: line('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>'),
    sun: line('<path d="M7 17a5 5 0 0 1 10 0M3 17h18M12 4v3M5.6 9.6l1.6 1.2M18.4 9.6l-1.6 1.2"/>'),
    uv: line('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
    feel: line('<path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z"/>'),
    hum: line('<path d="M3 8h9M3 12h13M3 16h8M17 13s3 3 3 5a3 3 0 0 1-6 0c0-2 3-5 3-5z"/>'),
    press: line('<circle cx="12" cy="12" r="8.5"/><path d="M12 12l4-4M12 6.5v1M17.5 12h-1M6.5 12h1"/>'),
    eye: line('<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
    air: line('<path d="M4 9h10a2.5 2.5 0 1 0-2.5-2.5M4 13h14a2.5 2.5 0 1 1-2.5 2.5M4 17h6"/>'),
    pin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3 3 10.5l7.5 2.6L13 21z"/></svg>',
    temp: line('<circle cx="9" cy="9" r="3"/><path d="M9 3v1.3M3 9h1.3M4.8 4.8l.9.9"/><path d="M10.5 20H18a3.4 3.4 0 0 0 .4-6.8A4.6 4.6 0 0 0 10.6 12.5a3.8 3.8 0 0 0-.1 7.5z"/>'),
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5M6.5 10.5 12 5l5.5 5.5"/></svg>'
  };

  // ---------- words ----------
  var DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function compass(d) { return d == null ? '' : DIRS[Math.round(((d % 360) + 360) % 360 / 22.5) % 16]; }
  function uvWord(u) { return u == null ? '' : u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme'; }
  function aqiWord(a) { return a == null ? '' : a < 20 ? 'Good' : a < 40 ? 'Fair' : a < 60 ? 'Moderate' : a < 80 ? 'Poor' : a < 100 ? 'Very poor' : 'Extremely poor'; }
  function deg(v) { return v == null ? '–' : v + '°'; }
  function mm(v) { return v == null ? '–' : v > 0 && v < 1 ? '<1' : String(Math.round(v)); }
  function mins(t) { var p = String(t || '').split(':'); return +p[0] * 60 + (+p[1] || 0); }
  var MOONS = [[1.84, 'New moon'], [5.53, 'Waxing crescent'], [9.22, 'First quarter'], [12.91, 'Waxing gibbous'],
    [16.61, 'Full moon'], [20.30, 'Waning gibbous'], [23.99, 'Last quarter'], [27.68, 'Waning crescent'], [99, 'New moon']];

  // temperature to colour for the 10-day bars (in °C): violet when freezing, through teal, yellow and orange
  var STOPS = [[-15, [94, 92, 230]], [0, [90, 200, 250]], [10, [99, 230, 190]], [18, [255, 214, 10]], [26, [255, 159, 10]], [34, [255, 69, 58]]];
  function tcolor(t, f) {
    if (f) t = (t - 32) / 1.8;
    for (var i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0] || i === STOPS.length - 1) {
        var a = STOPS[i - 1], b = STOPS[i], k = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
        return 'rgb(' + a[1].map(function (v, j) { return Math.round(v + (b[1][j] - v) * k); }).join(',') + ')';
      }
    }
  }

  var root, body, hints, tile, drops = null;
  var isOpen = false, view = 0, strip = [], scroll = 0;
  var VIEWS = ['Conditions', 'Precipitation', 'Wind'];

  // ---------- cards ----------
  function card(place, k, ic, inner) {
    return '<div class="wx-card" style="' + place + '"><div class="wx-k">' + (ic || '') + EZ.esc(k) + '</div>' + inner + '</div>';
  }

  function windCard(w, wu) {
    var s = w.wind || {}, to = s.dir == null ? null : (s.dir + 180) % 360, ticks = '', i;
    for (i = 0; i < 72; i++) {
      var a = i * 5 * Math.PI / 180, major = i % 18 === 0, r1 = major ? 50 : 54;
      ticks += '<line x1="' + (64 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (64 - Math.cos(a) * r1).toFixed(1) + '" x2="' + (64 + Math.sin(a) * 58).toFixed(1) +
        '" y2="' + (64 - Math.cos(a) * 58).toFixed(1) + '" stroke="rgba(245,245,247,' + (major ? 0.6 : 0.22) + ')" stroke-width="1.2"/>';
    }
    var arrow = '';
    if (to != null) {
      // a dot where the wind comes from and an arrowhead where it goes, clear of the speed in the middle
      arrow = '<g transform="translate(64 64) rotate(' + to + ')">' +
        '<line x1="0" y1="30" x2="0" y2="45" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="0" cy="46" r="3.6" fill="#fff"/>' +
        '<line x1="0" y1="-30" x2="0" y2="-47" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>' +
        '<path d="M-5 -41 L0 -49 L5 -41" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>';
    }
    var c = '<svg class="wx-compass" viewBox="0 0 128 128">' + ticks +
      '<text x="64" y="30" text-anchor="middle">N</text><text x="101" y="69" text-anchor="middle">E</text><text x="64" y="108" text-anchor="middle">S</text><text x="27" y="69" text-anchor="middle">W</text>' +
      arrow + '<text class="spd" x="64" y="66" text-anchor="middle">' + (s.speed == null ? '–' : s.speed) + '</text><text class="unit" x="64" y="82" text-anchor="middle">' + EZ.esc(wu) + '</text></svg>';
    return card('grid-column:1;grid-row:1', 'Wind', I.wind, '<div class="wx-mid">' + c + '</div><div class="wx-foot">Gusts ' + (s.gust == null ? '–' : s.gust + ' ' + wu) + ' ' + compass(s.dir) + '</div>');
  }

  function moonCard() {
    var age = EZ.sky.moonAge(new Date()), name = MOONS.filter(function (m) { return age < m[0]; })[0][1];
    var lit = Math.round((1 - Math.cos(2 * Math.PI * age / 29.530588853)) / 2 * 100);
    var toFull = Math.round(((14.77 - age) + 29.53) % 29.53);
    return card('grid-column:2;grid-row:1', name, I.moon,
      '<div class="wx-mid"><canvas class="wx-moon" id="wx-moon" width="192" height="192"></canvas></div>' +
      '<div class="wx-foot">' + lit + '% lit · ' + (toFull === 0 ? 'full tonight' : 'full in ' + toFull + ' day' + (toFull === 1 ? '' : 's')) + '</div>');
  }

  function sunCard(w) {
    var now = new Date(), n = now.getHours() * 60 + now.getMinutes(), rise = mins(w.sunrise), set = mins(w.sunset);
    var label, time, foot;
    if (n < rise) { label = 'Sunrise'; time = w.sunrise; foot = 'Sunset ' + w.sunset; }
    else if (n < set) { label = 'Sunset'; time = w.sunset; foot = 'Sunrise ' + (w.sunriseNext || w.sunrise); }
    else { label = 'Sunrise'; time = w.sunriseNext || w.sunrise; foot = 'Sunset ' + (w.sunsetNext || w.sunset); }
    // the day as an arc over the horizon, the sun where it is now (below the line at night)
    var t = (n - rise) / Math.max(1, set - rise), pts = [], k;
    for (k = -0.25; k <= 1.251; k += 0.05) pts.push((10 + (k + 0.25) / 1.5 * 186).toFixed(1) + ',' + (44 - Math.sin(Math.PI * k) * 32).toFixed(1));
    var tt = Math.max(-0.25, Math.min(1.25, t)), dx = 10 + (tt + 0.25) / 1.5 * 186, dy = 44 - Math.sin(Math.PI * tt) * 32, up = dy < 44;
    var arc = '<svg class="wx-arc" viewBox="0 0 206 66"><defs><clipPath id="wx-above"><rect x="0" y="0" width="206" height="44"/></clipPath></defs>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="rgba(245,245,247,0.25)" stroke-width="2"/>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="rgba(255,214,122,0.85)" stroke-width="2.4" clip-path="url(#wx-above)"/>' +
      '<line x1="0" y1="44" x2="206" y2="44" stroke="rgba(245,245,247,0.4)" stroke-width="1.2"/>' +
      '<circle cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="5.5" fill="' + (up ? '#FFE7A3' : '#1E2636') + '" stroke="#fff" stroke-width="' + (up ? 0 : 1.5) + '"/></svg>';
    return card('grid-column:1;grid-row:2', label, I.sun, '<div class="wx-v">' + EZ.esc(time || '–') + '</div>' + arc + '<div class="wx-foot">' + EZ.esc(foot) + '</div>');
  }

  function uvCard(w) {
    var u = w.uv == null ? null : Math.round(w.uv), left = w.uvLeft;
    var foot = left == null ? '' : left < 3 ? 'Low for the rest of the day.' : 'Up to ' + Math.round(left) + ', ' + uvWord(left).toLowerCase() + ', later today.';
    return card('grid-column:2;grid-row:2', 'UV index', I.uv, '<div class="wx-v">' + (u == null ? '–' : u) + '</div><div class="wx-v2">' + uvWord(u) + '</div>' +
      '<div class="wx-scale uv"><i style="left:' + Math.min(100, (u || 0) / 11 * 100).toFixed(1) + '%"></i></div><div class="wx-foot">' + foot + '</div>');
  }

  function feelsCard(w) {
    var f = w.feels, t = w.temp, ws = w.wind && w.wind.speed, msg = '';
    if (f != null && t != null) {
      if (f <= t - 2) msg = ws != null && ws >= 4 ? 'Wind is making it feel colder.' : 'It feels colder than the actual temperature.';
      else if (f >= t + 2 && w.humidity >= 70) msg = 'Humidity is making it feel warmer.';
      else if (f >= t + 1) msg = 'It feels warmer than the actual temperature.';
      else msg = 'Similar to the actual temperature.';
    }
    return card('grid-column:1;grid-row:3', 'Feels like', I.feel, '<div class="wx-v">' + deg(f) + '</div><div class="wx-foot">' + msg + '</div>');
  }

  function rainCard(w) {
    return card('grid-column:2;grid-row:3', 'Precipitation', I.drop, '<div class="wx-v">' + mm(w.rainLast24) + ' <small>mm</small></div><div class="wx-v2">in last 24h</div>' +
      '<div class="wx-foot">' + (w.rainNext24 == null ? '' : mm(w.rainNext24) + ' mm expected in next 24h.') + '</div>');
  }

  function humidityCard(w) {
    return card('grid-column:4;grid-row:2', 'Humidity', I.hum, '<div class="wx-v">' + (w.humidity == null ? '–' : w.humidity + '%') + '</div>' +
      '<div class="wx-foot">' + (w.dew == null ? '' : 'The dew point is ' + w.dew + '° right now.') + '</div>');
  }

  function pressureCard(w) {
    var p = w.pressure, ticks = '', i, a0 = -135, span = 270;
    for (i = 0; i <= 40; i++) {
      var a = (a0 + span * i / 40) * Math.PI / 180;
      ticks += '<line x1="' + (59 + Math.sin(a) * 46).toFixed(1) + '" y1="' + (59 - Math.cos(a) * 46).toFixed(1) + '" x2="' + (59 + Math.sin(a) * 54).toFixed(1) +
        '" y2="' + (59 - Math.cos(a) * 54).toFixed(1) + '" stroke="rgba(245,245,247,0.32)" stroke-width="1.6" stroke-linecap="round"/>';
    }
    var k = p == null ? 0.5 : Math.max(0, Math.min(1, (p - 970) / 80)), na = a0 + span * k;
    var trend = w.pressureTrend === 'rising' ? '↑' : w.pressureTrend === 'falling' ? '↓' : '=';
    var dial = '<svg class="wx-dial" viewBox="0 0 118 118">' + ticks +
      '<g transform="translate(59 59) rotate(' + na + ')"><line x1="0" y1="-42" x2="0" y2="-57" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g>' +
      '<text x="59" y="50" text-anchor="middle" font-size="17" font-weight="700">' + trend + '</text>' +
      '<text x="59" y="72" text-anchor="middle" font-size="22" font-weight="600">' + (p == null ? '–' : p) + '</text>' +
      '<text x="59" y="89" text-anchor="middle" font-size="13" fill="rgba(245,245,247,0.75)">hPa</text></svg>';
    return card('grid-column:5;grid-row:2', 'Pressure', I.press, '<div class="wx-mid">' + dial + '</div><div class="wx-dial-ends"><span>Low</span><span>High</span></div>');
  }

  function visCard(w) {
    var v = w.visibility, msg = v == null ? '' : v >= 10 ? 'Perfectly clear view.' : v >= 5 ? 'Clear view.' : v >= 2 ? 'Haze is affecting visibility.' : 'Fog is affecting visibility.';
    return card('grid-column:4;grid-row:3', 'Visibility', I.eye, '<div class="wx-v">' + (v == null ? '–' : (v >= 10 ? Math.round(v) : v) + ' <small>km</small>') + '</div><div class="wx-foot">' + msg + '</div>');
  }

  function airCard(w) {
    var a = w.air || {}, pol = (a.pollen || []).filter(function (p) { return p.value > 0; }).sort(function (x, y) { return y.value - x.value; })[0];
    return card('grid-column:5;grid-row:3', 'Air quality', I.air, '<div class="wx-v">' + (a.aqi == null ? '–' : a.aqi) + '</div><div class="wx-v2">' + aqiWord(a.aqi) + '</div>' +
      (a.aqi == null ? '' : '<div class="wx-scale aqi"><i style="left:' + Math.min(100, a.aqi).toFixed(1) + '%"></i></div>') +
      '<div class="wx-foot">' + (a.aqi == null ? 'No reading here.' : pol ? pol.name + ' pollen ' + pol.value + ' grains/m³' : 'No pollen in the air.') + '</div>');
  }

  // ---------- Conditions: the next 24 hours, with sunrise and sunset in their places ----------
  function stripItems(w) {
    var first = mins(w.next[0].t);
    var items = w.next.map(function (h, i) { var m = mins(h.t); return { h: h, t: i === 0 ? 'Now' : h.t, m: m < first ? m + 1440 : m }; });
    [[w.sunrise, 'up', 0], [w.sunset, 'down', 0], [w.sunriseNext, 'up', 1440], [w.sunsetNext, 'down', 1440]].forEach(function (e) {
      if (!e[0]) return;
      var m = mins(e[0]) + e[2];
      if (m > first - 60 && m < first + 23 * 60) items.push({ sun: e[1], t: e[0], m: m + 0.5 });
    });
    return items.sort(function (a, b) { return a.m - b.m; });
  }

  function hourCell(it, maxMm) {
    if (it.sun) {
      return '<div class="wx-h sun"><span class="t">' + EZ.esc(it.t) + '</span><span class="ic">' + sunEvent(it.sun === 'up') + '</span><span class="pp"></span><span class="lbl">' + (it.sun === 'up' ? 'Sunrise' : 'Sunset') + '</span></div>';
    }
    var h = it.h;
    if (view === 1) {
      var pct = h.mm ? Math.max(6, Math.min(100, h.mm / maxMm * 100)) : 0;
      return '<div class="wx-h"><span class="t">' + EZ.esc(it.t) + '</span><span class="bar"><i style="height:' + pct.toFixed(0) + '%"></i></span><span class="pp">' + (h.pop == null ? '' : h.pop + '%') +
        '</span><span class="tv">' + (h.mm ? h.mm : '0') + '<small> mm</small></span></div>';
    }
    if (view === 2) {
      var to = h.dir == null ? 0 : (h.dir + 180) % 360;
      return '<div class="wx-h"><span class="t">' + EZ.esc(it.t) + '</span><span class="dir" style="transform:rotate(' + to + 'deg)">' + I.arrow + '</span><span class="tv">' + (h.wind == null ? '–' : h.wind) +
        '</span><span class="pp" style="color:rgba(235,240,250,0.7)">' + (h.gust == null ? '' : 'gust ' + h.gust) + '</span></div>';
    }
    return '<div class="wx-h"><span class="t">' + EZ.esc(it.t) + '</span><span class="ic">' + icon(h.code, h.day) + '</span><span class="pp">' + (h.pop >= 20 ? h.pop + '%' : '') + '</span><span class="tv">' + deg(h.temp) + '</span></div>';
  }

  function condsCard(w) {
    var unit = (w.units && w.units.temp) || '°C', wu = (w.units && w.units.wind) || 'm/s';
    var sub = view === 0 ? 'Temperature (' + unit + ')' : view === 1 ? 'Amount (mm) · Chance of rain' : 'Speed (' + wu + ') · Gusts';
    strip = stripItems(w);
    var maxMm = Math.max(2, Math.max.apply(null, w.next.map(function (h) { return h.mm || 0; })));
    var chips = [I.temp, I.drop, I.wind].map(function (ic, i) { return '<span class="wx-chip' + (i === view ? ' on' : '') + '" data-view="' + i + '">' + ic + '</span>'; }).join('');
    return '<div class="wx-card c-conds"><div class="wx-ch"><div><b>' + VIEWS[view] + '</b><span>' + EZ.esc(sub) + '</span></div><div class="wx-chips">' + chips + '</div></div>' +
      '<div class="wx-strip-view"><div class="wx-strip" id="wx-strip">' + strip.map(function (it) { return hourCell(it, maxMm); }).join('') + '</div></div></div>';
  }

  // ---------- the 10 days ----------
  function daysCard(w) {
    var f = /F/.test((w.units && w.units.temp) || ''), days = w.days, rows;
    if (view === 1) {
      var maxR = Math.max(2, Math.max.apply(null, days.map(function (d) { return d.rain || 0; })));
      rows = days.map(function (d) {
        return '<div class="wx-day rain"><span class="wd">' + EZ.esc(d.wd) + '</span><span class="ic">' + icon(d.code, true) + '</span><span class="lo">' + mm(d.rain) + ' mm</span>' +
          '<span class="track"><b style="left:0;width:' + Math.min(100, (d.rain || 0) / maxR * 100).toFixed(1) + '%;background:#4FB6FF"></b></span><span class="hi">' + (d.pop == null ? '–' : d.pop + '%') + '</span></div>';
      });
    } else if (view === 2) {
      var maxW = Math.max(4, Math.max.apply(null, days.map(function (d) { return d.windMax || 0; })));
      rows = days.map(function (d) {
        var a = (d.windMin || 0) / maxW * 100, b = (d.windMax || 0) / maxW * 100;
        return '<div class="wx-day"><span class="wd">' + EZ.esc(d.wd) + '</span><span class="ic">' + icon(d.code, true) + '</span><span class="lo">' + (d.windMin == null ? '–' : d.windMin) + '</span>' +
          '<span class="track"><b style="left:' + a.toFixed(1) + '%;width:' + Math.max(2, b - a).toFixed(1) + '%;background:#4FD1C5"></b></span><span class="hi">' + (d.windMax == null ? '–' : d.windMax) + '</span></div>';
      });
    } else {
      // every bar on one shared scale, coloured by its temperatures; today's carries a dot for now
      var lo = Math.min.apply(null, days.map(function (d) { return d.min; })), hi = Math.max.apply(null, days.map(function (d) { return d.max; })), span = Math.max(1, hi - lo);
      rows = days.map(function (d, i) {
        var a = (d.min - lo) / span * 100, b = (d.max - lo) / span * 100;
        var dot = i === 0 && w.temp != null ? '<i style="left:' + Math.max(0, Math.min(100, (w.temp - lo) / span * 100)).toFixed(1) + '%"></i>' : '';
        return '<div class="wx-day"><span class="wd">' + EZ.esc(d.wd) + '</span><span class="ic">' + icon(d.code, true) + (d.pop >= 20 ? '<em>' + d.pop + '%</em>' : '') + '</span><span class="lo">' + deg(d.min) + '</span>' +
          '<span class="track"><b style="left:' + a.toFixed(1) + '%;width:' + Math.max(3, b - a).toFixed(1) + '%;background:linear-gradient(90deg,' + tcolor(d.min, f) + ',' + tcolor(d.max, f) + ')"></b>' + dot +
          '</span><span class="hi">' + deg(d.max) + '</span></div>';
      });
    }
    return '<div class="wx-card c-days">' + rows.join('') + '</div>';
  }

  // ---------- the page ----------
  function render() {
    var w = (EZ.weather.data && EZ.weather.data()) || {};
    if (w.temp == null) {
      // the preview's stand-in has no temperature of its own: the one the Home tile shows
      var t = parseInt((EZ.$('[data-weather=temp]') || {}).textContent, 10);
      if (!isNaN(t)) w = Object.assign({}, w, { temp: t });
    }
    if (!w.days || !w.next || !w.days.length || !w.next.length) {
      body.innerHTML = '<div class="wx-hero"><div class="wx-name">' + EZ.esc(w.place || 'Weather') + '</div></div>' +
        '<div class="wx-empty">' + (w.offline ? 'The forecast needs the internet. It comes back on its own.' : 'The forecast is on its way.') + '</div>';
      hints.innerHTML = '<span><kbd>Back</kbd>Home</span>';
      return;
    }
    var wu = (w.units && w.units.wind) || 'm/s', diff = w.normalHigh != null && w.high != null ? w.high - w.normalHigh : null;
    var avg = diff == null ? '' : ' <span>· ' + (diff === 0 ? 'a usual high for today' : Math.abs(diff) + '° ' + (diff > 0 ? 'above' : 'below') + ' the usual high') + '</span>';
    body.innerHTML =
      '<div class="wx-hero"><div class="wx-where">' + I.pin + 'My location</div><div class="wx-name">' + EZ.esc(w.place || '') + '</div>' +
      '<div class="wx-temp">' + deg(w.temp) + '</div><div class="wx-cond">' + EZ.esc(w.condition || '') + '</div>' +
      '<div class="wx-hl">H:' + deg(w.high) + '  L:' + deg(w.low) + avg + '</div></div>' +
      '<div class="wx-grid">' + windCard(w, wu) + moonCard() + condsCard(w) + sunCard(w) + uvCard(w) + daysCard(w) + humidityCard(w) + pressureCard(w) +
      feelsCard(w) + rainCard(w) + visCard(w) + airCard(w) + '</div>';
    paintMoon();
    var wet = !!w.sky && ['rain', 'drizzle', 'storm'].indexOf(w.sky.kind) >= 0;
    root.classList.toggle('wet', wet);
    if (wet) root.style.setProperty('--drops', 'url(' + dropTile() + ')');
    EZ.$$('.wx-chip', body).forEach(function (c) { c.addEventListener('click', function () { setView(+c.getAttribute('data-view')); }); });
    scrollStrip();
    hints.innerHTML = '<span><kbd>◀ ▶</kbd>Hours</span><span><kbd>▲ ▼</kbd>Temperature, rain, wind</span><span><kbd>Back</kbd>Home</span>';
  }

  // the moon as the sky paints it tonight (sky.js draws the real phase), copied into the card
  function paintMoon() {
    var src = EZ.$('#moon .crescent canvas'), c = EZ.$('#wx-moon', body);
    if (!src || !c) return;
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  }

  // droplets on glass: a couple of dozen beads, each with a bright rim and a darker body, drawn once
  function dropTile() {
    if (drops) return drops;
    var c = document.createElement('canvas'), S = 220, g, i;
    c.width = c.height = S; g = c.getContext('2d');
    for (i = 0; i < 26; i++) {
      var x = Math.random() * S, y = Math.random() * S, r = 1.2 + Math.random() * (i < 5 ? 3.2 : 1.8);
      var rg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,0.32)'); rg.addColorStop(0.5, 'rgba(200,215,235,0.10)'); rg.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2); g.fill();
    }
    drops = c.toDataURL('image/png');
    return drops;
  }

  // ---------- keys ----------
  var VISIBLE = 13, CELL = 82;
  function scrollStrip() {
    var el = EZ.$('#wx-strip', body);
    if (!el) return;
    scroll = Math.max(0, Math.min(Math.max(0, strip.length - VISIBLE), scroll));
    el.style.transform = scroll ? 'translateX(' + (-scroll * CELL) + 'px)' : '';
  }
  function setView(v) { view = (v + 3) % 3; render(); }

  var layer = {
    name: 'wx',
    left: function () { scroll -= 4; scrollStrip(); },
    right: function () { scroll += 4; scrollStrip(); },
    up: function () { setView(view - 1); },
    down: function () { setView(view + 1); },
    ok: function () { close(); },
    back: function () { close(); }
  };

  // ---------- the Home tile ----------
  // → from the gear lands on the weather tile; ← goes back to the gear, ↓ or Back to the dock
  var tileLayer = {
    name: 'wxtile',
    left: function () { leaveTile(); EZ.settings.focusGear(); },
    down: function () { leaveTile(); EZ.dock.wake(); },
    back: function () { leaveTile(); EZ.dock.wake(); },
    ok: function () { open(); }
  };
  function focusTile() {
    if (EZ.focus.top() === 'wxtile') return;
    EZ.dock.rest();
    tile.classList.add('focused');
    var w = (EZ.weather.data && EZ.weather.data()) || {};
    EZ.$('#spot-name').textContent = 'Weather';
    EZ.$('#spot-sub').textContent = (w.place ? w.place + ' · ' : '') + 'Hour by hour, 10 days, wind, UV, the moon and more';
    EZ.focus.push(tileLayer);
  }
  function leaveTile() {
    tile.classList.remove('focused');
    EZ.focus.pop('wxtile');
  }

  // ---------- open / close ----------
  function open() {
    if (isOpen) return;
    isOpen = true;
    if (EZ.focus.top() === 'wxtile') leaveTile();
    view = 0; scroll = 0;
    render();
    root.setAttribute('aria-hidden', 'false');
    EZ.focus.push(layer);
    // the page is drawn first; it starts moving a frame later (the same rule as All apps and Settings)
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (!isOpen) return;
        EZ.hold(800);
        root.classList.add('open');
        document.body.classList.add('st-open', 'wx-open');   // pauses the tile shimmer; fades Home away
        EZ.perf('Weather slide', 650);
      });
    });
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    EZ.hold(800);
    root.classList.remove('open');
    document.body.classList.remove('st-open', 'wx-open');
    root.setAttribute('aria-hidden', 'true');
    EZ.focus.pop('wx');
    focusTile();   // back on the tile it came from
  }

  EZ.wx = {
    start: function () {
      root = EZ.$('#wx'); body = EZ.$('#wx-body'); hints = EZ.$('#wx-hints'); tile = EZ.$('#weather');
      tile.addEventListener('click', function () { open(); });
      tile.addEventListener('mouseenter', function () { if (EZ.focus.top() === 'dock') focusTile(); });
      tile.addEventListener('mouseleave', function () { if (EZ.focus.top() === 'wxtile') { leaveTile(); EZ.dock.wake(); } });
    },
    open: open,
    close: function () { if (isOpen) close(); if (EZ.focus.top() === 'wxtile') { leaveTile(); EZ.dock.wake(); } },
    isOpen: function () { return isOpen; },
    focusTile: focusTile,
    icon: icon
  };
})();
