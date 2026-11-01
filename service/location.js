'use strict';
// Where the TV is, for the weather and the sun. Kept in config.location, from the best source available:
//   1. set by hand (POST /api/config {"location":{...}}, emzee Settings or Setup): never replaced;
//   2. the postcode in the TV's own Settings > General > Location (settingsservice "option" zipcode), looked up
//      once per postcode with OpenStreetMap's Nominatim (it knows postcodes; Open-Meteo's geocoder doesn't);
//   3. the internet connection (an IP lookup; often the provider's city rather than the town);
//   4. without internet, the TV's time zone (the zone's namesake city: rough, sent nowhere).
// A weaker guess is replaced by a better one once it's available (tried at most every 30 minutes).
const fs = require('fs');
const https = require('https');
const luna = require('./luna');
const config = require('./config');
const TZ = require('./tz');

const RETRY = 30 * 60 * 1000;
// free HTTPS lookups that need no key, tried in order; each turns its JSON into { lat, lon, name }
const LOOKUPS = (process.env.EMZEE_GEO_URLS ? process.env.EMZEE_GEO_URLS.split(',') : ['https://ipapi.co/json/', 'https://ipwho.is/'])
  .map(function (url) {
    return {
      url: url,
      read: function (j) {
        if (j.success === false || j.error) return null;
        return { lat: Number(j.latitude), lon: Number(j.longitude), name: j.city || '' };
      }
    };
  });

let lastTry = 0, pending = null;

function getJson(url) {
  return new Promise(function (resolve, reject) {
    // Nominatim's rules ask for a user agent that names the app
    const req = https.get(url, { headers: { 'user-agent': 'emzee-tv-launcher/0.3 (webOS home screen; one lookup per postcode)' } }, function (res) {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(url + ' ' + res.statusCode)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', function (d) { body += d; if (body.length > 64 * 1024) req.destroy(new Error('too big')); });
      res.on('end', function () { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.setTimeout(8000, function () { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

function byIp(i) {
  i = i || 0;
  if (i >= LOOKUPS.length) return Promise.reject(new Error('no IP lookup answered'));
  return getJson(LOOKUPS[i].url).then(function (j) {
    const l = LOOKUPS[i].read(j);
    if (!l || !(l.lat >= -90 && l.lat <= 90 && l.lon >= -180 && l.lon <= 180)) throw new Error('bad answer');
    return { lat: l.lat, lon: l.lon, name: l.name, source: 'ip' };
  }).catch(function () { return byIp(i + 1); });
}

// the TV's time zone: the system service first, then what this process sees
function timeZone() {
  return luna.call('luna://com.palm.systemservice/time/getSystemTime', {}, 3000).then(function (r) {
    if (r && typeof r.timezone === 'string' && TZ[r.timezone]) return r.timezone;
    const env = process.env.TZ;
    if (env && TZ[env]) return env;
    try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; if (TZ[z]) return z; } catch (e) { /* no Intl */ }
    try { const m = /zoneinfo\/(.+)$/.exec(fs.readlinkSync('/etc/localtime')); if (m && TZ[m[1]]) return m[1]; } catch (e) { /* not a link */ }
    return null;
  });
}

function byTimeZone() {
  return timeZone().then(function (z) {
    if (!z) return null;
    const c = TZ[z];
    return { lat: c[0], lon: c[1], name: z.split('/').pop().replace(/_/g, ' '), source: 'timezone' };
  });
}

function save(l) {
  console.log('[emzee] location from ' + ({ tv: "the TV's postcode " + l.zip, ip: 'the internet connection' }[l.source] || 'the time zone') + ': ' +
    (l.name || '?') + ' (' + l.lat.toFixed(3) + ', ' + l.lon.toFixed(3) + ')');
  try { config.set({ location: l }); } catch (e) { /* keep going with it in memory */ }
  return l;
}

// Place search for setting the location by hand (emzee Setup): Open-Meteo's free geocoder.
const SEARCH = process.env.EMZEE_PLACES_URL || 'https://geocoding-api.open-meteo.com/v1/search';
function search(q) {
  q = String(q || '').trim().slice(0, 60);
  if (q.length < 2) return Promise.resolve([]);
  return getJson(SEARCH + '?count=8&language=en&format=json&name=' + encodeURIComponent(q)).then(function (j) {
    return (j.results || []).map(function (p) {
      return { name: p.name, region: p.admin1 || '', country: p.country || '', lat: p.latitude, lon: p.longitude };
    }).filter(function (p) { return p.name && p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180; });
  });
}

// ---------- the TV's postcode ----------
let zipRead = null, zipAt = 0, zipMiss = null, zipMissAt = 0;
function tvPostcode() {
  if (zipRead && Date.now() - zipAt < 10 * 60 * 1000) return Promise.resolve(zipRead);
  return luna.call('luna://com.webos.settingsservice/getSystemSettings',
    { category: 'option', keys: ['zipcode', 'smartServiceCountryCode2'] }, 4000).then(function (r) {
    const s = (r && r.settings) || {}, zip = String(s.zipcode || '').trim(), cc = String(s.smartServiceCountryCode2 || '').trim();
    zipRead = { zip: /^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(zip) ? zip : null, cc: /^[A-Za-z]{2}$/.test(cc) ? cc.toLowerCase() : '' };
    zipAt = Date.now();
    return zipRead;
  });
}

const POSTCODES = process.env.EMZEE_POSTCODE_URL || 'https://nominatim.openstreetmap.org/search';
function byPostcode(p) {
  return getJson(POSTCODES + '?format=json&addressdetails=1&limit=1&postalcode=' + encodeURIComponent(p.zip) +
    (p.cc ? '&countrycodes=' + p.cc : '')).then(function (list) {
    const hit = list && list[0], a = (hit && hit.address) || {};
    const lat = Number(hit && hit.lat), lon = Number(hit && hit.lon);
    if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) throw new Error('postcode not found');
    // the town people would say: the city or town, else the municipality without its "kommun"/"Municipality"
    const name = a.city || a.town || a.village || String(a.municipality || '').replace(/\s+(kommun|Municipality)$/i, '') || a.suburb || p.zip;
    return { lat: lat, lon: lon, name: name, source: 'tv', zip: p.zip };
  });
}

// the location to use now, or null when there is none at all
function resolve() {
  const have = config.get().location;
  if (have && have.source === 'manual') return Promise.resolve(have);
  if (pending) return pending;
  pending = tvPostcode().catch(function () { return { zip: null }; }).then(function (p) {
    if (p.zip && have && have.source === 'tv' && have.zip === p.zip) return have;
    // a postcode that didn't look up is tried again after RETRY, not on every weather call
    if (p.zip && !(zipMiss === p.zip && Date.now() - zipMissAt < RETRY)) {
      return byPostcode(p).then(save, function () { zipMiss = p.zip; zipMissAt = Date.now(); return fallback(have); });
    }
    return fallback(have);
  }).then(function (l) { pending = null; return l; }, function () { pending = null; return have || null; });
  return pending;
}

// without a postcode: keep what we have unless it's only a time-zone guess, else the internet, else the time zone
function fallback(have) {
  if (have && have.source !== 'timezone') return have;
  if (have && Date.now() - lastTry < RETRY) return have;
  lastTry = Date.now();
  return byIp().then(save).catch(function () { return have || byTimeZone().then(function (l) { return l ? save(l) : null; }); });
}

// Probe: what the TV's own settings know about where it is (Settings > General > Location: the postcode, and
// the weather location LG's own Home uses). LG doesn't document where webOS 25 keeps these, so this reads the
// system settings categories and writes every location-looking key to the helper log, once per start.
// Read-only; nothing here changes the TV. Once we know the keys, the location can come from them first.
const LOOKS = /zip|post|city|loc|weather|lat|lon|geo|area|region|country|address/i;
function probeTv() {
  const cats = ['option', 'general', 'location', 'weather', 'other', 'commercial', 'network', 'time'];
  return Promise.all(cats.map(function (c) {
    return luna.call('luna://com.webos.settingsservice/getSystemSettings', { category: c }, 4000).then(function (r) {
      const s = (r && r.settings) || {};
      const hits = Object.keys(s).filter(function (k) { return LOOKS.test(k) || LOOKS.test(JSON.stringify(s[k]).slice(0, 200)) && /weather|loc/i.test(k); });
      return { category: c, ok: r.returnValue !== false, hits: hits.map(function (k) { return k + '=' + JSON.stringify(s[k]).slice(0, 160); }) };
    });
  })).then(function (all) {
    all.forEach(function (a) {
      if (a.hits.length) console.log('[emzee] TV settings (' + a.category + '): ' + a.hits.join('  '));
    });
    if (!all.some(function (a) { return a.hits.length; })) console.log('[emzee] TV settings: no location keys found in ' + cats.join(', '));
    return all;
  });
}

module.exports = { resolve: resolve, timeZone: timeZone, search: search, probeTv: probeTv };
