// Wires the modules together and fits the 1920x1080 stage to the window.
(function () {
  var stage = EZ.$('#stage');

  // On the TV the window is 1920x1080 and this is a no-op; in a desktop browser it letterboxes.
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
    stage.style.left = Math.max(0, (window.innerWidth - 1920 * s) / 2) + 'px';
    stage.style.top = Math.max(0, (window.innerHeight - 1080 * s) / 2) + 'px';
  }

  // Drop backdrop blur if the first few seconds run under ~40 fps.
  function watchFps() {
    var frames = 0, start = 0;
    function tick(t) {
      if (document.hidden) return; // background tabs throttle rAF; don't judge them
      if (!start) start = t;
      frames++;
      if (t - start < 3000) return requestAnimationFrame(tick);
      var fps = frames * 1000 / (t - start);
      if (fps < 40) { document.body.classList.add('no-blur'); console.log('[emzee] ' + fps.toFixed(0) + ' fps, blur off'); }
    }
    setTimeout(function () { requestAnimationFrame(tick); }, 1000);
  }

  fit();
  window.addEventListener('resize', fit);
  // On the TV, solid glass from the start (?blur=1 brings the live blur back to compare); elsewhere, watch the frame rate.
  var onTV = typeof window.PalmServiceBridge !== 'undefined' || /Web0S|webOS/i.test(navigator.userAgent);
  if (/[?&]blur=0\b/.test(location.search) || (onTV && !/[?&]blur=1\b/.test(location.search))) document.body.classList.add('no-blur');
  else watchFps();

  // the clock and dock first, so they are on screen at once over index.html's first-paint gradient
  EZ.focus.start();
  EZ.clock.start();
  EZ.inputs.start();
  EZ.arrange.start();
  EZ.settings.start();
  EZ.wx.start();
  // the dock on screen is "ready"; the helper passes that on to boot.sh's failsafe
  EZ.dock.start().then(function () {
    EZ.emit('ready'); EZ.api.ready();
    if (asked() === 'inputs') EZ.inputs.open();
    // build All apps while nothing else is happening, so Down only has to slide it in; then have the TV paint it
    // and the Settings panel once, unseen, so neither first slide pays for its first paint
    setTimeout(function () { EZ.arrange.prepare().then(function () { setTimeout(warmUp, 300); }); }, 1500);
  });
  // the sky (stars, moon and clouds take a moment to draw) and what depends on it, once that first frame is up
  requestAnimationFrame(function () {
    setTimeout(function () {
      EZ.sky.start();
      EZ.weather.start();
      EZ.idle.start();
    }, 0);
  });

  // photo wallpaper, when chosen in config (or ?wallpaper=<url> in the preview)
  function wallpaper(c) {
    var url = EZ.api.wallpaperUrl();
    EZ.sky.setWallpaper((c.wallpaper === 'photo' || /[?&]wallpaper=/.test(location.search)) ? url : null);
  }
  EZ.api.config().then(wallpaper);
  EZ.on('config', wallpaper);

  // one at a time, a moment apart, while nobody is pressing anything
  function warmUp() {
    if (document.hidden || EZ.focus.top() !== 'dock') return;
    EZ.arrange.warm();
    setTimeout(function () { if (EZ.focus.top() === 'dock') EZ.settings.warm(); }, 400);
  }

  // Behind another app the page may stay alive: freeze every animation until it's back in front.
  function visibility() { document.body.classList.toggle('paused', document.hidden); }
  document.addEventListener('visibilitychange', visibility);
  visibility();

  // What the launch asked for: {"emzee":"inputs"} opens the Inputs sheet. A remapped Input button sends that
  // (luna://com.webos.applicationManager/launch {"id":"com.webos.app.home","params":{"emzee":"inputs"}});
  // ?open=inputs does the same in the preview.
  function asked() {
    var p = {};
    try { p = JSON.parse((window.PalmSystem && window.PalmSystem.launchParams) || '{}') || {}; } catch (e) { /* none */ }
    var m = /[?&]open=(inputs)\b/.exec(location.search);
    return p.emzee || (m && m[1]) || null;
  }

  // the launcher stays running; when webOS brings it back (Home key, or the remapped Input key), wake,
  // close what was open and refresh. With handlesRelaunch, webOS only tells the page; it must bring itself forward.
  document.addEventListener('webOSRelaunch', function (e) {
    try { if (window.PalmSystem && window.PalmSystem.activate) window.PalmSystem.activate(); } catch (err) { /* not on a TV */ }
    EZ.idle.wake();
    if (EZ.arrange.isOpen()) EZ.arrange.close();
    if (EZ.settings.isOpen()) EZ.settings.close();
    EZ.wx.close();
    if (EZ.focus.top() === 'gear') EZ.settings.leaveGear();
    // some firmware puts the params on the event, the rest only on PalmSystem.launchParams
    var want = (e && e.detail && e.detail.emzee) || asked();
    if (want === 'inputs') { if (!EZ.inputs.isOpen()) EZ.inputs.open(); }
    else if (EZ.inputs.isOpen()) EZ.inputs.close();
    EZ.dock.refresh();
    EZ.weather.refresh();
    // back from another app: the TV dropped what it drew for us, so draw All apps and Settings again, unseen
    setTimeout(function () { EZ.arrange.prepare().then(function () { setTimeout(warmUp, 300); }); }, 1500);
  });
})();
