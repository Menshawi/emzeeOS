// Inputs sheet: large cards over a blurred Home. Opens on the Input key, Back closes it.
(function () {
  var sheet, cards, sub, list = [], els = [], index = 0, isOpen = false;

  function usable(i) { return i.status !== 'off'; }

  function render(inputs) {
    list = inputs; els = [];
    cards.innerHTML = '';
    inputs.forEach(function (i, n) {
      var c = EZ.el('button', 'card' + (usable(i) ? '' : ' off'));
      c.tabIndex = -1;
      c.setAttribute('aria-label', i.name);
      c.innerHTML =
        '<span class="chip">' + (EZ.ICON[i.kind] || EZ.ICON.hdmi) + '</span>' +
        '<span class="label"><span class="name">' + EZ.esc(i.name) + '</span>' +
        '<span class="detail">' + (i.status === 'playing' ? '<span class="live"></span>' : '') + EZ.esc(i.detail || i.port || '') + '</span></span>';
      c.addEventListener('click', function () { if (usable(i)) { focus(n); activate(); } });
      c.addEventListener('mouseenter', function () { if (usable(i) && n !== index) focus(n); });   // Magic Remote pointer
      cards.appendChild(c); els.push(c);
    });
    var on = inputs.filter(function (i) { return i.status === 'playing'; })[0];
    sub.textContent = on ? on.name + ' is on. Choose what to watch.' : 'Choose what to watch.';
  }

  function focus(n) {
    if (els[index]) els[index].classList.remove('focused');
    index = n;
    if (els[index]) els[index].classList.add('focused');
    EZ.focus.moved('sheet', index, list[index]);
  }

  function activate() {
    var i = list[index];
    if (!i || !usable(i)) return;
    EZ.api.launch(i.id);
    close();
  }

  // Opens at once with the last list it had (asking the TV for inputs can take most of a second), then
  // refreshes in place if anything changed, keeping the focus on the same input.
  function open() {
    if (isOpen) return;
    isOpen = true;
    if (list.length) show(list);
    EZ.api.inputs().then(function (inputs) {
      if (!isOpen) { list = inputs; return; }
      if (!els.length) return show(inputs);
      if (JSON.stringify(inputs) === JSON.stringify(list)) return;
      var id = list[index] && list[index].id;
      render(inputs);
      var n = inputs.map(function (i) { return i.id; }).indexOf(id);
      focus(n >= 0 && usable(inputs[n]) ? n : EZ.focus.step(list, -1, 1, usable));
    });
  }

  function show(inputs) {
    EZ.hold(600);
    render(inputs);
    var playing = -1;
    inputs.forEach(function (i, n) { if (playing < 0 && i.status === 'playing') playing = n; });
    index = 0;
    focus(playing >= 0 ? playing : EZ.focus.step(list, -1, 1, usable));
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sheet-open');
    EZ.focus.push({
      name: 'sheet',
      left: function () { var n = EZ.focus.step(list, index, -1, usable); if (n !== index) focus(n); },
      right: function () { var n = EZ.focus.step(list, index, 1, usable); if (n !== index) focus(n); },
      ok: activate,
      back: close
    });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sheet-open');
    EZ.focus.pop('sheet');
  }

  EZ.inputs = {
    start: function () {
      sheet = EZ.$('#sheet'); cards = EZ.$('#cards'); sub = EZ.$('#sheet-sub');
      EZ.on('inputkey', function () { if (isOpen) close(); else open(); });
      // fetch once early, so even the first open is instant
      setTimeout(function () { EZ.api.inputs().then(function (l) { if (!list.length && !isOpen) list = l; }); }, 2000);
    },
    open: open,
    close: close,
    isOpen: function () { return isOpen; }
  };
})();
