'use strict';
// emzeeOS helper: supplies what the launcher page can't get on its own. Listens on 127.0.0.1 only.
//   GET  /api/ping            version, node
//   GET  /api/apps            [{id,name,icon,hidden}] in the user's order
//   GET  /icon/<id>           the app's icon
//   POST /api/launch {id}     launch an app or input
//   GET  /api/inputs          HDMI inputs, Live TV, screen share
//   GET  /api/config          settings; POST merges a partial update
//   GET  /api/weather         Open-Meteo, cached 30 min; finds the location itself (location.js)
//   GET  /api/fireplace       the fireplace screen saver's video: none | downloading (progress) | ready | failed
//   POST /api/fireplace       start (or resume) downloading it on the TV; GET /fireplace streams it (ranges)
//   GET  /api/location        where emzeeOS thinks the TV is ({location}: name, lat, lon, source ip|timezone|manual)
//   GET  /api/places?q=       place search for setting it by hand (Open-Meteo geocoding); POST /api/config
//                             {"location":{lat,lon,name}} sets it, {"location":null} goes back to automatic
//   GET  /wallpaper           data/wallpaper.jpg, when present
//   POST /api/ready           the page is up; boot.sh's failsafe waits for this
const http = require('http');
const fs = require('fs');
const config = require('./config');
const apps = require('./apps');
const inputs = require('./inputs');
const weather = require('./weather');
const location = require('./location');
const fireplace = require('./fireplace');

const PORT = Number(process.env.EMZEE_PORT) || 8775;
const VERSION = '0.6.6';
// EMZEE_DEV=1 lets the desktop preview (http://localhost:<port>) call in; on the TV the page is file:// (Origin "null")
const DEV = process.env.EMZEE_DEV === '1';

// Node 15+ exits on an unhandled rejection; a launcher helper must not.
process.on('unhandledRejection', function (e) { console.error('[emzee] unhandled', e && e.message); });

// Only our own page may call in. Other web pages on the TV would send their own Origin;
// a Host check stops DNS rebinding.
function allowedOrigin(origin) {
  if (!origin || origin === 'null' || /^file:/.test(origin)) return true;
  return DEV && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
function allowedHost(host) {
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host || '');
}

function send(res, status, body, origin) {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (origin) { headers['access-control-allow-origin'] = origin; headers.vary = 'Origin'; }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', function (d) { body += d; if (body.length > 64 * 1024) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', function () {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { reject(Object.assign(new Error('bad JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function handle(req, res) {
  const origin = req.headers.origin;
  if (!allowedHost(req.headers.host) || !allowedOrigin(origin)) return send(res, 403, { error: 'forbidden' });
  const allow = origin || null;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': allow || '*', 'access-control-allow-methods': 'GET, POST',
      'access-control-allow-headers': 'content-type', 'access-control-max-age': '600', vary: 'Origin'
    });
    return res.end();
  }
  const url = req.url.split('?')[0];
  const ok = function (body) { send(res, 200, body, allow); };
  const fail = function (e) { send(res, e.status || 500, { error: String(e.message || e) }, allow); };

  if (req.method === 'GET' && url === '/api/ping') return ok({ ok: true, version: VERSION, node: process.version });
  if (req.method === 'GET' && url === '/api/apps') return apps.list().then(function (a) { ok({ apps: a }); }, fail);
  if (req.method === 'GET' && url.indexOf('/icon/') === 0) {
    const id = decodeURIComponent(url.slice(6));
    if (!config.ID.test(id)) return send(res, 400, { error: 'bad id' }, allow);
    return apps.icon(id, res);
  }
  if (req.method === 'GET' && url === '/api/inputs') return inputs.list().then(function (i) { ok({ inputs: i }); }, fail);
  if (req.method === 'GET' && url === '/api/weather') return weather.current().then(ok, fail);
  if (req.method === 'GET' && url === '/api/fireplace') return ok(fireplace.status());
  if (req.method === 'GET' && url === '/fireplace') return fireplace.serve(req, res, allow);
  if (req.method === 'GET' && url === '/api/location') return location.resolve().then(function (l) { ok({ location: l }); }, fail);
  if (req.method === 'GET' && url === '/api/places') {
    const q = new URLSearchParams(req.url.split('?')[1] || '').get('q') || '';
    return location.search(q).then(function (p) { ok({ places: p }); }, fail);
  }
  if (req.method === 'GET' && url === '/api/config') return ok(config.get());
  if (req.method === 'GET' && url === '/wallpaper') {
    return fs.readFile(config.P.WALLPAPER, function (err, buf) {
      if (err) return send(res, 404, { error: 'no wallpaper' }, allow);
      const h = { 'content-type': 'image/jpeg', 'cache-control': 'no-cache' };
      if (allow) h['access-control-allow-origin'] = allow;
      res.writeHead(200, h); res.end(buf);
    });
  }
  if (req.method === 'POST') {
    return readBody(req).then(function (body) {
      if (url === '/api/launch') {
        if (typeof body.id !== 'string' || !config.ID.test(body.id)) return send(res, 400, { error: 'bad id' }, allow);
        return apps.launch(body.id).then(function (r) { send(res, r.returnValue === false ? 502 : 200, r, allow); });
      }
      if (url === '/api/config') {
        try { return ok(config.set(body)); } catch (e) { return send(res, 400, { error: e.message }, allow); }
      }
      if (url === '/api/fireplace') return ok(fireplace.start());
      if (url === '/api/perf') {
        // one line per measured animation, for tuning on the real TV (emzeeOS Setup > Show log > Helper)
        const n = function (v) { v = Number(v); return isFinite(v) ? Math.round(v) : '?'; };
        const label = String(body.label || '').replace(/[^\w +().-]/g, '').slice(0, 60);
        console.log('[emzee] smoothness, ' + label + ': ' + n(body.fps) + ' fps, worst frame ' + n(body.worst) + ' ms, ' +
          n(body.slow) + ' slow of ' + n(body.frames) + ' frames');
        return ok({ ok: true });
      }
      if (url === '/api/note') {
        console.log('[emzee] ' + String(body.text || '').replace(/[^\w +().,%:-]/g, '').slice(0, 200));
        return ok({ ok: true });
      }
      if (url === '/api/ready') {
        fs.writeFile(config.P.READY, String(Date.now()), function () { ok({ ok: true }); });
        return;
      }
      send(res, 404, { error: 'not found' }, allow);
    }, fail);
  }
  send(res, 404, { error: 'not found' }, allow);
}

if (require.main === module) {
  config.mkdirp(config.P.DATA);
  http.createServer(function (req, res) {
    try { handle(req, res); } catch (e) { send(res, 500, { error: String(e.message || e) }); }
  }).listen(PORT, '127.0.0.1', function () {
    console.log('[emzee] helper ' + VERSION + ' on 127.0.0.1:' + PORT + ' (node ' + process.version + ')');
    // what the TV's own Location settings hold, for the log (see location.js); a few seconds in, off the boot path
    setTimeout(function () { location.probeTv().catch(function () {}); }, 5000);
  });
}

module.exports = { handle: handle };
