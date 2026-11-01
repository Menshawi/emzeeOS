// Dock: apps, a divider, two inputs, then All apps. The focused tile lifts; the spotlight names it.
(function () {
  var items = [], tiles = [], index = 0;
  var dock, spot, spotName, spotSub, swapTimer;

  function appTile(a) {
    var t = EZ.el('button', 'tile app');
    if (a.icon) {
      var img = new Image();
      img.alt = '';
      img.decoding = 'async';   // decode off the main thread, so focus never waits on an icon
      img.onerror = function () { img.remove(); fill(t, a); };
      // a wide (or tall) icon is fitted whole on the app's own colour instead of being cropped
      img.onload = function () {
        if (img.naturalHeight && Math.abs(img.naturalWidth / img.naturalHeight - 1) > 0.08) {
          t.classList.add('fit');
          if (a.color) t.style.background = a.color;
        }
      };
      img.src = a.icon;
      t.appendChild(img);
    } else fill(t, a);
    return t;
  }

  // gradient stand-in until the TV supplies the app's own icon
  function fill(t, a) {
    t.style.background = 'linear-gradient(160deg,' + (a.c1 || '#3A3A40') + ',' + (a.c2 || '#16161A') + ')';
    t.insertBefore(EZ.el('span', 'glyph', EZ.esc(a.glyph || (a.name || '?').charAt(0).toUpperCase())), t.firstChild);
  }

  function inputTile(i) {
    // the device's name when it has one (PlayStation, Apple TV); the port only when that's all there is.
    // The port still shows under the name in the spotlight ("HDMI 1 · On and ready").
    var label = i.name && i.name !== i.port ? i.name : i.port || '';
    var t = EZ.el('button', 'tile input', (EZ.ICON[i.kind] || EZ.ICON.hdmi) + '<span class="port">' + EZ.esc(label) + '</span>');
    return t;
  }

  // What Home pins, in order: up to 10 apps or inputs (config "pins"). Before anything is pinned, the first
  // few apps and two inputs, as the dock always showed. Ids that are no longer installed drop out.
  var MAX_PINS = 10;
  function pins(apps, inputs, conf) {
    var ids = conf.pins;
    if (!Array.isArray(ids)) {
      ids = apps.filter(function (a) { return !a.hidden; }).slice(0, conf.dockSize || 6).map(function (a) { return a.id; })
        .concat(inputs.slice(0, 2).map(function (i) { return i.id; }));
    }
    var out = [];
    ids.forEach(function (id) {
      if (out.length >= MAX_PINS) return;
      var a = apps.filter(function (x) { return x.id === id; })[0];
      var i = !a && inputs.filter(function (x) { return x.id === id; })[0];
      if (a) out.push({ type: 'app', id: id, obj: a });
      else if (i) out.push({ type: 'input', id: id, obj: i });
    });
    return out;
  }

  function render(apps, inputs, conf) {
    dock.innerHTML = '';
    items = []; tiles = [];
    dot = EZ.el('i', 'dock-dot');
    dock.appendChild(dot);
    pins(apps, inputs, conf).forEach(function (p) {
      var o = p.obj;
      if (p.type === 'app') add(appTile(o), { type: 'app', id: o.id, name: o.name, sub: o.sub || '' });
      else add(inputTile(o), { type: 'input', id: o.id, name: o.name, sub: o.sub || o.detail || o.port });
    });
    if (!items.length) {
      // nothing pinned: the dock still offers the way to All apps
      add(EZ.el('button', 'tile all', EZ.ICON.grid), { type: 'all', name: 'All apps', sub: 'Hold OK on any app there to pin it here' });
    }
    index = Math.min(index, items.length - 1);
    focus(index, true);
    // the first placement jumps; after that every change glides
    dock.classList.add('still');
    magnify(index);
    void dock.offsetWidth;
    dock.classList.remove('still');
  }

  // ---- Mac Dock magnification ----
  // Each tile's size follows a bell curve around a centre (the focused tile, or the pointer, in tile units):
  // 1.36x at the centre, ~1.19x next door, ~1.03x two away. Grown tiles push their neighbours outward by
  // exactly the width they gained, centred on the dock, and the shelf widens by the same amount.
  var TILE = 140, GAP = 24, PAD = 28, PEAK = 0.36, WIDTH = 0.9;
  var dot = null;   // the small light under the focused tile, gliding with it
  function magnify(cx) {
    if (!tiles.length) return;
    var scales = tiles.map(function (t, i) { var d = i - cx; return 1 + PEAK * Math.exp(-(d * d) / (2 * WIDTH * WIDTH)); });
    var extra = scales.map(function (s) { return TILE * (s - 1); });
    var total = extra.reduce(function (a, b) { return a + b; }, 0), run = 0;
    tiles.forEach(function (t, i) {
      var x = run + extra[i] / 2 - total / 2;
      run += extra[i];
      t.style.transform = 'translateX(' + x.toFixed(1) + 'px) scale(' + scales[i].toFixed(3) + ')';
      if (i === index && dot) dot.style.transform = 'translateX(' + (PAD + i * (TILE + GAP) + TILE / 2 + x).toFixed(1) + 'px)';
    });
    if (dot) dot.classList.toggle('on', !!tiles[index] && tiles[index].classList.contains('focused'));
    dock.style.setProperty('--shelf', ((dock.offsetWidth + total) / dock.offsetWidth).toFixed(4));
  }

  // the pointer: the wave follows the hand across the dock (once per frame at most)
  var pointerX = null, waveQueued = false;
  function followPointer(e) {
    if (EZ.focus.top() !== 'dock') return;
    var r = dock.getBoundingClientRect(), k = r.width / dock.offsetWidth || 1;
    pointerX = ((e.clientX - r.left) / k - PAD - TILE / 2) / (TILE + GAP);
    if (waveQueued) return;
    waveQueued = true;
    requestAnimationFrame(function () {
      waveQueued = false;
      if (pointerX == null) return;
      dock.classList.add('tracking');
      magnify(Math.max(-0.5, Math.min(tiles.length - 0.5, pointerX)));
    });
  }
  function leavePointer() { pointerX = null; dock.classList.remove('tracking'); magnify(index); }

  function add(tile, item) {
    var n = items.length;
    tile.setAttribute('aria-label', item.name);
    tile.setAttribute('role', 'menuitem');
    tile.tabIndex = -1;
    tile.appendChild(EZ.el('span', 'sheen'));
    tile.addEventListener('click', function () { focus(n); activate(); });
    // the Magic Remote pointer: hovering a tile focuses it, as LG's launcher does
    tile.addEventListener('mouseenter', function () { if (n !== index && EZ.focus.top() === 'dock') focus(n); });
    dock.appendChild(tile);
    tiles.push(tile); items.push(item);
  }

  function focus(n, instant) {
    if (tiles[index]) tiles[index].classList.remove('focused');
    index = n;
    tiles[index].classList.add('focused');
    if (pointerX == null) { magnify(index); if (!instant) EZ.perf('dock move', 320); }
    var it = items[index];
    clearTimeout(swapTimer);
    if (instant) { spotName.textContent = it.name; spotSub.textContent = it.sub; }
    else {
      spot.classList.add('swap');
      swapTimer = setTimeout(function () {
        spotName.textContent = it.name; spotSub.textContent = it.sub;
        spot.classList.remove('swap');
      }, 160);
    }
    EZ.focus.moved('dock', index, it);
  }

  function activate() {
    var it = items[index];
    if (!it) return;
    if (it.type === 'all') EZ.arrange.open();
    else EZ.api.launch(it.id);
  }

  // hold OK on a pin: All apps opens in Arrange with that pin picked up
  function hold() {
    var it = items[index];
    if (it && it.type !== 'all') EZ.arrange.open(it.id, true);
    else activate();
  }

  // Rebuilding the dock throws away every tile and reloads every icon, so only do it when what it shows changed
  // (pressing Home calls this each time).
  var shown = null;
  function load() {
    return Promise.all([EZ.api.apps(), EZ.api.inputs(), EZ.api.config()]).then(function (r) {
      var key = JSON.stringify(pins(r[0], r[1], r[2]).map(function (p) {
        var o = p.obj;
        return [p.id, o.name, o.icon, o.kind, o.port, o.sub || o.detail];
      }));
      if (key === shown) return;
      shown = key;
      render(r[0], r[1], r[2]);
    });
  }

  EZ.dock = {
    start: function () {
      dock = EZ.$('#dock'); spot = EZ.$('.spotlight');
      spotName = EZ.$('#spot-name'); spotSub = EZ.$('#spot-sub');
      EZ.focus.push({
        name: 'dock',
        left: function () { var n = EZ.focus.step(items, index, -1); if (n !== index) focus(n); },
        right: function () { var n = EZ.focus.step(items, index, 1); if (n !== index) focus(n); },
        ok: activate,
        hold: hold,
        down: function () { EZ.arrange.open(); },
        up: function () { EZ.settings.focusGear(); }
      });
      EZ.$('#dock-more').addEventListener('click', function () { EZ.arrange.open(); });
      dock.addEventListener('mousemove', followPointer);
      dock.addEventListener('mouseleave', leavePointer);
      // a key press hides the Magic Remote's pointer: the wave goes back to the focused tile
      window.addEventListener('keydown', function () { if (pointerX != null) leavePointer(); }, true);
      return load();
    },
    refresh: load,
    tile: appTile,
    // the gear takes focus: the dock settles flat; and gives it back
    rest: function () { if (tiles[index]) tiles[index].classList.remove('focused'); pointerX = null; magnify(-99); },
    wake: function () { if (tiles[index]) focus(index, true); },
    inputTile: inputTile,
    pins: pins,
    MAX_PINS: MAX_PINS
  };
})();
