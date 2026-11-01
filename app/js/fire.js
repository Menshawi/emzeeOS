// The fireplace screen saver (Settings > Screen saver > Fireplace): a real 4K video of a wood fire with its own
// crackle, played at the speed set in Settings (0.9x by default, for a calmer burn). The helper downloads the video once
// (service/fireplace.js); until the TV has it, or if it can't play, the screen saver simply shows the sky.
(function () {
  var rate = 0.9;
  var BOOST = 2.5;   // the clip's crackle is quiet (about -32 dB average, peaks -15 dB): +8 dB, still well clear of clipping
  var root, running = false;

  // The boost runs through Web Audio. Its context may only start after a key press, so it's made on the first
  // press, long before any screen saver; if it isn't running when the fire starts, the video plays its sound as is.
  var ctx = null, boosted = false;
  document.addEventListener('keydown', function () {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }, true);
  var gain = null, wired = [];
  function boost(v) {
    if (wired.indexOf(v) >= 0 || !ctx || ctx.state !== 'running') return;
    try {
      if (!gain) { gain = ctx.createGain(); gain.gain.value = BOOST; gain.connect(ctx.destination); }
      ctx.createMediaElementSource(v).connect(gain);
      wired.push(v);
      boosted = true;
    } catch (e) { /* plays unboosted */ }
  }

  // one line in the helper's log on what the sound did, since that can't be seen from here
  function report(how) {
    setTimeout(function () {
      if (!running) return;
      var v = vids[cur];
      EZ.api.note('fireplace: ' + how + ', ' + (v.muted ? 'muted' : 'volume ' + Math.round(v.volume * 100) + '%') +
        (boosted ? ', boosted ' + BOOST + 'x' : ', not boosted (audio ' + (ctx ? ctx.state : 'none') + ')') +
        ', speed ' + v.playbackRate + 'x, ' + (v.videoWidth || '?') + 'x' + (v.videoHeight || '?') +
        (v.webkitAudioDecodedByteCount != null ? ', audio bytes ' + v.webkitAudioDecodedByteCount : '') +
        (crossfade ? ', crossfading loops' : ', plain loop'));
    }, 3000);
  }

  // The loop. A plain <video loop> seeks back to the start and stalls for a moment, so there are two copies of
  // the video: a little before one ends, the other starts from the beginning on top and fades in over it (the
  // crackle crossfades too), then the first is paused and rewound, ready for next time. If the TV can't play the
  // second copy, the first simply loops.
  var FADE = 1.2;   // seconds
  var vids = [], cur = 0, crossfade = true, crossing = false, watchTimer = 0, quietNow = false;
  var cors = true;   // fetched with CORS so Web Audio may boost them; if that fails, they load plainly, unboosted

  function load(v) {
    if (cors) v.crossOrigin = 'anonymous'; else v.removeAttribute('crossorigin');
    v.loop = !crossfade;
    v.preload = 'auto';
    v.src = EZ.api.fireplaceUrl();
    v.onerror = function () { failed(v); };
  }
  function failed(v) {
    if (cors && !boosted) {
      cors = false;
      EZ.api.note('fireplace: the video would not load with CORS, playing it unboosted');
      vids.forEach(function (x) { x.removeAttribute('src'); x.load(); });
      if (running) play(quietNow);
      return;
    }
    if (v !== vids[cur] && crossfade) { single('the second copy would not load'); return; }
    stop();
  }
  // back to one copy, looping by itself
  function single(why) {
    if (!crossfade) return;
    crossfade = false;
    EZ.api.note('fireplace: ' + why + ', looping one copy instead');
    var v = vids[cur], o = vids[1 - cur];
    v.loop = true; v.classList.add('front'); v.style.opacity = 1; v.volume = 1;
    o.pause(); o.style.opacity = 0;
  }

  function watch() {
    clearTimeout(watchTimer);
    if (!running) return;
    var v = vids[cur];
    if (crossfade && !crossing && v.duration && !v.paused) {
      var left = (v.duration - v.currentTime) / (v.playbackRate || 1);
      if (left <= FADE + 0.25) cross();
    }
    watchTimer = setTimeout(watch, 200);
  }

  function cross() {
    var from = vids[cur], to = vids[1 - cur];
    crossing = true;
    to.muted = from.muted;
    to.volume = 0;
    to.defaultPlaybackRate = rate; to.playbackRate = rate;
    // the incoming copy goes on top, invisible, and fades in once it is really playing
    to.style.transition = 'none'; to.style.opacity = 0;
    to.classList.add('front'); from.classList.remove('front');
    var p = to.play();
    (p && p.then ? p : Promise.resolve()).then(function () {
      if (!running) { crossing = false; return; }
      if (!to.muted && cors) boost(to);
      void to.offsetWidth;
      to.style.transition = 'opacity ' + FADE + 's linear';
      to.style.opacity = 1;
      if (!measured) { measured = true; EZ.perf('fireplace crossfade', FADE * 1000); }
      var steps = 12, n = 0;
      (function ramp() {
        if (!running) return;
        n++;
        to.volume = Math.min(1, n / steps); from.volume = Math.max(0, 1 - n / steps);
        if (n < steps) return setTimeout(ramp, FADE * 1000 / steps);
        from.pause(); from.currentTime = 0;   // rewound under the new one, ready for the next loop
        cur = 1 - cur; crossing = false;
      })();
    }, function (e) {
      crossing = false;
      to.classList.remove('front'); from.classList.add('front'); to.style.opacity = 0;
      single('the second copy would not play (' + (e && e.name) + ')');
      // the first copy is near its end: let it carry on round by itself
      if (from.ended) from.play().catch(stop);
    });
  }
  var measured = false;

  // the real fire, with or without its crackle; if it can't play, the sky screen saver stays
  function play(quiet) {
    quietNow = !!quiet;
    vids.forEach(function (v) { if (!v.getAttribute('src')) load(v); v.defaultPlaybackRate = rate; v.playbackRate = rate; v.muted = quietNow; });
    var v = vids[cur];
    v.volume = 1; v.style.transition = 'none'; v.style.opacity = 1; v.classList.add('front');
    vids[1 - cur].classList.remove('front');
    var p = v.play();
    if (p && p.then) p.then(function () {
      if (!quiet && cors) vids.forEach(boost);
      report(quiet ? 'silent style' : 'playing with sound');
    }, function (e) {
      if (e && e.name === 'AbortError') return;   // the source changed under it (the CORS fallback above)
      // sound not allowed to start on its own: play silently rather than not at all
      report('sound blocked by the TV (' + (e && e.name) + ')');
      quietNow = true;
      vids.forEach(function (x) { x.muted = true; });
      v.play().catch(stop);
    });
    watch();
    document.body.classList.add('fire');
    root.classList.add('on');
    // a sample of how smoothly it plays, for the helper's log
    setTimeout(function () { if (running) EZ.perf('fireplace video', 2000); }, 4000);
  }

  function stop() {
    if (!running) return;
    running = false;
    clearTimeout(watchTimer);
    crossing = false;
    document.body.classList.remove('fire');
    root.classList.remove('on');
    // the crackle fades out with the picture instead of cutting off
    var steps = 12;
    (function fade() {
      if (running) return;
      vids.forEach(function (v) { v.volume = Math.max(0, v.volume - 0.09); });
      if (--steps > 0) return setTimeout(fade, 100);
      vids.forEach(function (v, i) { v.pause(); if (i !== cur) v.currentTime = 0; });
    })();
  }

  // a new speed from Settings applies straight away, even while the fire is playing
  function setRate(c) {
    rate = Math.min(1, Math.max(0.5, Number(c.fireSpeed) || 0.9));
    vids.forEach(function (v) { v.defaultPlaybackRate = rate; v.playbackRate = rate; });
  }
  EZ.on('config', setRate);

  EZ.fire = {
    // saver: 'fire' (with sound) or 'fire-quiet'
    // resolves true once the fire is showing, false when the sky screen saver should stay
    start: function (saver) {
      if (running) return Promise.resolve(true);
      if (!root) {
        root = EZ.$('#fire');
        var a = EZ.$('#fire-video'), b = a.cloneNode(false);
        b.id = 'fire-video-2';
        root.appendChild(b);
        vids = [a, b];
      }
      running = true;
      return Promise.all([EZ.api.fireplace(), EZ.api.config()]).then(function (r) {
        var s = r[0];
        setRate(r[1]);
        if (!running) return false;
        if (s.state === 'ready') { play(saver === 'fire-quiet'); return true; }
        // not on the TV yet: the sky shows meanwhile, and the video is fetched for next time
        running = false;
        if (s.state !== 'downloading') EZ.api.fireplaceStart();
        return false;
      });
    },
    stop: stop,
    isOn: function () { return running; }
  };
})();
