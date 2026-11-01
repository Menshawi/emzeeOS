'use strict';
// Inputs from the external input manager (eim), plus Live TV and screen share.
const luna = require('./luna');
const apps = require('./apps');
const config = require('./config');

// guess an icon from the device name LG reports (CEC names like "PS5", "Apple TV")
function kind(name) {
  const n = String(name || '').toLowerCase();
  if (/playstation|ps[345]|xbox|switch|nintendo|steam|console|game/.test(n)) return 'game';
  if (/apple ?tv|shield|chromecast|fire ?tv|roku|google tv|box|kodi/.test(n)) return 'box';
  if (/pc|computer|mac|laptop|windows/.test(n)) return 'pc';
  return 'hdmi';
}

function portLabel(id) {
  const m = /HDMI[_ ]?(\d)/i.exec(id || '');
  return m ? 'HDMI ' + m[1] : String(id || 'Input');
}

function foreground() {
  return luna.call('luna://com.webos.applicationManager/getForegroundAppInfo', {}, 3000)
    .then(function (r) { return (r && r.appId) || ''; });
}

function list() {
  return Promise.all([
    luna.call('luna://com.webos.service.eim/getAllInputStatus', {}, 4000),
    foreground(),
    apps.raw().catch(function () { return []; })
  ]).then(function (r) {
    const status = r[0], fg = r[1], installed = r[2];
    const names = config.get().inputNames;
    const devices = (status && (status.devices || status.inputSourceList)) || [];
    const out = devices.filter(function (d) { return /hdmi/i.test(d.id || d.deviceId || ''); }).map(function (d) {
      const id = d.appId || ('com.webos.app.' + String(d.id || '').toLowerCase().replace(/[_ ]/g, ''));
      const port = portLabel(d.id || d.deviceId);
      const cec = d.deviceName || d.label || '';
      const name = names[id] || (cec && cec !== port ? cec : port);
      const connected = d.connected !== false;
      const playing = connected && fg === id;
      const state = playing ? 'Playing' : connected ? (d.activate === false ? 'Asleep' : 'On and ready') : 'Not connected';
      return {
        id: id, name: name, port: port, kind: kind(cec || name),
        status: playing ? 'playing' : connected ? (d.activate === false ? 'asleep' : 'ready') : 'off',
        detail: port + ' · ' + (playing ? 'Playing' : connected ? (d.activate === false ? 'Asleep' : 'Ready') : 'Not connected'),
        sub: port + ' · ' + state
      };
    });
    const has = function (id) { return installed.some(function (a) { return a.id === id; }); };
    if (has('com.webos.app.livetv')) {
      out.push({ id: 'com.webos.app.livetv', name: names['com.webos.app.livetv'] || 'Live TV', port: 'Antenna', kind: 'tv',
        status: fg === 'com.webos.app.livetv' ? 'playing' : 'ready', detail: 'Antenna', sub: 'Antenna' });
    }
    const cast = ['com.webos.app.screenshare', 'com.webos.app.miracast'].filter(has)[0];
    if (cast) {
      out.push({ id: cast, name: 'Screen share', port: 'Cast', kind: 'cast', status: 'ready',
        detail: 'From a phone or laptop', sub: 'From a phone or laptop' });
    }
    return out;
  });
}

module.exports = { list: list, kind: kind };
