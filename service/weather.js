'use strict';
// Weather from Open-Meteo (no key), cached 30 minutes in memory and on disk; a stale answer
// under 24 h old is served when the network fails. Pattern from CleanYourTV's helper/weather.js.
const https = require('https');
const config = require('./config');
const location = require('./location');

const URL = process.env.EMZEE_WEATHER_URL || 'https://api.open-meteo.com/v1/forecast';
const EVERY = 30 * 60 * 1000;
const OLD = 24 * 3600 * 1000;

// WMO weather codes -> words and how many clouds the sky draws
function describe(code) {
  if (code === 0) return ['Clear', 'clear'];
  if (code === 1) return ['Mostly clear', 'clear'];
  if (code === 2) return ['Partly cloudy', 'partly cloudy'];
  if (code === 3) return ['Cloudy', 'cloudy'];
  if (code === 45 || code === 48) return ['Fog', 'cloudy'];
  if (code >= 51 && code <= 57) return ['Drizzle', 'cloudy'];
  if (code >= 61 && code <= 67) return ['Rain', 'cloudy'];
  if (code >= 71 && code <= 77) return ['Snow', 'cloudy'];
  if (code >= 80 && code <= 82) return ['Showers', 'cloudy'];
  if (code >= 85 && code <= 86) return ['Snow showers', 'cloudy'];
  if (code >= 95) return ['Thunderstorm', 'cloudy'];
  return ['Cloudy', 'partly cloudy'];
}

function get(url) {
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { headers: { 'user-agent': 'emzee-weather' } }, function (res) {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('open-meteo ' + res.statusCode)); }
      let body = '', size = 0;
      res.setEncoding('utf8');
      res.on('data', function (d) {
        size += d.length;
        if (size > 512 * 1024) { req.destroy(); reject(new Error('too big')); } else body += d;
      });
      res.on('end', function () { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.setTimeout(15000, function () { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

// "2026-10-30T07:02" (local time, timezone=auto) -> "07:02"
function hhmm(iso) { const m = /T(\d\d:\d\d)/.exec(iso || ''); return m ? m[1] : null; }

// What the sky should show for a WMO code: the kind of weather and how strong (0..1), from the code and the
// actual precipitation (mm in the last hour), so light rain looks light.
function sky(code, precip) {
  const p = Math.min(1, (precip || 0) / 4);
  if (code >= 95) return { kind: 'storm', strength: Math.max(0.75, p) };
  if (code === 45 || code === 48) return { kind: 'fog', strength: 0.7 };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', strength: code === 75 || code === 86 ? 0.9 : code === 71 || code === 85 ? 0.4 : 0.65 };
  if (code >= 51 && code <= 57) return { kind: 'drizzle', strength: Math.max(0.25, p) };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { kind: 'rain', strength: Math.max(code === 65 || code === 82 ? 0.9 : code === 61 || code === 80 ? 0.4 : 0.6, p) };
  if (code === 3) return { kind: 'cloudy', strength: 1 };
  if (code === 2) return { kind: 'partly', strength: 0.5 };
  return { kind: 'clear', strength: 0 };
}

function num(v, d) { return typeof v === 'number' && isFinite(v) ? (d ? Math.round(v * d) / d : Math.round(v)) : null; }
function weekday(iso) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso + 'T12:00').getDay()]; }

// Open-Meteo JSON -> what the launcher shows (the Home tile, the sky and the weather page).
// The request includes yesterday (past_days=1) for the rain of the last 24 hours and the pressure trend, so the
// daily arrays start with yesterday: everything is indexed from today's position.
function shape(j, loc, normal) {
  const cur = j.current || {}, d = j.daily || {}, h = j.hourly || {};
  const w = describe(cur.weather_code);
  const now = cur.time || '';
  const times = h.time || [], A = function (k, i) { return (h[k] || [])[i]; };
  const start = Math.max(times.findIndex(function (t) { return t > now; }), 0);
  const nowIdx = Math.max(start - 1, 0);
  const di = Math.max((d.time || []).indexOf(now.slice(0, 10)), 0);   // today in the daily arrays
  const D = function (k, i) { return (d[k] || [])[di + i]; };
  const sum = function (k, from, to) { let t = 0; for (let i = Math.max(from, 0); i < Math.min(to, times.length); i++) t += A(k, i) || 0; return Math.round(t * 10) / 10; };

  // the Home tile: next four whole hours
  const hours = [];
  for (let i = start; i < times.length && hours.length < 4; i++) hours.push({ t: hhmm(times[i]), v: Math.round(A('temperature_2m', i)) });
  // the weather page: the next 24 hours, everything the three views need
  const next = [];
  for (let i = start; i < times.length && next.length < 24; i++) {
    next.push({ t: hhmm(times[i]), temp: num(A('temperature_2m', i)), code: A('weather_code', i), pop: num(A('precipitation_probability', i)),
      mm: num(A('precipitation', i), 10), wind: num(A('wind_speed_10m', i)), gust: num(A('wind_gusts_10m', i)), dir: num(A('wind_direction_10m', i)),
      day: A('is_day', i) !== 0 });
  }
  // ten days, each with its wind range from the hours
  const days = [];
  for (let k = 0; k < 10 && D('temperature_2m_max', k) != null; k++) {
    const date = D('time', k);
    let wmin = null, wmax = null;
    times.forEach(function (t, i) { if (t.slice(0, 10) === date) { const v = A('wind_speed_10m', i); if (v != null) { wmin = wmin == null ? v : Math.min(wmin, v); wmax = wmax == null ? v : Math.max(wmax, v); } } });
    days.push({
      date: date, wd: k === 0 ? 'Today' : weekday(date), code: D('weather_code', k),
      max: num(D('temperature_2m_max', k)), min: num(D('temperature_2m_min', k)),
      pop: num(D('precipitation_probability_max', k)), rain: num(D('precipitation_sum', k), 10),
      windMin: num(wmin), windMax: num(wmax), gust: num(D('wind_gusts_10m_max', k)), uv: num(D('uv_index_max', k), 10)
    });
  }
  // the highest UV still to come today
  let uvLeft = null;
  for (let i = start; i < times.length && times[i].slice(0, 10) === now.slice(0, 10); i++) uvLeft = Math.max(uvLeft || 0, A('uv_index', i) || 0);
  const p3 = A('pressure_msl', Math.max(nowIdx - 3, 0)), pNow = cur.pressure_msl;
  const high = Math.round(D('temperature_2m_max', 0));
  return {
    condition: w[0], clouds: w[1],
    temp: Math.round(cur.temperature_2m),
    high: high,
    low: Math.round(D('temperature_2m_min', 0)),
    sunrise: hhmm(D('sunrise', 0)),
    sunset: hhmm(D('sunset', 0)),
    hours: hours,
    // the rest is for the sky and the weather page
    sunriseNext: hhmm(D('sunrise', 1)), sunsetNext: hhmm(D('sunset', 1)),
    code: cur.weather_code, isDay: cur.is_day !== 0,
    sky: sky(cur.weather_code, cur.precipitation),
    feels: num(cur.apparent_temperature), humidity: num(cur.relative_humidity_2m), dew: num(cur.dew_point_2m),
    wind: { speed: num(cur.wind_speed_10m), gust: num(cur.wind_gusts_10m), dir: num(cur.wind_direction_10m) },
    precip: num(cur.precipitation, 10), cloudCover: num(cur.cloud_cover),
    pressure: num(pNow), pressureTrend: pNow != null && p3 != null ? (pNow - p3 > 1 ? 'rising' : p3 - pNow > 1 ? 'falling' : 'steady') : null,
    visibility: cur.visibility != null ? Math.round(cur.visibility / 100) / 10 : null,   // km
    rainLast24: sum('precipitation', start - 24, start), rainNext24: sum('precipitation', start, start + 24),
    uv: num(A('uv_index', nowIdx), 10), uvLeft: uvLeft == null ? null : Math.round(uvLeft * 10) / 10,
    popNow: num(A('precipitation_probability', nowIdx)),
    daylight: num(D('daylight_duration', 0) / 3600, 10),
    normalHigh: normal == null ? null : Math.round(normal),
    next: next, days: days,
    units: { temp: (j.current_units || {}).temperature_2m || '°C', wind: (j.current_units || {}).wind_speed_10m || 'm/s' },
    v: 3,
    place: (loc && loc.name) || '',
    lat: loc && loc.lat, lon: loc && loc.lon,
    at: Date.now()
  };
}

// The usual high for today: the average daily maximum within three days of today's date over the last ten
// years (Open-Meteo's historical archive, free). Fetched once per place and kept a month in data/normals.json.
const ARCHIVE = process.env.EMZEE_ARCHIVE_URL || 'https://archive-api.open-meteo.com/v1/archive';
function normalHigh(loc, unit) {
  const key = loc.lat.toFixed(1) + ',' + loc.lon.toFixed(1) + ',' + unit;
  const file = require('path').join(config.P.DATA, 'normals.json');
  const doy = function (date) { const t = new Date(date + 'T12:00Z'); return Math.floor((t - Date.UTC(t.getUTCFullYear(), 0, 0)) / 864e5); };
  const today = doy(new Date().toISOString().slice(0, 10));
  const pick = function (byDay) {
    let t = 0, n = 0;
    for (let k = -3; k <= 3; k++) { const v = byDay[((today + k + 365) % 366) || 366]; if (v != null) { t += v; n++; } }
    return n ? t / n : null;
  };
  const kept = config.readJson(file, null);
  if (kept && kept.key === key && Date.now() - kept.at < 30 * 864e5) return Promise.resolve(pick(kept.byDay));
  const y = new Date().getFullYear();
  return get(ARCHIVE + '?latitude=' + loc.lat.toFixed(2) + '&longitude=' + loc.lon.toFixed(2) + '&start_date=' + (y - 10) + '-01-01&end_date=' + (y - 1) + '-12-31' +
    '&daily=temperature_2m_max&timezone=auto' + (unit === 'f' ? '&temperature_unit=fahrenheit' : '')).then(function (j) {
    const t = (j.daily || {}).time || [], v = (j.daily || {}).temperature_2m_max || [], acc = {};
    t.forEach(function (date, i) { if (v[i] == null) return; const k = doy(date); (acc[k] = acc[k] || []).push(v[i]); });
    const byDay = {};
    Object.keys(acc).forEach(function (k) { byDay[k] = Math.round(acc[k].reduce(function (a, b) { return a + b; }, 0) / acc[k].length * 10) / 10; });
    try { config.writeJson(file, { key: key, at: Date.now(), byDay: byDay }); } catch (e) { /* optional */ }
    return pick(byDay);
  }).catch(function () { return kept && kept.key === key ? pick(kept.byDay) : null; });
}

// Air quality and pollen (Open-Meteo's sister service, also free); optional, cached an hour
const AIR = process.env.EMZEE_AIR_URL || 'https://air-quality-api.open-meteo.com/v1/air-quality';
let air = null;
function airNow(loc) {
  const key = loc.lat.toFixed(2) + ',' + loc.lon.toFixed(2);
  if (air && air.key === key && Date.now() - air.at < 60 * 60 * 1000) return Promise.resolve(air.data);
  return get(AIR + '?latitude=' + loc.lat.toFixed(4) + '&longitude=' + loc.lon.toFixed(4) +
    '&current=european_aqi,pm2_5,pm10,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen&timezone=auto').then(function (j) {
    const c = j.current || {};
    const pollen = [['Birch', c.birch_pollen], ['Grass', c.grass_pollen], ['Alder', c.alder_pollen], ['Mugwort', c.mugwort_pollen], ['Ragweed', c.ragweed_pollen]]
      .filter(function (p) { return typeof p[1] === 'number'; })
      .map(function (p) { return { name: p[0], value: Math.round(p[1]) }; });
    const data = { aqi: num(c.european_aqi), pm25: num(c.pm2_5), pm10: num(c.pm10), pollen: pollen };
    air = { key: key, at: Date.now(), data: data };
    return data;
  }).catch(function () { return air && air.key === key ? air.data : null; });
}

let mem = null;

// Finds the location first (location.js). With no forecast to give (offline, nothing cached), answers with just
// the place, so the page can still work out the sun from the coordinates.
function current() {
  return location.resolve().then(function (loc) {
    if (!loc) throw Object.assign(new Error('no location: no internet and an unknown time zone'), { status: 404 });
    return forecast(loc).catch(function () {
      return { offline: true, place: loc.name || '', lat: loc.lat, lon: loc.lon, at: Date.now() };
    });
  });
}

function forecast(loc) {
  const conf = config.get();
  const key = 'v3,' + loc.lat.toFixed(2) + ',' + loc.lon.toFixed(2) + ',' + conf.unit;
  if (!mem) mem = config.readJson(config.P.WEATHER, null);
  if (mem && mem.key === key && Date.now() - mem.data.at < EVERY) return Promise.resolve(mem.data);

  const url = URL + '?latitude=' + loc.lat.toFixed(4) + '&longitude=' + loc.lon.toFixed(4) +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,weather_code,cloud_cover,' +
    'pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,is_day' +
    '&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,uv_index,wind_speed_10m,wind_gusts_10m,' +
    'wind_direction_10m,pressure_msl,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,uv_index_max,' +
    'precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max' +
    '&timezone=auto&past_days=1&forecast_days=11' + (conf.unit === 'f' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '&wind_speed_unit=ms');
  return Promise.all([get(url), airNow(loc), normalHigh(loc, conf.unit)]).then(function (r) {
    const j = r[0];
    mem = { key: key, data: shape(j, loc, r[2]) };
    mem.data.air = r[1];
    try { config.writeJson(config.P.WEATHER, mem); } catch (e) { /* cache is optional */ }
    return mem.data;
  }).catch(function (e) {
    if (mem && mem.key === key && Date.now() - mem.data.at < OLD) return mem.data;
    throw e;
  });
}

module.exports = { current: current, forecast: forecast, shape: shape, describe: describe, sky: sky };
