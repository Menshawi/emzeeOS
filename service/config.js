'use strict';
// Paths and persistent settings. Everything lives under /media/developer/emzee (never under /usr).
const fs = require('fs');
const path = require('path');

const ROOT = process.env.EMZEE_HOME || '/media/developer/emzee';
const DATA = path.join(ROOT, 'data');
const P = {
  ROOT: ROOT,
  DATA: DATA,
  CONF: path.join(DATA, 'config.json'),
  WEATHER: path.join(DATA, 'weather.json'),
  WALLPAPER: path.join(DATA, 'wallpaper.jpg'),
  READY: process.env.EMZEE_READY || '/tmp/emzee-ready'
};

const DEFAULTS = {
  order: [],          // app ids, dock order first
  hidden: [],         // app ids kept off Home (older versions; Home now shows pins)
  pins: null,         // up to 10 app or input ids on Home, in order; null until the first pin
  dockSize: 6,        // apps shown in the dock (7 is the most that fits beside the inputs)
  inputNames: {},     // input id -> custom name
  location: null,     // { lat, lon, name }
  unit: 'c',          // c | f
  wallpaper: 'sky',   // sky | photo
  clock24: true,      // 24-hour clock, else 12-hour
  idleMinutes: 2,     // the screen saver starts after this many minutes; 0 = never
  motion: 'full',     // full | calm (still clouds, no shooting stars or shimmer)
  saver: 'sky',       // the screen saver: sky | fire (the fireplace video, crackling) | fire-quiet (silent)
  fireSpeed: 0.9      // the fireplace video's playback speed, 0.5 to 1 in steps of 0.1
};

const ID = /^[A-Za-z0-9._-]{1,128}$/;

function mkdirp(dir) {
  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
}

// write to a temp file, then rename, so a power cut never leaves half a file
function writeJson(file, obj) {
  mkdirp(path.dirname(file));
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

let cache = null;

function get() {
  if (!cache) cache = Object.assign({}, DEFAULTS, readJson(P.CONF, {}));
  return cache;
}

function ids(v) {
  if (!Array.isArray(v)) throw new Error('expected a list of app ids');
  const out = [];
  v.forEach(function (id) { if (typeof id === 'string' && ID.test(id) && out.indexOf(id) < 0) out.push(id); });
  return out.slice(0, 500);
}

// Validates a partial update field by field; unknown keys are ignored.
function set(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('expected an object');
  const next = Object.assign({}, get());
  if ('order' in patch) next.order = ids(patch.order);
  if ('hidden' in patch) next.hidden = ids(patch.hidden);
  if ('pins' in patch) next.pins = patch.pins === null ? null : ids(patch.pins).slice(0, 10);
  if ('dockSize' in patch) {
    const n = Number(patch.dockSize);
    if (!(n >= 1 && n <= 7)) throw new Error('dockSize must be 1-7');
    next.dockSize = Math.round(n);
  }
  if ('inputNames' in patch) {
    const names = {};
    Object.keys(patch.inputNames || {}).forEach(function (k) {
      const v = patch.inputNames[k];
      if (ID.test(k) && typeof v === 'string' && v.trim()) names[k] = v.trim().slice(0, 40);
    });
    next.inputNames = names;
  }
  if ('location' in patch) {
    const l = patch.location;
    if (l === null) next.location = null;
    else {
      const lat = Number(l && l.lat), lon = Number(l && l.lon);
      if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) throw new Error('location needs lat and lon');
      // source: tv (the TV's postcode) | ip | timezone (found by location.js) | manual (set by hand, never replaced)
      const source = l.source === 'ip' || l.source === 'timezone' || l.source === 'tv' ? l.source : 'manual';
      next.location = { lat: lat, lon: lon, name: typeof l.name === 'string' ? l.name.slice(0, 60) : '', source: source };
      if (source === 'tv' && typeof l.zip === 'string') next.location.zip = l.zip.slice(0, 12);
    }
  }
  if ('unit' in patch) {
    if (patch.unit !== 'c' && patch.unit !== 'f') throw new Error('unit must be c or f');
    next.unit = patch.unit;
  }
  if ('clock24' in patch) next.clock24 = !!patch.clock24;
  if ('idleMinutes' in patch) {
    const m = Number(patch.idleMinutes);
    if ([0, 2, 5, 10, 30].indexOf(m) < 0) throw new Error('idleMinutes must be 0, 2, 5, 10 or 30');
    next.idleMinutes = m;
  }
  if ('saver' in patch) {
    if (['sky', 'fire', 'fire-quiet'].indexOf(patch.saver) < 0) throw new Error('saver must be sky, fire or fire-quiet');
    next.saver = patch.saver;
  }
  if ('fireSpeed' in patch) {
    const f = Math.round(Number(patch.fireSpeed) * 10) / 10;
    if (!(f >= 0.5 && f <= 1)) throw new Error('fireSpeed must be between 0.5 and 1');
    next.fireSpeed = f;
  }
  if ('motion' in patch) {
    if (patch.motion !== 'full' && patch.motion !== 'calm') throw new Error('motion must be full or calm');
    next.motion = patch.motion;
  }
  if ('wallpaper' in patch) {
    if (patch.wallpaper !== 'sky' && patch.wallpaper !== 'photo') throw new Error('wallpaper must be sky or photo');
    next.wallpaper = patch.wallpaper;
  }
  writeJson(P.CONF, next);
  cache = next;
  return next;
}

module.exports = { P: P, ID: ID, get: get, set: set, readJson: readJson, writeJson: writeJson, mkdirp: mkdirp };
