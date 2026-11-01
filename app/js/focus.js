// Focus engine for the remote (keyboard in the preview). Layers stack: the dock at the bottom, the sheet above it.
// A layer is { name, left, right, up, down, ok, back } — each optional. The top layer gets the keys.
(function () {
  var stack = [];
  var interceptors = [];

  function top() { return stack[stack.length - 1]; }

  function onKey(e) {
    var code = e.keyCode || e.which;
    // typing in a text field (the Settings town search): letters, Space, Backspace and ← → edit the text;
    // only ↑ ↓, Enter and the remote's Back go to the layer
    if (e.target && e.target.tagName === 'INPUT' && !EZ.is(code, 'UP') && !EZ.is(code, 'DOWN') && code !== 13 && code !== 461 && code !== 27) return;
    for (var i = 0; i < interceptors.length; i++) {
      if (interceptors[i](code, e)) { e.preventDefault(); return; }
    }
    var L = top();
    var handled = true;
    if (EZ.is(code, 'INPUT')) EZ.emit('inputkey');
    else if (!L) handled = false;
    else if (EZ.is(code, 'LEFT')) L.left && L.left();
    else if (EZ.is(code, 'RIGHT')) L.right && L.right();
    else if (EZ.is(code, 'UP')) L.up && L.up();
    else if (EZ.is(code, 'DOWN')) L.down && L.down();
    else if (EZ.is(code, 'OK')) { if (!e.repeat) press(L); }
    else if (EZ.is(code, 'BACK')) L.back && L.back();
    else handled = false;
    if (handled) e.preventDefault();
  }

  // OK on a layer with a hold action: a short press fires ok on release, holding fires hold.
  // Layers without hold get ok straight away on key down.
  var HOLD_MS = 600, holdTimer = null, holdLayer = null;
  function press(L) {
    if (!L.hold) return L.ok && L.ok();
    clearTimeout(holdTimer);
    holdLayer = L;
    holdTimer = setTimeout(function () { holdTimer = null; holdLayer = null; L.hold(); }, HOLD_MS);
  }
  function onKeyUp(e) {
    if (!holdTimer || !EZ.is(e.keyCode || e.which, 'OK')) return;
    clearTimeout(holdTimer); holdTimer = null;
    var L = holdLayer; holdLayer = null;
    if (L === top() && L.ok) L.ok();
  }

  EZ.focus = {
    start: function () { window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp); },
    push: function (layer) { stack.push(layer); EZ.emit('layer', layer.name); },
    pop: function (name) {
      for (var i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) { stack.splice(i, 1); EZ.emit('layer', top().name); return; }
      }
    },
    top: function () { return top() && top().name; },
    // an interceptor sees every key first; return true to swallow it (idle uses this)
    intercept: function (fn) { interceptors.push(fn); },
    // layers call this when their selection changes
    moved: function (layer, index, item) { EZ.emit('focus', { layer: layer, index: index, item: item }); },
    // step through a list, skipping items the predicate rejects; stops at the ends
    step: function (list, from, dir, ok) {
      for (var i = from + dir; i >= 0 && i < list.length; i += dir) if (!ok || ok(list[i])) return i;
      return from;
    }
  };
})();
