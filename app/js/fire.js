// The fireplace screen saver (Settings > Screen saver > Fireplace): a real 4K video of a wood fire with its own
// crackle, played at the speed set in Settings (0.9x by default, for a calmer burn). The helper downloads the video once
// (service/fireplace.js); until the TV has it, or if it can't play, the screen saver simply shows the sky.
(function () {
  var rate = 0.9;
  var BOOST = 2.5;   // the clip's crackle is quiet (about -32 dB average, peaks -15 dB): +8 dB, still well clear of clipping
  var root, video, running = false;

  // The boost runs through Web Audio. Its context may only start after a key press, so it's made on the first
  // press, long before any screen saver; if it isn't running when the fire starts, the video plays its sound as is.
  var ctx = null, boosted = false, gain = null;
  document.addEventListener('keydown', function () {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }, true);
  function boost() {
    if (boosted || !ctx || ctx.state !== 'running') return;
    try {
      gain = ctx.createGain();
      gain.gain.value = BOOST;
      gain.connect(ctx.destination);
      ctx.createMediaElementSource(video).connect(gain);
      boosted = true;
    } catch (e) { /* plays unboosted */ }
  }

  // one line in the helper's log on how it plays, since that can't be seen from here
  function report(how) {
    setTimeout(function () {
      if (!running) return;
      EZ.api.note('fireplace: ' + how + ', ' + (video.muted ? 'muted' : 'volume ' + Math.round(video.volume * 100) + '%') +
        (boosted ? ', boosted ' + BOOST + 'x' : ', not boosted (audio ' + (ctx ? ctx.state : 'none') + ')') +
        ', speed ' + video.playbackRate + 'x, ' + (video.videoWidth || '?') + 'x' + (video.videoHeight || '?') +
        (video.webkitAudioDecodedByteCount != null ? ', audio bytes ' + video.webkitAudioDecodedByteCount : '') +
        ', ' + (mse ? 'seamless loop' : 'plain loop' + (why ? ' (' + why + ')' : '')));
    }, 3000);
  }

  // ---- the loop ----
  // A plain <video loop> seeks back to the start and stalls at the loop point, and the TV can't decode a second 4K
  // copy to crossfade over it (that showed black). So the video is fed through Media Source Extensions: the helper
  // serves the clip as fragmented MP4 (service/fmp4.js), and the same clip is appended again and again, each copy
  // starting exactly where the last one ends, into one video element and one decoder: one continuous stream.
  // Copies already played are removed, so at most about two are held. If anything fails, the plain loop takes over.
  var AHEAD = 8;   // seconds of fire left in the buffer when the next copy is fetched
  var mse = null, why = '', loopTimer = 0;   // mse: { ms, sb, info, next, busy }

  function get(url, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', url);
    x.responseType = 'arraybuffer';
    x.timeout = 30000;
    x.onload = function () { if (x.status === 200) cb(null, x.response); else cb(new Error('helper ' + x.status)); };
    x.onerror = x.ontimeout = function () { cb(new Error('helper unreachable')); };
    x.send();
  }

  function plain(reason) {
    why = reason || why;
    if (mse) { try { URL.revokeObjectURL(video.src); } catch (e) { /* gone */ } }
    mse = null;
    clearTimeout(loopTimer);
    EZ.api.note('fireplace: plain loop, ' + why);
    video.loop = true;
    video.src = EZ.api.fireplaceUrl();
    if (running) video.play().catch(stop);
  }

  // starts the stream; false when this TV can't, and the plain file plays instead
  function seamless(info) {
    if (!info || !window.MediaSource || !MediaSource.isTypeSupported(info.mime)) { why = info ? 'no MSE for ' + info.mime : 'no loop info'; return false; }
    var ms = new MediaSource();
    mse = { ms: ms, sb: null, info: info, next: 0, busy: true };
    video.loop = false;
    video.src = URL.createObjectURL(ms);
    ms.addEventListener('sourceopen', function () {
      var m = mse;
      if (!m || m.ms !== ms) return;
      try { m.sb = ms.addSourceBuffer(info.mime); m.sb.mode = 'segments'; } catch (e) { return plain('addSourceBuffer: ' + e.name); }
      get(EZ.api.fireplaceUrl() + '/init.mp4', function (err, data) {
        if (err) return plain('init: ' + err.message);
        append(m, data, function (e2) {
          if (e2) return plain('init: ' + e2);
          m.busy = false;
          feed();
        });
      });
    });
    return true;
  }

  // appendBuffer, waiting for it to finish
  function append(m, data, cb) {
    var sb = m.sb;
    function end() { sb.removeEventListener('updateend', end); sb.removeEventListener('error', fail); cb(null); }
    function fail() { sb.removeEventListener('updateend', end); sb.removeEventListener('error', fail); cb('append failed'); }
    sb.addEventListener('updateend', end);
    sb.addEventListener('error', fail);
    try { sb.appendBuffer(data); } catch (e) { fail(); cb = function () {}; return e.name; }
  }
  function remove(m, to, cb) {
    var sb = m.sb, b = sb.buffered;
    if (!b.length || to - b.start(0) < 1) return cb();
    function end() { sb.removeEventListener('updateend', end); cb(); }
    sb.addEventListener('updateend', end);
    try { sb.remove(b.start(0), to); } catch (e) { sb.removeEventListener('updateend', end); cb(); }
  }

  // keeps the stream topped up: the next copy goes in while about AHEAD seconds of the current one remain
  function feed() {
    clearTimeout(loopTimer);
    var m = mse;
    if (!m || !running) return;
    loopTimer = setTimeout(feed, 500);
    if (m.busy || !m.sb) return;
    var b = m.sb.buffered, end = b.length ? b.end(b.length - 1) : 0;
    if (m.next > 0 && end - video.currentTime > AHEAD) return;
    m.busy = true;
    var n = m.next;
    get(EZ.api.fireplaceUrl() + '/loop.m4s', function (err, data) {
      if (mse !== m) return;
      if (err) { m.busy = false; return n === 0 ? plain('first copy: ' + err.message) : null; }   // later copies retry
      // what has played goes first, so the buffer never holds more than about two copies
      remove(m, video.currentTime - 2, function () {
        if (mse !== m) return;
        m.sb.timestampOffset = n * m.info.duration;
        append(m, data, function (e) {
          if (mse !== m) return;
          if (e) return plain('copy ' + n + ': ' + e);
          m.next = n + 1;
          m.busy = false;
          if (n === 0 && m.sb.buffered.length) video.currentTime = m.sb.buffered.start(0);
          if (n === 1) EZ.perf('fireplace loop point', 2500);   // measured around the first join, for the log
        });
      });
    });
  }

  // the real fire, with or without its crackle; if it can't play, the sky screen saver stays
  function play(quiet, info) {
    if (!video.getAttribute('src') && !seamless(info)) { video.loop = true; video.src = EZ.api.fireplaceUrl(); }
    video.muted = !!quiet;
    video.volume = 1;
    video.defaultPlaybackRate = rate; video.playbackRate = rate;
    video.onerror = function () { if (mse) plain('video error ' + (video.error && video.error.code)); else stop(); };
    var p = video.play();
    if (p && p.then) p.then(function () {
      if (!quiet) boost();
      report(quiet ? 'silent style' : 'playing with sound');
    }, function (e) {
      if (e && e.name === 'AbortError') return;   // the source changed under it (the plain fallback)
      // sound not allowed to start on its own: play silently rather than not at all
      report('sound blocked by the TV (' + (e && e.name) + ')');
      video.muted = true;
      video.play().catch(stop);
    });
    if (mse) feed();
    document.body.classList.add('fire');
    root.classList.add('on');
    // a sample of how smoothly it plays, for the helper's log
    setTimeout(function () { if (running) EZ.perf('fireplace video', 2000); }, 4000);
  }

  function stop() {
    if (!running) return;
    running = false;
    clearTimeout(loopTimer);
    document.body.classList.remove('fire');
    root.classList.remove('on');
    if (!video.paused) {
      // the crackle fades out with the picture instead of cutting off
      var steps = 12;
      (function fade() { if (running) return; video.volume = Math.max(0, video.volume - 0.09); if (--steps > 0) setTimeout(fade, 100); else video.pause(); })();
    }
  }

  // a new speed from Settings applies straight away, even while the fire is playing
  function setRate(c) {
    rate = Math.min(1, Math.max(0.5, Number(c.fireSpeed) || 0.9));
    if (video) { video.defaultPlaybackRate = rate; video.playbackRate = rate; }
  }
  EZ.on('config', setRate);

  EZ.fire = {
    // saver: 'fire' (with sound) or 'fire-quiet'
    // resolves true once the fire is showing, false when the sky screen saver should stay
    start: function (saver) {
      if (running) return Promise.resolve(true);
      root = root || EZ.$('#fire'); video = video || EZ.$('#fire-video');
      running = true;
      return Promise.all([EZ.api.fireplace(), EZ.api.config()]).then(function (r) {
        var s = r[0];
        setRate(r[1]);
        if (!running) return false;
        if (s.state === 'ready') { play(saver === 'fire-quiet', s.loop); return true; }
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
