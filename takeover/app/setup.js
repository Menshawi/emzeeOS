// emzeeOS Setup: asks Homebrew Channel to elevate com.emzee.home.service, then calls it to turn the takeover
// on, off, or remove it. Left/right move, OK presses, Back closes. Without a TV (no PalmServiceBridge)
// it runs against a stand-in so the screen can be previewed.
(function () {
  var SVC = 'luna://com.emzee.home.service/';
  var HBC = 'luna://org.webosbrew.hbchannel.service/elevateService';
  var $ = function (id) { return document.getElementById(id); };
  var buttons = [].slice.call(document.querySelectorAll('button'));
  var focus = 0, busy = false, armed = null, state = null, bridges = [];

  // ---- luna ----
  function luna(uri, params, cb) {
    if (typeof PalmServiceBridge === 'undefined') return fake(uri, cb);
    var b = new PalmServiceBridge();
    bridges.push(b); // keep it alive until it answers
    b.onservicecallback = function (s) {
      bridges.splice(bridges.indexOf(b), 1);
      var r;
      try { r = JSON.parse(s); } catch (e) { r = { returnValue: false, errorText: 'unreadable reply' }; }
      cb(r);
    };
    b.call(uri, JSON.stringify(params || {}));
  }

  var demo = { root: false, installed: false, disabled: false, mounted: false, version: null, bundled: '0.2.0' };
  function fake(uri, cb) {
    setTimeout(function () {
      if (uri === HBC) { demo.root = true; return cb({ returnValue: true }); }
      var m = uri.slice(SVC.length);
      if (m === 'enable') { demo.installed = true; demo.disabled = false; demo.mounted = true; demo.version = demo.bundled; }
      if (m === 'disable') { demo.disabled = true; demo.mounted = false; }
      if (m === 'uninstall') { demo = { root: true, installed: false, disabled: false, mounted: false, version: null, bundled: '0.2.0' }; }
      if (m === 'logs') {
        return cb({ returnValue: true, status: demo, logs: [
          { name: 'Startup', lines: ['[emzee 07:01:02 +41.20s] takeover starts; in front: com.webos.app.home', '[emzee 07:01:03 +42.01s] mounted overlay over /usr/palm/applications/com.webos.app.home',
            '[emzee 07:01:03 +42.30s] blockSystemApp: { "returnValue": true }', '[emzee 07:01:04 +43.10s] sam reread Home: type web',
            '[emzee 07:01:04 +43.20s] stopped 1 LG Home process(es); in front was: com.webos.app.home', '[emzee 07:01:07 +46.00s] launcher ready after 2s in front'] },
          { name: 'Helper', lines: ['[emzee] helper 0.2.6 on 127.0.0.1:8775'] },
          { name: 'Setup', lines: [] }] });
      }
      cb({ returnValue: true, status: demo, log: m === 'enable' ? ['[emzee] staged launcher', '[emzee] linked boot hook'] : undefined });
    }, 400);
  }

  // ---- screen ----
  function note(text, bad) { $('note').textContent = text || ''; $('note').className = 'note' + (bad ? ' bad' : ''); }

  function show(s) {
    state = s;
    $('f-root').textContent = s.root ? 'Yes' : 'Not yet';
    $('f-root').className = s.root ? '' : 'bad';
    $('f-state').textContent = !s.installed ? 'Not set up' : s.disabled ? 'Off (LG\'s Home)' : s.mounted ? 'On' : 'On from next boot';
    $('f-version').textContent = s.version ? s.version + (s.bundled && s.bundled !== s.version ? ' → ' + s.bundled + ' ready' : '') : (s.bundled || '–');
    $('enable').textContent = s.installed && !s.disabled && s.bundled !== s.version ? 'Update emzeeOS' : 'Make emzeeOS my Home';
    $('disable').disabled = !s.root || !s.installed || s.disabled;
    $('uninstall').disabled = !s.root;
    $('enable').disabled = !s.root;
    $('logs').disabled = false;
    $('where').disabled = false;
    paint();
  }

  function paint() {
    var ok = buttons.filter(function (b) { return !b.disabled; });
    if (ok.length && buttons[focus].disabled) focus = buttons.indexOf(ok[0]);
    buttons.forEach(function (b, i) { b.classList.toggle('focus', i === focus && !b.disabled); });
  }

  function disarm() {
    if (!armed) return;
    armed.classList.remove('confirm'); armed.textContent = 'Remove emzeeOS completely'; armed = null;
  }

  // ---- root ----
  // the service exits after answering while it isn't root, so each retry gets a freshly elevated process
  function waitForRoot(tries, done) {
    luna(SVC + 'status', {}, function (r) {
      if (r.status) show(r.status);
      if (r.status && r.status.root) return done(true);
      if (tries <= 0) return done(false);
      setTimeout(function () { waitForRoot(tries - 1, done); }, 1000);
    });
  }

  function elevate(done) {
    note('Asking Homebrew Channel for root…');
    luna(HBC, { id: 'com.emzee.home.service' }, function (r) {
      if (r.returnValue === false) {
        note('Homebrew Channel couldn\'t elevate: ' + (r.errorText || 'unknown error') +
          '. It needs to be running as root (Homebrew Channel → Settings shows Root status).', true);
        return waitForRoot(0, function () { done(false); });
      }
      waitForRoot(8, function (ok) {
        note(ok ? '' : 'Still not running as root. Reopen this app, or reboot the TV and try again.', !ok);
        done(ok);
      });
    });
  }

  // ---- actions ----
  var SAY = {
    enable: ['Setting up…', 'Done. emzeeOS takes over in a few seconds; this app will close.'],
    disable: ['Giving LG\'s Home back…', 'LG\'s Home is back, and stays on later boots until you turn emzeeOS on again.'],
    uninstall: ['Removing emzeeOS…', 'Removing everything. LG\'s Home comes back and this app uninstalls itself.']
  };

  // ---- log view ----
  var logs = [], tab = 0, viewing = false;
  function openLogs() {
    luna(SVC + 'logs', {}, function (r) {
      if (r.returnValue === false || !r.logs) return note('Couldn\'t read the logs: ' + (r.errorText || 'no answer'), true);
      logs = r.logs; tab = 0; viewing = true;
      $('logview').classList.add('open'); $('logview').setAttribute('aria-hidden', 'false');
      drawLog();
    });
  }
  function drawLog() {
    $('lv-tabs').innerHTML = '';
    logs.forEach(function (l, i) {
      var t = document.createElement('span');
      t.textContent = l.name; if (i === tab) t.className = 'on';
      $('lv-tabs').appendChild(t);
    });
    var body = $('lv-body');
    body.textContent = logs[tab].lines.length ? logs[tab].lines.join('\n') : '(empty)';
    body.scrollTop = body.scrollHeight; // newest at the bottom
  }
  function closeLogs() { viewing = false; $('logview').classList.remove('open'); $('logview').setAttribute('aria-hidden', 'true'); }
  function logKey(k) {
    var body = $('lv-body');
    if (k === 37 || k === 39) { tab = (tab + (k === 39 ? 1 : logs.length - 1)) % logs.length; drawLog(); }
    else if (k === 38 || k === 40) body.scrollTop += (k === 40 ? 1 : -1) * 220;
    else if (k === 461 || k === 27 || k === 8 || k === 13) closeLogs();
    else return false;
    return true;
  }

  // ---- location ----
  // Where emzeeOS thinks the TV is comes from its helper (running whenever emzeeOS is Home): found from the internet
  // connection, else the time zone, or set here by hand. Setting it here is never overridden.
  var HELPER = 'http://127.0.0.1:8775';
  var SOURCE = { tv: 'from the TV\'s postcode', ip: 'from your internet connection', timezone: 'from the TV\'s time zone', manual: 'set by you' };
  var where = { open: false, items: [], at: 0, now: null };

  function helper(path, body, cb) {
    if (typeof PalmServiceBridge === 'undefined') return fakeHelper(path, body, cb);
    var x = new XMLHttpRequest();
    x.open(body ? 'POST' : 'GET', HELPER + path, true);
    x.timeout = 10000;
    x.onload = function () { var r = null; try { r = JSON.parse(x.responseText); } catch (e) { /* not JSON */ } cb(x.status >= 200 && x.status < 300 && r ? null : new Error((r && r.error) || 'helper ' + x.status), r); };
    x.onerror = x.ontimeout = function () { cb(new Error('emzeeOS\'s helper isn\'t running (is emzeeOS on?)')); };
    if (body) x.setRequestHeader('Content-Type', 'application/json');
    x.send(body ? JSON.stringify(body) : null);
  }
  var demoWhere = { name: 'Stockholm', lat: 59.33, lon: 18.07, source: 'ip' };
  function fakeHelper(path, body, cb) {
    setTimeout(function () {
      if (path === '/api/location') return cb(null, { location: demoWhere });
      if (path.indexOf('/api/places') === 0) return cb(null, { places: [
        { name: 'Täby', region: 'Stockholm', country: 'Sweden', lat: 59.444, lon: 18.069 },
        { name: 'Täby kyrkby', region: 'Stockholm', country: 'Sweden', lat: 59.5, lon: 18.06 }] });
      if (body && 'location' in body) { demoWhere = body.location ? Object.assign({ source: 'manual' }, body.location) : { name: 'Stockholm', lat: 59.33, lon: 18.07, source: 'ip' }; return cb(null, {}); }
      cb(null, {});
    }, 300);
  }

  function whereText(l) { return l ? l.name + ' · ' + (SOURCE[l.source] || '') : 'Not found yet'; }
  function refreshWhere() {
    helper('/api/location', null, function (err, r) {
      where.now = !err && r.location;
      $('f-loc').textContent = err ? 'Shows while emzeeOS is on' : whereText(r.location);
      $('f-loc').className = err ? 'bad' : '';
    });
  }

  function openWhere() {
    where.open = true; where.at = 0;
    where.items = [{ auto: true }];
    $('loc-now').textContent = where.now ? 'Now: ' + whereText(where.now) + '.' : 'Search for your town; weather and the sun follow it.';
    $('loc-q').value = '';
    $('locview').classList.add('open'); $('locview').setAttribute('aria-hidden', 'false');
    drawWhere();
  }
  function closeWhere() {
    where.open = false; $('loc-q').blur();
    $('locview').classList.remove('open'); $('locview').setAttribute('aria-hidden', 'true');
  }
  function drawWhere() {
    var list = $('loc-list'); list.innerHTML = '';
    where.items.forEach(function (p, i) {
      var d = document.createElement('div');
      if (p.auto) d.innerHTML = 'Automatic<small>the TV\'s postcode, else your internet connection</small>';
      else { d.textContent = p.name; var s = document.createElement('small'); s.textContent = [p.region, p.country].filter(Boolean).join(', '); d.appendChild(s); }
      if (i + 1 === where.at) d.className = 'focus';
      d.addEventListener('click', function () { choose(p); });
      list.appendChild(d);
    });
    $('loc-q').classList.toggle('focus', where.at === 0);
    if (where.at === 0) $('loc-q').focus(); else $('loc-q').blur();
  }
  function searchWhere() {
    var q = $('loc-q').value.trim();
    if (q.length < 2) return;
    note('Searching…');
    helper('/api/places?q=' + encodeURIComponent(q), null, function (err, r) {
      if (err) return note('Search failed: ' + err.message, true);
      note(r.places.length ? '' : 'No place called "' + q + '". Try another spelling.', !r.places.length);
      where.items = [{ auto: true }].concat(r.places);
      where.at = r.places.length ? 2 : 1;
      drawWhere();
    });
  }
  function choose(p) {
    var body = p.auto ? { location: null } : { location: { lat: p.lat, lon: p.lon, name: p.name } };
    helper('/api/config', body, function (err) {
      if (err) return note('Couldn\'t save the location: ' + err.message, true);
      closeWhere();
      note(p.auto ? 'Location set to automatic.' : 'Location set to ' + p.name + '. emzeeOS shows it when you go back Home.');
      refreshWhere();
    });
  }
  function whereKey(e) {
    var k = e.keyCode, typing = document.activeElement === $('loc-q');
    if (typing) {
      if (k === 13) { searchWhere(); return true; }
      if (k === 40) { if (where.items.length) { where.at = 1; drawWhere(); } return true; }
      if (k === 461 || k === 27) { closeWhere(); return true; }
      return false;   // letters, Backspace and the arrows inside the text go to the field
    }
    if (k === 38) { where.at = Math.max(0, where.at - 1); drawWhere(); }
    else if (k === 40) { where.at = Math.min(where.items.length, where.at + 1); drawWhere(); }
    else if (k === 13) { if (where.at === 0) drawWhere(); else choose(where.items[where.at - 1]); }
    else if (k === 461 || k === 27 || k === 8) closeWhere();
    else return false;
    return true;
  }

  function act(name) {
    if (busy) return;
    if (name === 'logs') { disarm(); return openLogs(); }
    if (name === 'location') { disarm(); return openWhere(); }
    if (name === 'uninstall' && armed !== $('uninstall')) {
      armed = $('uninstall'); armed.classList.add('confirm'); armed.textContent = 'Press OK again to remove';
      return;
    }
    disarm();
    busy = true;
    note(SAY[name][0]); $('log').textContent = '';
    elevate(function (ok) {
      if (!ok) { busy = false; return; }
      note(SAY[name][0]);
      luna(SVC + name, {}, function (r) {
        busy = false;
        if (r.status) show(r.status);
        if (r.returnValue === false) {
          note((r.errorText || 'Something went wrong') + '. Details: /tmp/emzee-setup.log', true);
          if (r.log) $('log').textContent = r.log.join('\n');
          return;
        }
        note(SAY[name][1]);
        // giving Home back finishes after the reply; show the new state once it has
        if (name === 'disable') setTimeout(function () { waitForRoot(0, function () {}); }, 4000);
      });
    });
  }

  document.addEventListener('keydown', function (e) {
    if (viewing) { if (logKey(e.keyCode)) e.preventDefault(); return; }
    if (where.open) { if (whereKey(e)) e.preventDefault(); return; }
    var k = e.keyCode, ok = buttons.filter(function (b) { return !b.disabled; }), at = ok.indexOf(buttons[focus]);
    if (k === 37 || k === 39) {
      if (!ok.length) return;
      at = Math.max(0, Math.min(ok.length - 1, at + (k === 39 ? 1 : -1)));
      focus = buttons.indexOf(ok[at]); disarm(); paint();
    } else if (k === 13) {
      if (!buttons[focus].disabled) act(buttons[focus].getAttribute('data-act'));
    } else if (k === 461 || k === 27 || k === 8) {
      if (armed) disarm(); else window.close();
    } else return;
    e.preventDefault();
  });
  buttons.forEach(function (b, i) {
    b.addEventListener('mouseenter', function () { if (!b.disabled) { focus = i; paint(); } });
    b.addEventListener('click', function () { focus = i; act(b.getAttribute('data-act')); });
  });

  buttons.forEach(function (b) { b.disabled = true; }); // until the service answers
  elevate(function () {});
  refreshWhere();
})();
