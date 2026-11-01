// Shared helpers. Classic scripts on purpose: webOS loads apps from file://, where ES modules are unreliable.
window.EZ = window.EZ || {};

EZ.$ = function (sel, root) { return (root || document).querySelector(sel); };
EZ.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

EZ.el = function (tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

EZ.pad = function (n) { return (n < 10 ? '0' : '') + n; };

EZ.esc = function (s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};

// Remote and keyboard keys. The keyboard mapping is for the desktop preview.
EZ.KEY = {
  LEFT: [37], UP: [38], RIGHT: [39], DOWN: [40],
  OK: [13, 32],
  BACK: [461, 27, 8],
  INPUT: [1056, 73] // webOS Input key; "i" in the preview
};
EZ.is = function (code, name) { return EZ.KEY[name].indexOf(code) !== -1; };

// tiny event bus so modules stay independent
EZ._subs = {};
EZ.on = function (ev, fn) { (EZ._subs[ev] = EZ._subs[ev] || []).push(fn); };
EZ.emit = function (ev, data) { (EZ._subs[ev] || []).forEach(function (fn) { fn(data); }); };

// stroke icons for inputs, shared by the dock and the sheet
EZ.ICON = {
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 8h10a4 4 0 0 1 3.9 4.9l-.8 3.4a2.3 2.3 0 0 1-4 .9L14.5 15h-5l-1.6 2.2a2.3 2.3 0 0 1-4-.9l-.8-3.4A4 4 0 0 1 7 8z"/><path d="M8 10.5v3M6.5 12h3"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="9" width="16" height="7" rx="2.5"/><path d="M9 19.5h6"/></svg>',
  pc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 3l3.5 4 3.5-4"/></svg>',
  cast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 17a4 4 0 0 1 4 4M3 13a8 8 0 0 1 8 8M3 9a12 12 0 0 1 12 12"/><path d="M7 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/></svg>',
  hdmi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 8h16v5l-2 3H6l-2-3z"/><path d="M8 11h8"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>'
};

// Smoothness, measured where it matters (on the TV): counts frame gaps for `ms` after an animation starts and
// sends a one-line summary to the helper's log ("All apps slide: 58 fps, worst 21 ms, 0 slow frames").
// At most once every 10 s per label; does nothing in the desktop preview without the helper.
EZ._perfAt = {};
EZ.perf = function (label, ms) {
  var now = Date.now();
  if (EZ._perfAt[label] && now - EZ._perfAt[label] < 10000) return;
  EZ._perfAt[label] = now;
  var gaps = [], last = 0, start = 0;
  function tick(t) {
    if (!start) start = t;
    if (last) gaps.push(t - last);
    last = t;
    if (t - start < ms) return requestAnimationFrame(tick);
    if (!gaps.length) return;
    var total = gaps.reduce(function (a, b) { return a + b; }, 0);
    var worst = Math.max.apply(null, gaps), slow = gaps.filter(function (g) { return g > 25; }).length;
    if (EZ.api && EZ.api.perf) EZ.api.perf(label, Math.round(1000 * gaps.length / total), Math.round(worst), slow, gaps.length);
  }
  requestAnimationFrame(tick);
};

// While a screen slides, nothing else should ask the TV for work: background jobs (the cloud drift) check this
// and wait. EZ.hold(ms) is called as a slide starts.
EZ.quietUntil = 0;
EZ.hold = function (ms) { EZ.quietUntil = Math.max(EZ.quietUntil, Date.now() + ms); };
