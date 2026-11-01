// Idle: after 2 minutes the dock and weather fade, the sky takes the screen and a soft clock wanders;
// after 15 it goes nearly black. The first key only wakes the screen.
(function () {
  var IDLE_MS = 2 * 60000, DEEP_MS = 15 * 60000, WANDER_MS = 60000;
  // spots inside the safe area (88 x 112) that leave room for the ambient block (~700 x 360)
  var SKY_SPOTS = [[112, 96], [1040, 120], [800, 560], [140, 600], [1060, 600], [480, 320]];
  // with the fireplace, just a small faint time in the top-right corner, shifting a few pixels now and then
  var FIRE_SPOTS = [[1560, 76], [1546, 88], [1570, 96], [1554, 82]];
  var SPOTS = SKY_SPOTS;
  // the clock takes on the light of the hour: ink colour and a faint glow
  var TINT = {
    dawn: ['rgb(255, 236, 224)', 'rgba(255, 170, 120, 0.18)'],
    day: ['rgb(240, 246, 255)', 'rgba(170, 205, 255, 0.14)'],
    dusk: ['rgb(255, 230, 212)', 'rgba(255, 140, 80, 0.18)'],
    night: ['rgb(226, 233, 255)', 'rgba(140, 160, 255, 0.14)'],
    fire: ['rgb(255, 232, 210)', 'rgba(255, 140, 60, 0.20)']
  };
  var MOON = [[1.84, 'New moon'], [5.53, 'Waxing crescent'], [9.22, 'First quarter'], [12.91, 'Waxing gibbous'],
    [16.61, 'Full moon'], [20.30, 'Waning gibbous'], [23.99, 'Last quarter'], [27.68, 'Waning crescent'], [99, 'New moon']];
  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
  var METEOR_TEST = /[?&]meteor=1\b/.test(location.search);

  // the screen saver's style (Settings): the sky, or the fireplace (with or without its crackle)
  var saver = 'sky';
  // the fireplace, once it's really playing: the clock moves to the corners, off the flames, and turns warm
  function startFire() {
    EZ.fire.start(saver).then(function (on) {
      if (!on || !body.classList.contains('idle')) return;
      SPOTS = FIRE_SPOTS; place(0, true); tint('fire');
    });
  }
  function setIdle(c) {
    saver = (c && c.saver) || 'sky';
    var m = c && typeof c.idleMinutes === 'number' ? c.idleMinutes : 2;
    IDLE_MS = m * 60000;
    if (!body.classList.contains('idle')) return arm();
    // already showing: follow a style that arrived (or changed) meanwhile
    var want = saver.indexOf('fire') === 0;
    if (want && EZ.fire && !EZ.fire.isOn()) startFire();
    else if (!want && EZ.fire && EZ.fire.isOn()) { SPOTS = SKY_SPOTS; EZ.fire.stop(); tint(EZ.sky.phase()); }
  }

  var idleTimer, deepTimer, wanderTimer, kickTimer, meteorTimer, spot = 0;
  var body = document.body, amb, time, skyLine, icon, meteors;

  function place(n, instant) {
    spot = n;
    if (instant) amb.style.transition = 'opacity 2s ease';
    amb.style.transform = 'translate(' + SPOTS[n][0] + 'px,' + SPOTS[n][1] + 'px)';
    if (instant) { void amb.offsetWidth; amb.style.transition = ''; }
  }

  // spots where the clock block wouldn't cover the sun or moon
  function clear(n) {
    var b = EZ.sky.body(), s = SPOTS[n], pad = 140;
    return !(b.x > s[0] - pad && b.x < s[0] + 720 + pad && b.y > s[1] - pad && b.y < s[1] + 380 + pad);
  }
  function pick(except) {
    var ok = [], all = [], i;
    for (i = 0; i < SPOTS.length; i++) if (i !== except) { all.push(i); if (clear(i)) ok.push(i); }
    var from = ok.length ? ok : all;
    return from[Math.floor(Math.random() * from.length)];
  }

  function wander() { place(pick(spot)); }

  function hhmm(h) { var m = Math.round((h % 1) * 60), H = Math.floor(h) + (m === 60 ? 1 : 0); return EZ.pad(H % 24) + ':' + EZ.pad(m % 60); }

  // one quiet line about the sky: the moon at night, the light left in the day
  function describeSky() {
    var phase = EZ.sky.phase(), s = EZ.sky.times(), hour = EZ.sky.hour();
    if (phase === 'night' || hour < s.rise) {
      var age = EZ.sky.moonAge(new Date()), name = MOON.filter(function (m) { return age < m[0]; })[0][1];
      var lit = Math.round((1 - Math.cos(2 * Math.PI * age / 29.530588853)) / 2 * 100);
      skyLine.textContent = name + ' · ' + lit + '% lit · Sunrise ' + hhmm(s.rise);
      // a small copy of tonight's moon, from the one the sky painted
      var src = EZ.$('#moon .crescent canvas');
      icon.innerHTML = '';
      if (src) {
        var c = document.createElement('canvas'); c.width = c.height = 60;
        c.getContext('2d').drawImage(src, 0, 0, 60, 60);
        icon.appendChild(c);
      }
    } else {
      var mins = Math.round((s.set - hour) * 60), h = Math.floor(mins / 60), m = mins % 60;
      var span = h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min';
      skyLine.textContent = 'Sunset ' + hhmm(s.set) + (mins > 0 ? ' · ' + span + ' of daylight left' : '');
      icon.innerHTML = SUN;
    }
  }

  function tint(phase) {
    var t = TINT[phase] || TINT.night;
    amb.style.setProperty('--amb-ink', t[0]);
    amb.style.setProperty('--amb-glow', t[1]);
  }

  // ---- shooting stars, at night only ----
  function meteor() {
    if (!body.classList.contains('idle')) return;
    if ((EZ.sky.phase() === 'night' && !body.classList.contains('calm') && !body.classList.contains('fire')) || METEOR_TEST) {
      var m = EZ.el('div', 'meteor');
      var right = Math.random() < 0.5;
      m.style.left = Math.round(200 + Math.random() * 1300) + 'px';
      m.style.top = Math.round(60 + Math.random() * 360) + 'px';
      m.style.setProperty('--a', (right ? 18 + Math.random() * 20 : 142 + Math.random() * 20).toFixed(1) + 'deg');
      meteors.appendChild(m);
      setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, 1600);
    }
    meteorTimer = setTimeout(meteor, METEOR_TEST ? 3000 : 20000 + Math.random() * 40000);
  }

  function enter() {
    if (body.classList.contains('idle')) return;
    if (EZ.inputs && EZ.inputs.isOpen()) EZ.inputs.close();
    if (EZ.arrange && EZ.arrange.isOpen()) EZ.arrange.close();
    if (EZ.settings && EZ.settings.isOpen()) EZ.settings.close();
    if (EZ.wx) EZ.wx.close();
    if (EZ.focus.top() === 'gear') EZ.settings.leaveGear();
    SPOTS = SKY_SPOTS;
    describeSky();
    place(clear(0) ? 0 : pick(0), true);
    body.classList.add('idle');
    if (saver.indexOf('fire') === 0 && EZ.fire) startFire();
    kickTimer = setTimeout(wander, 1500);
    wanderTimer = setInterval(wander, WANDER_MS);
    deepTimer = setTimeout(function () { body.classList.add('deep'); }, DEEP_MS - 2 * 60000);   // 13 min into the screen saver
    meteorTimer = setTimeout(meteor, METEOR_TEST ? 1500 : 8000 + Math.random() * 12000);
  }

  function wake() {
    clearTimeout(kickTimer); clearInterval(wanderTimer); clearTimeout(deepTimer); clearTimeout(meteorTimer);
    body.classList.remove('idle', 'deep');
    if (EZ.fire && EZ.fire.isOn()) { EZ.fire.stop(); tint(EZ.sky.phase()); }
  }

  // the screen saver's start comes from Settings (idleMinutes; 0 = never)
  function arm() {
    clearTimeout(idleTimer);
    if (IDLE_MS > 0) idleTimer = setTimeout(enter, IDLE_MS);
  }

  EZ.idle = {
    start: function () {
      amb = EZ.$('#ambient'); time = EZ.$('.amb-time', amb);
      skyLine = EZ.$('#amb-sky'); icon = EZ.$('#amb-icon'); meteors = EZ.$('#meteors');
      tint(EZ.sky.phase());
      EZ.on('phase', function (p) { tint(p.phase); });
      EZ.on('minute', function () {
        if (!body.classList.contains('idle')) return;
        time.classList.remove('tick'); void time.offsetWidth; time.classList.add('tick');
        describeSky();
      });
      EZ.focus.intercept(function () {
        var asleep = body.classList.contains('idle');
        if (asleep) wake();
        arm();
        return asleep; // swallow the waking key
      });
      // moving the Magic Remote pointer is activity too (throttled: it fires on every pixel)
      var lastMove = 0;
      document.addEventListener('mousemove', function () {
        var t = Date.now();
        if (t - lastMove < 500) return;
        lastMove = t;
        if (body.classList.contains('idle')) wake();
        arm();
      });
      if (/[?&]idle=1\b/.test(location.search)) enter(); else arm();
      EZ.api.config().then(setIdle);
      EZ.on('config', setIdle);
    },
    enter: enter,
    wake: function () { wake(); arm(); }
  };
})();
