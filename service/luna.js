'use strict';
// luna-send with a hard time limit. Never rejects: failures come back as { returnValue: false, errorText }.
// Pattern from CleanYourTV's helper/luna.js + exec.js: one reply (-n 1), a wait (-w), stdin closed,
// and our own kill timer instead of the child_process timeout option.
const childProcess = require('child_process');

const BIN = process.env.EMZEE_LUNA_SEND || 'luna-send';

function call(uri, payload, wait) {
  wait = wait || 5000;
  return new Promise(function (resolve) {
    let done = false;
    function finish(r) { if (!done) { done = true; clearTimeout(timer); resolve(r); } }
    // uri and payload go in as positional args, never spliced into the script text
    const script = BIN + ' -n 1 -w ' + Math.round(wait) + ' -f "$1" "$2" </dev/null';
    let child;
    try {
      child = childProcess.execFile('/bin/sh', ['-c', script, 'sh', uri, JSON.stringify(payload || {})],
        { maxBuffer: 8 << 20 }, function (err, stdout) {
          if (err && !stdout) return finish({ returnValue: false, errorText: String(err.message || err) });
          try { finish(JSON.parse(stdout)); } catch (e) { finish({ returnValue: false, errorText: 'bad reply: ' + String(stdout).slice(0, 200) }); }
        });
    } catch (e) {
      return finish({ returnValue: false, errorText: String(e.message || e) });
    }
    const timer = setTimeout(function () {
      try { child.kill('SIGKILL'); } catch (e) { /* already gone */ }
      finish({ returnValue: false, errorText: 'timeout' });
    }, wait + 3000);
  });
}

module.exports = { call: call };
