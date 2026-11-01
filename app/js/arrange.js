// All apps: Down on Home slides the deck up a screen, pushing Home out the top. Three sections share one
// ten-column grid: Pinned (what Home shows, up to 10, with empty slots), Inputs, and Apps.
//   OK opens · Hold OK pins or unpins · Up past the top (or Back) slides Home back.
//   Arrange (the switch top right, Up from the first row): OK picks a pin or an app up, the arrows move it,
//   OK puts it down; Back cancels the move, then leaves Arrange.
// The module keeps its old name (EZ.arrange) so Home, idle and relaunch handling stay as they are.
(function () {
  var COLS = 10, MAX = 10;
  var PIN = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 3.3a1 1 0 0 1 1.4 0l3.7 3.7a1 1 0 0 1 0 1.4l-1.2 1.2a1 1 0 0 1-1 .25l-.7-.2-3.1 3.1.4 2.6a1 1 0 0 1-.28.86l-.9.9a1 1 0 0 1-1.4 0L9.3 14l-4.6 4.6a.75.75 0 0 1-1.06-1.06L8.24 12.9 5.1 9.76a1 1 0 0 1 0-1.4l.9-.9a1 1 0 0 1 .86-.28l2.6.4 3.1-3.1-.2-.7a1 1 0 0 1 .25-1z"/></svg>';
  var PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>';

  var root, content, sub, hints, toggle, toast, toastTimer;
  var apps = [], inputs = [], pins = [], conf = null;
  var isOpen = false, arranging = false, carry = null;
  var rows = [], at = { r: 0, c: 0 }, scrollY = 0;

  function ids(list) { return list.map(function (x) { return x.id; }); }
  function hint(k, text) { return '<span><kbd>' + k + '</kbd>' + text + '</span>'; }
  function isPinned(id) { return pins.indexOf(id) >= 0; }
  function find(id) {
    return apps.filter(function (a) { return a.id === id; })[0] || inputs.filter(function (i) { return i.id === id; })[0];
  }
  function isInput(id) { return inputs.some(function (i) { return i.id === id; }); }

  // ---------- building ----------
  // one grid cell: the tile lifts inside .lift (with its focus ring and pin badge), the name sits below
  function item(section, id, badge) {
    var o = find(id), el = EZ.el('div', 'aa-item ' + section);
    var lift = EZ.el('div', 'lift');
    lift.appendChild(EZ.el('span', 'ring'));
    var t = isInput(id) ? EZ.dock.inputTile(o) : EZ.dock.tile(o);
    t.tabIndex = -1;
    lift.appendChild(t);
    if (badge && isPinned(id)) lift.appendChild(EZ.el('span', 'badge', PIN));
    el.appendChild(lift);
    // an input's tile carries its name, so the caption under it gives the port
    var cap = isInput(id) && o.port && o.name !== o.port ? o.port : o.name;
    el.appendChild(EZ.el('div', 'cap', EZ.esc(cap)));
    var cell = { el: el, section: section, id: id };
    el.addEventListener('mouseenter', function () { if (!carry) focusCell(cell); });
    el.addEventListener('click', function () { focusCell(cell); layer.ok(); });
    return cell;
  }

  function sectionHead(title, note) {
    return EZ.el('div', 'aa-label', '<span>' + title + '</span>' + (note ? '<em>' + note + '</em>' : ''));
  }

  // where every tile sat before a rebuild, so they can glide to their new places (FLIP) instead of jumping
  function positions() {
    var out = {};
    rows.forEach(function (row) { row.forEach(function (c) { if (c.section !== 'toggle') out[c.section + c.id] = [c.el.offsetLeft, c.el.offsetTop]; }); });
    return out;
  }
  function glide(before) {
    var moved = [];
    rows.forEach(function (row) {
      row.forEach(function (c) {
        if (c.section === 'toggle') return;
        var b = before[c.section + c.id];
        if (!b) { if (isOpen) c.el.classList.add('born'); return; }   // newly pinned: it grows in
        var dx = b[0] - c.el.offsetLeft, dy = b[1] - c.el.offsetTop;
        if (!dx && !dy) return;
        c.el.style.transition = 'none';
        c.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        moved.push(c.el);
      });
    });
    if (!moved.length) return;
    void content.offsetWidth;
    moved.forEach(function (el) { el.style.transition = ''; el.style.transform = ''; });
  }

  function render() {
    var keep = current(), before = positions();
    content.innerHTML = '';
    rows = [[{ el: toggle, section: 'toggle', id: 'toggle' }]];

    // Pinned: the dock's order, then dashed slots for what's left of the ten
    var sec = EZ.el('section', 'aa-sec pinned'), grid = EZ.el('div', 'aa-grid'), row = [];
    sec.appendChild(sectionHead('Pinned to Home', pins.length + ' of ' + MAX));
    pins.forEach(function (id) { var c = item('pin', id, false); grid.appendChild(c.el); row.push(c); });
    for (var k = pins.length; k < MAX; k++) {
      grid.appendChild(EZ.el('div', 'aa-item empty' + (k === pins.length ? ' next' : ''),
        '<div class="lift"><span class="slot">' + PLUS + '</span></div><div class="cap">' + (k === pins.length ? 'Hold OK to pin' : '') + '</div>'));
    }
    sec.appendChild(grid); content.appendChild(sec);
    if (row.length) rows.push(row);

    // Inputs
    if (inputs.length) {
      sec = EZ.el('section', 'aa-sec inputs'); grid = EZ.el('div', 'aa-grid'); row = [];
      sec.appendChild(sectionHead('Inputs'));
      inputs.forEach(function (i) { var c = item('input', i.id, true); grid.appendChild(c.el); row.push(c); });
      sec.appendChild(grid); content.appendChild(sec);
      rows.push(row);
    }

    // Apps, ten to a row
    sec = EZ.el('section', 'aa-sec apps'); grid = EZ.el('div', 'aa-grid');
    sec.appendChild(sectionHead('Apps', String(apps.length)));
    apps.forEach(function (a, n) {
      var c = item('app', a.id, true);
      grid.appendChild(c.el);
      if (n % COLS === 0) rows.push([]);
      rows[rows.length - 1].push(c);
    });
    sec.appendChild(grid); content.appendChild(sec);

    root.classList.toggle('arranging', arranging);
    toggle.classList.toggle('on', arranging);
    toggle.setAttribute('aria-pressed', String(arranging));
    restore(keep);
    glide(before);
  }

  // ---------- focus ----------
  function cellAt(p) { return rows[p.r] && rows[p.r][p.c]; }
  function current() { var c = cellAt(at); return c ? { section: c.section, id: c.id } : null; }

  // after a rebuild, find the same thing again (or what now sits where it was)
  function restore(keep) {
    var r, c;
    if (keep) {
      for (r = 0; r < rows.length; r++) for (c = 0; c < rows[r].length; c++) {
        if (rows[r][c].section === keep.section && rows[r][c].id === keep.id) return show({ r: r, c: c });
      }
    }
    r = Math.min(at.r, rows.length - 1);
    show({ r: r, c: Math.max(0, Math.min(at.c, rows[r].length - 1)) });
  }

  function focusCell(cell) {
    for (var r = 0; r < rows.length; r++) {
      var c = rows[r].indexOf(cell);
      if (c >= 0) return show({ r: r, c: c });
    }
  }

  function show(p) {
    rows.forEach(function (row) { row.forEach(function (c) { c.el.classList.remove('focused', 'carry'); }); });
    at = p;
    var cell = cellAt(at);
    cell.el.classList.add('focused');
    if (carry && cell.id === carry.id) cell.el.classList.add('carry');
    scrollTo(cell);
    describe();
    EZ.focus.moved('allapps', at.r, cell);
  }

  // keep the focused row inside the view; the content moves by transform, never by native scrolling
  var VIEW = 700, EDGE = 40;
  function scrollTo(cell) {
    if (cell.section === 'toggle' || at.r <= 1) scrollY = 0;
    else {
      var top = cell.el.offsetTop, bottom = top + cell.el.offsetHeight;
      if (top - scrollY < EDGE + 50) scrollY = Math.max(0, top - EDGE - 50);   // room for the section label
      else if (bottom - scrollY > VIEW - EDGE) scrollY = bottom - VIEW + EDGE;
    }
    content.style.transform = scrollY ? 'translateY(' + -Math.round(scrollY) + 'px)' : '';
  }

  // the row above or below, at the cell nearest in x
  // Up from the first row goes straight back Home (Down brought you here). The Arrange switch sits top right:
  // Right from the end of the first row reaches it, and Left or Down comes back.
  function vertical(dir) {
    var r = at.r + dir;
    if (r <= 0 && dir < 0) return close();
    if (r >= rows.length) return;
    var from = cellAt(at), x = from.section === 'toggle' ? 1e6 : from.el.offsetLeft + from.el.offsetWidth / 2;
    var best = 0, d = Infinity;
    rows[r].forEach(function (c, i) {
      var dd = Math.abs(c.el.offsetLeft + c.el.offsetWidth / 2 - x);
      if (dd < d) { d = dd; best = i; }
    });
    show({ r: r, c: best });
  }

  // ---------- words ----------
  function describe() {
    var cell = cellAt(at);
    sub.textContent = carry
      ? 'Moving ' + find(carry.id).name + ' — use the arrows, then OK to put it down'
      : arranging
        ? 'Pick up a pin or an app with OK to move it'
        : pins.length ? pins.length + ' of ' + MAX + ' pinned to Home'
          : 'Nothing pinned yet — hold OK on any app or input to put it on Home';
    var h;
    if (cell.section === 'toggle') h = hint('OK', arranging ? 'Done arranging' : 'Arrange') + hint('◀', 'Back to apps') + hint('▲', 'Home');
    else if (carry) h = hint(cell.section === 'pin' ? '◀ ▶' : '◀ ▶ ▲ ▼', 'Move') + hint('OK', 'Put down') + hint('Back', 'Cancel');
    else if (arranging && cell.section !== 'input') h = hint('OK', 'Pick up') + hint('Hold OK', isPinned(cell.id) ? 'Unpin' : 'Pin') + hint('Back', 'Done');
    else h = hint('OK', cell.section === 'input' ? 'Switch' : 'Open') + hint('Hold OK', isPinned(cell.id) ? 'Unpin from Home' : 'Pin to Home') + hint(at.r === 1 ? '▲' : 'Back', 'Home');
    // at the end of the first row, say where the Arrange switch is
    if (!carry && at.r === 1 && at.c === rows[1].length - 1) h += hint('▶', 'Arrange');
    hints.innerHTML = h;
  }

  function say(text, icon) {
    toast.innerHTML = (icon || '') + '<span>' + EZ.esc(text) + '</span>';
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  // ---------- changes ----------
  function savePins() { return EZ.api.saveConfig({ pins: pins.slice() }).then(function () { return EZ.dock.refresh(); }); }
  function saveOrder() { return EZ.api.saveConfig({ order: ids(apps) }); }

  function togglePin(id) {
    var o = find(id), i = pins.indexOf(id);
    if (i >= 0) {
      pins.splice(i, 1);
      say(o.name + ' unpinned');
    } else if (pins.length >= MAX) {
      return say('Home holds ' + MAX + ' — unpin one first');
    } else {
      pins.push(id);
      say(o.name + ' pinned to Home', '<i class="pin">' + PIN + '</i>');
    }
    render();
    savePins();
  }

  // moves the carried item within its own list: pins left/right, apps through the grid
  function shift(dr, dc) {
    var pin = carry.section === 'pin', list = pin ? pins : apps;
    if (pin && dr) return;
    var from = pin ? pins.indexOf(carry.id) : ids(apps).indexOf(carry.id), to = from + dc + dr * COLS;
    if (to < 0 || to >= list.length) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    render();
  }

  function pickUp(cell) {
    carry = { section: cell.section, id: cell.id, before: cell.section === 'pin' ? pins.slice() : apps.slice() };
    show(at);
  }
  function putDown() {
    var s = carry.section;
    carry = null;
    render();
    if (s === 'pin') savePins(); else saveOrder();
  }
  function cancel() {
    if (carry.section === 'pin') pins = carry.before; else apps = carry.before;
    carry = null;
    render();
  }

  function setArranging(on) {
    arranging = on;
    if (!on && carry) putDown(); else render();
  }

  // ---------- keys ----------
  var layer = {
    name: 'allapps',
    up: function () { if (carry) return shift(-1, 0); vertical(-1); },
    down: function () { if (carry) return shift(1, 0); vertical(1); },
    left: function () {
      if (carry) return shift(0, -1);
      if (at.r === 0) return vertical(1);
      if (at.c > 0) show({ r: at.r, c: at.c - 1 });
    },
    right: function () {
      if (carry) return shift(0, 1);
      if (at.c < rows[at.r].length - 1) show({ r: at.r, c: at.c + 1 });
      else if (at.r === 1) show({ r: 0, c: 0 });
    },
    ok: function () {
      var cell = cellAt(at);
      if (!cell) return;
      if (cell.section === 'toggle') return setArranging(!arranging);
      if (carry) return putDown();
      if (arranging && cell.section !== 'input') return pickUp(cell);
      EZ.api.launch(cell.id);
      close(true);
    },
    hold: function () {
      var cell = cellAt(at);
      if (!cell || cell.section === 'toggle' || carry) return layer.ok();
      togglePin(cell.id);
    },
    back: function () {
      if (carry) return cancel();
      if (arranging) return setArranging(false);
      close();
    }
  };

  // ---------- open / close ----------
  // The screen is built ahead of time (prepare, after Home is up), so opening is only the slide: nothing
  // heavy happens in the frames where the deck starts moving. After the slide it catches up with changes.
  var stamp = null;
  function load() {
    return Promise.all([EZ.api.apps(), EZ.api.inputs(), EZ.api.config()]).then(function (r) {
      var p = ids(EZ.dock.pins(r[0], r[1], r[2]));
      var key = JSON.stringify([r[0].map(function (a) { return [a.id, a.name, a.icon]; }),
        r[1].map(function (i) { return [i.id, i.name, i.kind, i.port]; }), p]);
      if (key === stamp) return false;
      stamp = key; apps = r[0]; inputs = r[1]; conf = r[2]; pins = p;
      return true;
    });
  }

  // decode every icon now, while nothing moves, so the slide never waits on decoding an image
  function decodeIcons() {
    EZ.$$('img', content).forEach(function (img) { if (img.decode) img.decode().catch(function () {}); });
  }

  // the same warm-up as Settings: All apps drawn in place at 1% opacity for two frames, so its first slide (after
  // start, and after another app ran and the TV dropped its drawing) isn't also its first paint
  function warm() {
    if (isOpen || !content.firstChild) return;
    var view = EZ.$('.aa-view', root);
    view.style.transition = 'none';   // same as Settings: nothing may animate when the warm-up ends
    root.classList.add('warm');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.remove('warm');
        void view.offsetWidth;
        view.style.transition = '';
      });
    });
  }

  function prepare() {
    if (isOpen) return Promise.resolve();
    return load().then(function (changed) {
      if (changed && !isOpen) { arranging = false; carry = null; at = { r: 1, c: 0 }; render(); decodeIcons(); }
    });
  }

  function open(id, grab) {
    if (isOpen) return Promise.resolve();
    return (stamp ? Promise.resolve() : load()).then(function () {
      var was = arranging;
      arranging = !!grab; carry = null; at = { r: 1, c: 0 }; scrollY = 0;
      if (!content.firstChild || was !== arranging) render(); else restore(null);
      var found = false;
      for (var rr = 1; id && !found && rr < rows.length; rr++) {
        for (var c = 0; c < rows[rr].length; c++) {
          if (rows[rr][c].id !== id) continue;
          show({ r: rr, c: c });
          if (grab && rows[rr][c].section === 'pin') pickUp(rows[rr][c]);
          found = true; break;
        }
      }
      if (rows.length < 2) show({ r: 0, c: 0 });
      isOpen = true;
      root.setAttribute('aria-hidden', 'false');
      root.classList.remove('in');
      EZ.focus.push(layer);
      // Start the slide two frames later: the focus and layout work above gets its own frame, so the slide's first
      // frames aren't the ones paying for it (that's where a TV visibly stutters).
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (!isOpen) return;
          EZ.hold(900);
          document.body.classList.add('apps');
          root.classList.add('in');
          EZ.perf('All apps slide', 700);
        });
      });
      // once the deck has landed: a new app, or something changed while closed, shows up now
      setTimeout(function () {
        if (!isOpen || carry) return;
        load().then(function (changed) { if (changed && isOpen && !carry) render(); });
      }, 800);
    });
  }

  function close(instant) {
    if (!isOpen) return;
    if (carry) cancel();
    isOpen = false; arranging = false;
    root.setAttribute('aria-hidden', 'true');
    EZ.focus.pop('allapps');
    var deck = EZ.$('#deck');
    if (!instant) EZ.hold(900);
    if (instant) deck.style.transition = 'none';
    document.body.classList.remove('apps');
    if (instant) { void deck.offsetWidth; deck.style.transition = ''; }
    root.classList.remove('in');
    if (!instant) EZ.perf('Home slide back', 700);
  }

  EZ.arrange = {
    start: function () {
      root = EZ.$('#allapps'); content = EZ.$('#aa-content'); sub = EZ.$('#aa-sub');
      hints = EZ.$('#aa-hints'); toggle = EZ.$('#aa-toggle'); toast = EZ.$('#aa-toast');
      toggle.addEventListener('click', function () { if (isOpen && !carry) { show({ r: 0, c: 0 }); setArranging(!arranging); } });
      toggle.addEventListener('mouseenter', function () { if (!carry && isOpen) show({ r: 0, c: 0 }); });
      // the Magic Remote's wheel steps a row at a time
      var lastWheel = 0;
      root.addEventListener('wheel', function (e) {
        var t = Date.now();
        if (!isOpen || t - lastWheel < 160) return;
        lastWheel = t;
        if (e.deltaY > 0) layer.down(); else if (e.deltaY < 0 && at.r > 0) layer.up();
      });
    },
    open: open,
    prepare: prepare,
    warm: warm,
    close: close,
    isOpen: function () { return isOpen; }
  };
})();
