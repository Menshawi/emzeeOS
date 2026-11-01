'use strict';
// The fireplace screen saver's video: "Burning Logs in a Fireplace" by Volodymyr Kostiev on Pexels (Pexels
// licence: free to use, no credit required), 15 s of a real wood fire at 60 fps with its own crackling sound,
// looped. emzeeOS Setup carries it (media/fireplace.mp4) and links it into data/ when it installs; otherwise
// (installed by hand, or the file is missing) the TV downloads it once, in the background, the first time Fireplace is
// chosen, in the best quality its free space allows (4K 49 MB, else 1440p 27 MB or 1080p 12 MB), resuming
// where it stopped if interrupted. Served to the page with HTTP range requests so the video can stream and loop.
const fs = require('fs');
const path = require('path');
const https = require('https');
const child = require('child_process');
const config = require('./config');

const BASE = process.env.EMZEE_FIRE_URL || 'https://videos.pexels.com/video-files/13270910/13270910-';
const QUALITIES = [
  { name: '4K', file: 'uhd_3840_2160_60fps.mp4', bytes: 49466298 },
  { name: '1440p', file: 'uhd_2560_1440_60fps.mp4', bytes: 27198089 },
  { name: '1080p', file: 'hd_1920_1080_60fps.mp4', bytes: 11547127 }
];
const FILE = function () { return path.join(config.P.DATA, 'fireplace.mp4'); };
const PART = function () { return path.join(config.P.DATA, 'fireplace.mp4.part'); };
const META = function () { return path.join(config.P.DATA, 'fireplace.json'); };

let job = null;   // { quality, got, total } while downloading

function exists(p) { try { return fs.statSync(p).size; } catch (e) { return 0; } }

// free space in the data folder, in bytes (busybox df -k)
function freeBytes() {
  try {
    const out = child.execFileSync('df', ['-k', config.P.DATA], { encoding: 'utf8', timeout: 5000 });
    const cols = out.trim().split('\n').pop().trim().split(/\s+/);
    return Number(cols[3]) * 1024;
  } catch (e) { return Infinity; }
}

const VIDEO_ID = '13270910';
function status() {
  const meta = config.readJson(META(), {});
  if (exists(FILE()) && meta.video && meta.video !== VIDEO_ID) { try { fs.unlinkSync(FILE()); } catch (e) { /* gone */ } }
  if (exists(FILE())) return { state: 'ready', quality: meta.quality || '', credit: 'Video: Volodymyr Kostiev, Pexels' };
  if (job) return { state: 'downloading', quality: job.quality.name, progress: job.total ? Math.round(job.got / job.total * 100) : 0 };
  if (meta.error) return { state: 'failed', error: meta.error };
  return { state: 'none' };
}

// start (or resume) the download, choosing the quality that leaves at least 200 MB free afterwards
function start() {
  if (job || exists(FILE())) return status();
  config.mkdirp(config.P.DATA);
  const have = exists(PART()), meta = config.readJson(META(), {});
  const free = freeBytes() + have;
  let q = QUALITIES.filter(function (x) { return x.name === meta.quality; })[0];
  if (!q || !have) q = QUALITIES.filter(function (x) { return x.bytes + 200e6 < free; })[0];
  if (!q) {
    config.writeJson(META(), { error: 'not enough free space on the TV' });
    return status();
  }
  config.writeJson(META(), { quality: q.name, video: VIDEO_ID });
  job = { quality: q, got: have && meta.quality === q.name ? have : 0, total: q.bytes };
  if (!job.got) try { fs.unlinkSync(PART()); } catch (e) { /* nothing to remove */ }
  console.log('[emzee] fireplace video: downloading ' + q.name + (job.got ? ' from ' + Math.round(job.got / 1e6) + ' MB' : ''));
  fetch(BASE + q.file, 0);
  return status();
}

function fetch(url, hops) {
  const headers = { 'user-agent': 'emzee-tv-launcher (fireplace screen saver)' };
  if (job.got) headers.range = 'bytes=' + job.got + '-';
  const req = https.get(url, { headers: headers }, function (res) {
    if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && hops < 5) { res.resume(); return fetch(res.headers.location, hops + 1); }
    if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); return fail('server answered ' + res.statusCode); }
    if (res.statusCode === 200) job.got = 0;   // the server ignored the range: start over
    const out = fs.createWriteStream(PART(), { flags: job.got ? 'a' : 'w' });
    res.on('data', function (d) { job.got += d.length; });
    res.pipe(out);
    out.on('finish', function () {
      if (exists(PART()) < job.total * 0.98) return fail('download stopped early');
      fs.renameSync(PART(), FILE());
      console.log('[emzee] fireplace video ready (' + job.quality.name + ')');
      config.writeJson(META(), { quality: job.quality.name, video: VIDEO_ID });
      job = null;
    });
    out.on('error', function (e) { fail(e.message); });
  });
  req.setTimeout(60000, function () { req.destroy(new Error('stalled')); });
  req.on('error', function (e) { fail(e.message); });
}

function fail(why) {
  console.log('[emzee] fireplace video: ' + why + ' (it resumes next time)');
  config.writeJson(META(), { quality: job && job.quality.name, error: why });
  job = null;
}

// GET /fireplace: the video, with range support so the page can stream and loop it. CORS headers too: the page
// (file://) boosts the sound through Web Audio, which would hear only silence from a cross-origin video without them.
function serve(req, res, origin) {
  const file = FILE(), size = exists(file);
  if (!size) { res.writeHead(404); return res.end(); }
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  const head = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'no-cache' };
  if (origin) { head['access-control-allow-origin'] = origin; head.vary = 'Origin'; }
  if (!m) {
    head['content-length'] = size;
    res.writeHead(200, head);
    return fs.createReadStream(file).pipe(res);
  }
  const s = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const e = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (!(s >= 0 && s <= e)) { res.writeHead(416, { 'content-range': 'bytes */' + size }); return res.end(); }
  head['content-range'] = 'bytes ' + s + '-' + e + '/' + size;
  head['content-length'] = e - s + 1;
  res.writeHead(206, head);
  fs.createReadStream(file, { start: s, end: e }).pipe(res);
}

module.exports = { status: status, start: start, serve: serve };
