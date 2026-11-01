// Settings: the round gear left of the weather (Up from the dock reaches it) opens a panel from the right.
// Choice rows change with left/right (or OK steps through them) and save at once; Location opens a town search.
// Settings live in the helper's config (or this browser's storage in the preview) and every module listens
// for the 'config' event: the clock, the screen saver, the sky's motion and the weather's units.
(function () {
  var CHOICES = {
    unit: [['c', '°C', 'Celsius'], ['f', '°F', 'Fahrenheit']],
    clock24: [[true, '24-hour', '18:30'], [false, '12-hour', '6:30 PM']],
    idleMinutes: [[2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [30, '30 minutes'], [0, 'Never']],
    saver: [['sky', 'Sky', 'the sky fills the screen'], ['fire', 'Fireplace', 'a real fire, crackling'], ['fire-quiet', 'Fireplace, silent', 'just the flames, no sound']],
    // the fireplace's playback speed, as a slider: 0.5x to 1x in steps of 0.1
    fireSpeed: [0.5, 0.6, 0.7, 0.8, 0.9, 1].map(function (v) { return [v, v.toFixed(1) + '×']; }),
    motion: [['full', 'Full', 'drifting clouds and shooting stars'], ['calm', 'Calm', 'a still sky, lightest on the TV']]
  };
  var SOURCE = { tv: "from the TV's postcode", ip: 'from your internet connection', timezone: "from the TV's time zone", manual: 'set by you' };
  var CHEV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>';
  var CHEV_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>';

  var root, body, sub, hints, gear, input;
  var isOpen = false, conf = {}, where = null, view = 'list';
  var rows = [], at = 0, found = [], fat = 0;   // list rows and focus; search results and focus (0 = the field)

  function hint(k, t) { return '<span><kbd>' + k + '</kbd>' + t + '</span>'; }
  function whereText(l) { return l ? l.name : 'Not found yet'; }

  // ---------- the list ----------
  function layout() {
    return [
      { group: 'Weather' },
      { key: 'location', label: 'Location', value: whereText(where), note: where ? SOURCE[where.source] || '' : '', go: true },
      { key: 'unit', label: 'Temperature' },
      { group: 'Home screen' },
      { key: 'clock24', label: 'Time format' },
      { key: 'motion', label: 'Sky' },
      { group: 'Screen saver' },
      { key: 'idleMinutes', label: 'Starts after' },
      { key: 'saver', label: 'Style' }
    ].concat(String(conf.saver).indexOf('fire') === 0 ? [{ key: 'fireSpeed', label: 'Fire speed' }] : []).concat([
      { group: 'About' },
      { key: 'setup', label: 'emzeeOS Setup', value: 'Open', note: 'turn emzeeOS on or off, update, logs', go: true }
    ]);
  }

  // under the Style row while the fireplace video is on its way
  var fireState = null;
  function fireNote(s) {
    fireState = s;
    if (isOpen && view === 'list') drawList();
    if (s && s.state === 'downloading' && isOpen) setTimeout(function () { EZ.api.fireplace().then(fireNote); }, 3000);
  }

  function choiceOf(key) {
    var list = CHOICES[key], v = conf[key];
    for (var i = 0; i < list.length; i++) if (list[i][0] === v) return i;
    return 0;
  }

  // a thin track under a slider row's value, filled up to the current step
  function slider(key) {
    if (key !== 'fireSpeed') return '';
    var n = CHOICES[key].length - 1;
    return '<span class="st-slider"><i style="transform:scaleX(' + (choiceOf(key) / n).toFixed(3) + ')"></i></span>';
  }

  function drawList() {
    view = 'list';
    body.innerHTML = '';
    rows = [];
    layout().forEach(function (r) {
      if (r.group) { body.appendChild(EZ.el('div', 'st-group', EZ.esc(r.group))); return; }
      var el = EZ.el('div', 'st-row' + (CHOICES[r.key] ? ' choice' : '') + (r.go ? ' go' : ''));
      var value, note;
      if (CHOICES[r.key]) {
        var c = CHOICES[r.key][choiceOf(r.key)];
        value = c[1]; note = c[2] || '';
        if (r.key === 'saver' && String(c[0]).indexOf('fire') === 0 && fireState) {
          if (fireState.state === 'downloading') note = 'getting the video · ' + (fireState.progress || 0) + '%';
          else if (fireState.state === 'failed') note = 'video download failed: ' + (fireState.error || '') + ' (the sky shows meanwhile)';
        }
      } else { value = r.value; note = r.note || ''; }
      el.innerHTML = '<span class="st-label">' + EZ.esc(r.label) + '</span>' +
        '<span class="st-value">' + (CHOICES[r.key] ? '<i class="l">' + CHEV_L + '</i>' : '') +
        '<span><b>' + EZ.esc(value) + '</b>' + (note ? '<small>' + EZ.esc(note) + '</small>' : '') + slider(r.key) + '</span>' +
        (CHOICES[r.key] ? '<i class="r">' + CHEV_R + '</i>' : r.go ? '<i class="r">' + CHEV_R + '</i>' : '') + '</span>';
      var n = rows.length;
      el.addEventListener('mouseenter', function () { at = n; paint(); });
      el.addEventListener('click', function () { at = n; paint(); layer.ok(); });
      body.appendChild(el);
      rows.push({ key: r.key, el: el });
    });
    at = Math.min(at, rows.length - 1);
    paint();
  }

  function paint() {
    rows.forEach(function (r, i) { r.el.classList.toggle('focused', i === at); });
    var r = rows[at];
    sub.textContent = 'Changes are saved as you make them';
    hints.innerHTML = CHOICES[r.key] ? hint('◀ ▶', 'Change') + hint('Back', 'Close') : hint('OK', 'Open') + hint('Back', 'Close');
  }

  function change(dir) {
    var r = rows[at];
    if (!CHOICES[r.key]) return;
    var list = CHOICES[r.key], i = choiceOf(r.key) + dir;
    if (i < 0 || i >= list.length) return;
    var patch = {};
    patch[r.key] = list[i][0];
    conf[r.key] = list[i][0];
    drawList();
    EZ.api.saveConfig(patch);
    // choosing the fireplace starts fetching its video on the TV, so it's there when the screen saver comes
    if (r.key === 'saver' && String(list[i][0]).indexOf('fire') === 0) EZ.api.fireplaceStart().then(fireNote);
  }

  // ---------- the town search ----------
  function drawSearch() {
    view = 'search';
    body.innerHTML = '';
    var now = EZ.el('p', 'st-now', where ? 'Now ' + EZ.esc(where.name) + ', ' + EZ.esc(SOURCE[where.source] || '') + '.' : 'Weather and the sun follow the town you pick.');
    body.appendChild(now);
    input = EZ.el('input', 'st-input');
    input.type = 'text'; input.placeholder = 'Type your town'; input.autocomplete = 'off'; input.spellcheck = false;
    body.appendChild(input);
    var list = EZ.el('div', 'st-results');
    [{ auto: true }].concat(found).forEach(function (p, i) {
      var d = EZ.el('div', 'st-result');
      d.innerHTML = p.auto ? '<b>Automatic</b><small>the TV\'s postcode, else your internet connection</small>'
        : '<b>' + EZ.esc(p.name) + '</b><small>' + EZ.esc([p.region, p.country].filter(Boolean).join(', ')) + '</small>';
      d.addEventListener('click', function () { pick(p); });
      d.addEventListener('mouseenter', function () { fat = i + 1; paintSearch(); });
      list.appendChild(d);
    });
    body.appendChild(list);
    paintSearch();
  }
  function paintSearch() {
    var items = EZ.$$('.st-result', body);
    items.forEach(function (d, i) { d.classList.toggle('focused', i + 1 === fat); });
    input.classList.toggle('focused', fat === 0);
    if (fat === 0) input.focus(); else input.blur();
    hints.innerHTML = fat === 0 ? hint('OK', 'Search') + hint('▼', 'Results') + hint('Back', 'Done')
      : hint('OK', 'Choose') + hint('Back', 'Done');
  }
  function runSearch() {
    var q = input.value.trim();
    if (q.length < 2) return;
    var kept = q;
    EZ.api.places(q).then(function (p) {
      found = p; fat = p.length ? 2 : 1;
      drawSearch(); input.value = kept;
      if (!p.length) sub.textContent = 'Nothing called “' + kept + '”. Try another spelling.';
    }, function () { sub.textContent = 'Search needs the internet.'; });
  }
  function pick(p) {
    var patch = { location: p.auto ? null : { lat: p.lat, lon: p.lon, name: p.name, source: 'manual' } };
    EZ.api.saveConfig(patch).then(function () {
      return EZ.api.location();
    }).then(function (l) {
      where = l; found = []; at = 0;
      drawList();
      EZ.weather.refresh();
    });
  }

  // ---------- keys ----------
  var layer = {
    name: 'settings',
    up: function () {
      if (view === 'search') { if (fat > 0) { fat--; paintSearch(); } return; }
      if (at > 0) { at--; paint(); }
    },
    down: function () {
      if (view === 'search') { if (fat < found.length + 1) { fat++; paintSearch(); } return; }
      if (at < rows.length - 1) { at++; paint(); }
    },
    left: function () { if (view === 'list') change(-1); },
    right: function () { if (view === 'list') change(1); },
    ok: function () {
      if (view === 'search') {
        if (fat === 0) return runSearch();
        return pick(fat === 1 ? { auto: true } : found[fat - 2]);
      }
      var r = rows[at];
      if (r.key === 'location') { found = []; fat = 0; return drawSearch(); }
      if (r.key === 'setup') { EZ.api.launch('com.emzee.home'); return close(); }
      if (CHOICES[r.key] && r.key !== 'fireSpeed') {
        // OK steps through the choices, wrapping round
        var list = CHOICES[r.key], i = (choiceOf(r.key) + 1) % list.length;
        change(i - choiceOf(r.key));
      }
    },
    back: function () {
      if (view === 'search') { if (input) input.blur(); return drawList(); }
      close();
    }
  };

  // ---------- the gear ----------
  // Up from the dock lands on the gear; Down goes back. The dock rests while the gear has focus.
  var gearLayer = {
    name: 'gear',
    down: leaveGear,
    back: leaveGear,
    // the weather tile sits to the right of the gear
    right: function () { gear.classList.remove('focused'); EZ.focus.pop('gear'); EZ.wx.focusTile(); },
    ok: function () { open(); }
  };
  function focusGear() {
    if (EZ.focus.top() === 'gear') return;
    EZ.dock.rest();
    gear.classList.add('focused');
    EZ.$('#spot-name').textContent = 'Settings';
    EZ.$('#spot-sub').textContent = 'Location, temperature, clock, screen saver and motion';
    EZ.focus.push(gearLayer);
  }
  function leaveGear() {
    gear.classList.remove('focused');
    EZ.focus.pop('gear');
    EZ.dock.wake();
  }

  // ---------- open / close ----------
  function open() {
    if (isOpen) return;
    isOpen = true;
    at = 0; found = [];
    // draw from what we last knew, so the panel is ready before it moves; fresh values follow after the slide
    if (rows.length || conf.unit) drawList();
    root.setAttribute('aria-hidden', 'false');
    EZ.focus.push(layer);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (!isOpen) return;
        EZ.hold(800);
        root.classList.add('open');
        document.body.classList.add('st-open');
        EZ.perf('Settings slide', 600);
      });
    });
    setTimeout(function () {
      Promise.all([EZ.api.config(), EZ.api.location()]).then(function (r) {
        conf = r[0]; where = r[1];
        if (isOpen && view === 'list') drawList();
        if (String(conf.saver).indexOf('fire') === 0) EZ.api.fireplace().then(fireNote);
      });
    }, rows.length ? 650 : 0);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    if (input) input.blur();
    EZ.hold(800);
    root.classList.remove('open');
    document.body.classList.remove('st-open');
    root.setAttribute('aria-hidden', 'true');
    EZ.focus.pop('settings');
  }

  // ---------- applying ----------
  // what belongs to no single module: the sky's motion, and fresh weather when the units change
  var unit = null;
  function apply(c) {
    document.body.classList.toggle('calm', c.motion === 'calm');
    if (unit !== null && c.unit !== unit && EZ.weather.refresh) EZ.weather.refresh();
    unit = c.unit;
  }

  // The first slide of anything is also its first paint (and after another app ran, the TV has dropped what it
  // drew). warm() shows the panel in place at 1% opacity for two frames, a few seconds after Home is up and after
  // each return, so the TV has it drawn before you ask for it. Imperceptible on screen.
  function warm() {
    if (isOpen || !conf.unit) return;
    if (!rows.length) drawList();
    // With the slide's transition off on both sides: otherwise taking the warm-up away would slide the panel
    // back out at full opacity, which looks like Settings opening on its own.
    var panel = EZ.$('.st-panel', root);
    panel.style.transition = 'none';
    root.classList.add('warm');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.remove('warm');
        void panel.offsetWidth;   // settle back off-screen with no transition
        panel.style.transition = '';
      });
    });
  }

  EZ.settings = {
    warm: warm,
    start: function () {
      root = EZ.$('#settings'); body = EZ.$('#st-body'); sub = EZ.$('#st-sub'); hints = EZ.$('#st-hints'); gear = EZ.$('#gear');
      gear.addEventListener('click', function () { if (EZ.focus.top() === 'gear') leaveGear(); open(); });
      // the Magic Remote pointer: hovering the gear focuses it (white, turned), as the arrows do; leaving gives
      // the focus back to the dock
      gear.addEventListener('mouseenter', function () { if (EZ.focus.top() === 'dock') focusGear(); });
      gear.addEventListener('mouseleave', function () { if (EZ.focus.top() === 'gear') leaveGear(); });
      EZ.$('.st-scrim', root).addEventListener('click', close);
      EZ.api.config().then(function (c) { conf = c; apply(c); });
      EZ.api.location().then(function (l) { where = l; });
      EZ.on('config', apply);
    },
    open: open,
    close: close,
    focusGear: focusGear,
    leaveGear: leaveGear,
    isOpen: function () { return isOpen; }
  };
})();
