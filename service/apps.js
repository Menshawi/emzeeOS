'use strict';
// App list (applicationManager/listApps), icons, launching. Order and hidden apps come from config.
const fs = require('fs');
const path = require('path');
const luna = require('./luna');
const config = require('./config');

// inputs and system pieces that never belong in the dock
const SKIP = /^com\.webos\.app\.(hdmi|livetv|home|inputcommon|externalinput|miracast|screenshare|tvhotkey|channelsetting|softwareupdate|settings|notificationcenter|discovery|camera|screensaver|voice|care365|membership|btspeakerapp|connectionwizard|factorywin|igallery|sheetmusic|remotesetting|self-diagnosis|oobe)|^com\.emzee\.launcher$/;  // emzeeOS Setup (com.emzee.home) stays listed: it's the way back without SSH

let cached = null, cachedAt = 0;

function fetchApps() {
  return luna.call('luna://com.webos.applicationManager/listApps', {}).then(function (r) {
    if (r.returnValue === false || !Array.isArray(r.apps)) throw new Error(r.errorText || 'listApps failed');
    return r.apps;
  });
}

function raw() {
  if (cached && Date.now() - cachedAt < 5000) return Promise.resolve(cached);
  return fetchApps().then(function (apps) { cached = apps; cachedAt = Date.now(); return apps; });
}

// all launchable apps, in the user's order, each marked hidden or not
function list() {
  return raw().then(function (apps) {
    const conf = config.get();
    const items = apps.filter(function (a) {
      return a && a.id && config.ID.test(a.id) && a.visible !== false && !a.noWindow && !SKIP.test(a.id);
    }).map(function (a) {
      return {
        id: a.id,
        name: a.title || a.id,
        icon: iconUrl(a),
        // the app's own tile colour, for icons that have to be fitted rather than fill the tile
        color: COLOR.test(a.iconColor || '') ? a.iconColor : COLOR.test(a.bgColor || '') ? a.bgColor : null,
        hidden: conf.hidden.indexOf(a.id) >= 0
      };
    });
    const rank = function (id) { const i = conf.order.indexOf(id); return i < 0 ? 1e6 : i; };
    // stable: ordered apps first, the rest keep LG's order
    return items.map(function (a, i) { return { a: a, i: i }; })
      .sort(function (x, y) { return rank(x.a.id) - rank(y.a.id) || x.i - y.i; })
      .map(function (x) { return x.a; });
  });
}

// listApps fields that can name an icon, best first
const ICON_KEYS = ['largeIcon', 'mediumIcon', 'icon'];
const IMAGE = /\.(png|jpe?g|webp|svg|gif)$/i;
// where app icons live: built-in apps, store and dev apps (/media/cryptofs, /media/developer), mounted app images
const ROOTS = ['/usr/palm/', '/media/', '/mnt/', '/var/palm/', '/usr/share/'];
const warned = {};
const COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\))$/;

// a PNG's size from its header (bytes 16-23); null for anything else
function pngSize(file) {
  try {
    const fd = fs.openSync(file, 'r'), b = Buffer.alloc(24);
    fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd);
    if (b.readUInt32BE(0) !== 0x89504E47) return null;
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  } catch (e) { return null; }
}

function candidates(a) {
  return ICON_KEYS.map(function (k) { return a[k]; }).filter(function (v) { return typeof v === 'string' && v; });
}

// what the page should load: a web icon as is, otherwise our /icon/<id> route
function iconUrl(a) {
  const c = candidates(a);
  if (!c.length) return null;
  if (/^https?:\/\//.test(c[0])) return c[0];
  return '/icon/' + encodeURIComponent(a.id);
}

// a local icon path from listApps, which may be absolute, file://, or relative to the app's folder
// (the folder is "folderPath" on webOS; "folder" kept for older firmware)
function localPath(a, rel) {
  if (/^https?:\/\//.test(rel)) return null;
  rel = rel.replace(/^file:\/\//, '');
  const folder = a.folderPath || a.folder;
  if (rel.charAt(0) !== '/' && !folder) return null;
  return path.resolve(folder || '/', rel);
}

function allowed(file, a) {
  const folder = a.folderPath || a.folder;
  if (!IMAGE.test(file)) return false;
  if (folder && file.indexOf(path.resolve(folder) + path.sep) === 0) return true;
  return ROOTS.some(function (r) { return file.indexOf(r) === 0; });
}

// GET /icon/<id>: the app's own icon file. Only image files under the app's folder or the app roots;
// symlinks are resolved before the check. Apps can list several icons, and on newer webOS some are wide
// (made for a banner), which a square tile would crop at the sides: the squarest, largest one wins.
function icon(id, res) {
  return raw().then(function (apps) {
    const a = apps.filter(function (x) { return x.id === id; })[0];
    if (!a) return notFound(res);
    const found = [];
    candidates(a).forEach(function (rel, order) {
      const p = localPath(a, rel);
      if (!p) return;
      let file;
      try { file = fs.realpathSync(p); } catch (e) { return; }
      if (!allowed(file, a)) return;
      const size = pngSize(file);
      const ratio = size && size[1] ? size[0] / size[1] : 0;
      // square (within 8%) first, then unknown sizes in listApps order, then the rest; bigger first
      const rank = size ? (Math.abs(ratio - 1) <= 0.08 ? 0 : 2) : 1;
      found.push({ file: file, rank: rank, area: size ? size[0] * size[1] : 0, order: order, size: size });
    });
    found.sort(function (x, y) { return x.rank - y.rank || y.area - x.area || x.order - y.order; });
    (function next(i) {
      if (i >= found.length) {
        if (!warned[id]) { warned[id] = 1; console.error('[emzee] no icon for', id, JSON.stringify(candidates(a)), a.folderPath || a.folder || '(no folder)'); }
        return notFound(res);
      }
      const f = found[i];
      fs.readFile(f.file, function (err, buf) {
        if (err) return next(i + 1);
        if (f.rank === 2 && !warned['wide' + id]) { warned['wide' + id] = 1; console.error('[emzee] only a wide icon for', id, f.size.join('x'), '(fitted, not cropped)'); }
        const ext = path.extname(f.file).toLowerCase();
        const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.svg' ? 'image/svg+xml' : ext === '.gif' ? 'image/gif' : 'image/png';
        res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=3600' });
        res.end(buf);
      });
    })(0);
  }).catch(function () { notFound(res); });
}

function notFound(res) { res.writeHead(404); res.end(); }

function launch(id, params) {
  return luna.call('luna://com.webos.applicationManager/launch', { id: id, params: params || {} }, 10000);
}

module.exports = { list: list, icon: icon, launch: launch, raw: raw };
