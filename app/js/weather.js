// Weather panel, the hours strip and the ambient line. Also hands sun times and cloud cover to the sky.
(function () {
  var data = null;

  function fmt(h) { var m = Math.round((h % 1) * 60); return EZ.pad(Math.floor(h) + (m === 60 ? 1 : 0)) + ':' + EZ.pad(m % 60); }

  // Sunrise and sunset for a place and day (NOAA's approximation, within a minute or two), as local "HH:MM".
  // Used when there is a location but no forecast (offline). Null in polar day or night.
  function sunTimes(lat, lon, d) {
    var rad = Math.PI / 180;
    var n = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5);
    var g = 2 * Math.PI / 365 * (n - 1);
    var eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
      0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var cosH = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
    if (cosH > 1 || cosH < -1) return null;
    var ha = Math.acos(cosH) / rad, tz = -d.getTimezoneOffset();
    function hm(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return EZ.pad(Math.floor(min / 60)) + ':' + EZ.pad(min % 60); }
    return [hm(720 - 4 * (lon + ha) - eqt + tz), hm(720 - 4 * (lon - ha) - eqt + tz)];
  }

  function set(name, text) {
    EZ.$$('[data-weather=' + name + ']').forEach(function (e) { e.textContent = text; });
  }

  // demo hours, the way the canvas makes them: drifting down from the current temperature
  function demoHours(temp) {
    var hh = Math.floor(EZ.sky.hour()), day = EZ.sky.phase() === 'day';
    return [1, 2, 3, 4].map(function (n) {
      return { t: EZ.pad((hh + n) % 24) + ':00', v: temp + (day ? (n < 2 ? 1 : -n) : -n) };
    });
  }

  function render() {
    if (!data) return;
    var w = {}, s = EZ.sky.times(), hour = EZ.sky.hour();
    for (var k in data) w[k] = data[k];
    var sun = hour < s.rise || hour >= s.set + 0.9 ? 'Sunrise ' + fmt(s.rise) : 'Sunset ' + fmt(s.set);
    // the place, so it's clear where emzeeOS thinks the TV is
    set('sunline', (w.place ? w.place + ' · ' : '') + sun);
    if (w.offline) {
      // a location but no forecast: say so rather than show made-up numbers
      set('condition', 'No connection');
      set('range', 'Weather returns when online');
      set('temp', '–');
      set('summary', 'No connection');
      EZ.$('#hours').innerHTML = '';
      return;
    }
    if (w.temp == null) w.temp = { night: 9, dawn: 10, day: 16, dusk: 13 }[EZ.sky.phase()] || 12;
    set('condition', w.condition);
    set('range', 'H ' + w.high + '° L ' + w.low + '°');
    set('temp', w.temp + '°');
    set('summary', w.condition + ' · ' + w.temp + '°');

    var hours = w.hours || demoHours(w.temp);
    EZ.$('#hours').innerHTML = hours.map(function (h) {
      return '<div class="hour"><span class="t">' + EZ.esc(h.t) + '</span><span class="v">' + EZ.esc(h.v) + '°</span></div>';
    }).join('');
  }

  // hand the sun and the clouds to the sky: the forecast's sun times, else worked out from the location
  var shown = null;
  function apply(w) {
    // the same answer as last time (the helper caches 30 min): nothing to redraw
    var key = JSON.stringify(w, function (k, v) { return k === 'at' ? undefined : v; });
    if (key === shown) return;
    shown = key;
    data = w;
    var sun = w.sunrise ? [w.sunrise, w.sunset] : (w.lat != null && w.lon != null ? sunTimes(w.lat, w.lon, new Date()) : null);
    if (sun) EZ.sky.setSun(sun[0], sun[1]);
    if (w.clouds) EZ.sky.setCover(w.clouds);
    // rain, snow, fog or storms in the sky, and clouds that drift with the wind
    // the sky wants km/h; the forecast speaks m/s (metric), mph, or km/h (older answers)
    var u = (w.units || {}).wind || 'km/h', toKmh = /mp/.test(u) ? 1.609 : /m\/s/.test(u) ? 3.6 : 1;
    if (w.sky) EZ.sky.setWeather(w.sky, w.wind && w.wind.speed != null ? w.wind.speed * toKmh : null, w.wind && w.wind.dir);
    render();
  }

  EZ.weather = {
    start: function () {
      EZ.api.weather().then(apply);
      EZ.on('minute', render);
      // refresh every 30 minutes (the helper caches upstream); this also moves the sun on to the new day
      setInterval(function () { EZ.api.weather().then(apply); }, 30 * 60000);
    },
    // on coming back to Home: a location set in emzeeOS Setup shows at once (the helper caches the rest)
    refresh: function () { EZ.api.weather().then(apply); },
    // the full forecast, for the weather page
    data: function () { return data; },
    sunTimes: sunTimes
  };
})();
