'use strict';
// com.emzee.home.service: runs the phase 3 scripts as root for users without SSH.
// Homebrew Channel doesn't run ipk install or remove hooks, so the setup app asks it to elevate this
// service (luna://org.webosbrew.hbchannel.service/elevateService), then calls the methods below.
// The scripts and the design are the same as by hand: everything lives in /media/developer/emzee,
// the takeover is a bind mount in RAM, with the 30 s failsafe, the watchdog and the DISABLE flag.
// No method takes arguments; the only commands run are our own scripts.
var fs = require('fs');
var path = require('path');
var child = require('child_process');
var Service = require('webos-service');

var ID = 'com.emzee.home.service';
// the EMZEE_* overrides exist for local testing only; the TV uses the defaults (same names as scripts/common.sh)
var L = process.env.EMZEE_HOME || '/media/developer/emzee';
var H = process.env.EMZEE_STOCK_HOME || '/usr/palm/applications/com.webos.app.home';
var INITD = process.env.EMZEE_INITD || '/var/lib/webosbrew/init.d/50-emzee-home';
var PAYLOAD = path.join(__dirname, 'payload');   // app/, service/, scripts/ as they go in $L
var LOG = '/tmp/emzee-setup.log';
var ENV = { PATH: '/usr/bin:/usr/sbin:/bin:/sbin', HOME: '/home/root' };
Object.keys(process.env).forEach(function (k) { if (/^EMZEE_/.test(k)) ENV[k] = process.env[k]; });
if (process.env.EMZEE_PATH) ENV.PATH = process.env.EMZEE_PATH;

var service = new Service(ID);
var root = (typeof process.getuid === 'function' && process.getuid() === 0) || process.env.EMZEE_TEST_ROOT === '1';

function exists(p) { try { fs.statSync(p); return true; } catch (e) { return false; } }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }

function status() {
  var appinfo = {};
  try { appinfo = JSON.parse(read(path.join(L, 'app/appinfo.json'))); } catch (e) { /* not set up */ }
  return {
    root: root,
    installed: exists(path.join(L, 'scripts/boot.sh')) && exists(INITD),
    disabled: exists(path.join(L, 'DISABLE')),
    mounted: read('/proc/mounts').indexOf(' ' + H + ' ') >= 0,
    version: appinfo.version || null,
    bundled: JSON.parse(read(path.join(PAYLOAD, 'app/appinfo.json')) || '{}').version || null
  };
}

// runs a fixed shell script as root and answers with its output
function run(script, done) {
  child.execFile('/bin/sh', ['-c', script], { env: ENV, timeout: 120000, maxBuffer: 1 << 20 }, function (err, out, errOut) {
    var log = String(out || '') + String(errOut || '');
    fs.appendFile(LOG, log, function () {});
    done(err, log.split('\n').filter(Boolean).slice(-12));
  });
}

// for steps that restart sam or remove this package: they must outlive this process
function detach(script) {
  var fd = fs.openSync(LOG, 'a');
  child.spawn('/bin/sh', ['-c', script], { env: ENV, detached: true, stdio: ['ignore', fd, fd] }).unref();
  fs.closeSync(fd);
}

function guard(msg) {
  if (root) return true;
  msg.respond({ returnValue: false, errorText: 'not root yet: ask Homebrew Channel to elevate ' + ID + ' first', status: status() });
  // the next call starts a fresh process, which picks up the elevated service definition
  setTimeout(function () { process.exit(0); }, 300);
  return false;
}

service.register('status', function (msg) {
  msg.respond({ returnValue: true, status: status() });
  if (!root) setTimeout(function () { process.exit(0); }, 300);
});

// copy the bundled launcher, helper and scripts into $L (keeping data/ and backup/), link the boot hook,
// stage the overlay, then take over Home right away (boot.sh backgrounds itself; the failsafe still applies)
service.register('enable', function (msg) {
  if (!guard(msg)) return;
  var script = [
    'set -e',
    'P="' + PAYLOAD + '"; L="' + L + '"',
    '[ -f "$P/scripts/install.sh" ] || { echo "payload missing"; exit 1; }',
    'mkdir -p "$L"',
    'for d in app service scripts; do rm -rf "$L/$d.new"; cp -R "$P/$d" "$L/$d.new"; rm -rf "$L/$d"; mv "$L/$d.new" "$L/$d"; done',
    // the bundled fireplace video goes into data/ as a hard link (same partition: no second 49 MB), else a copy;
    // it stays there when this package is updated or removed
    'if [ -f "$P/media/fireplace.mp4" ] && ! cmp -s "$P/media/fireplace.mp4" "$L/data/fireplace.mp4" 2>/dev/null; then',
    '  mkdir -p "$L/data"; rm -f "$L/data/fireplace.mp4" "$L/data/fireplace.mp4.part"',
    '  ln "$P/media/fireplace.mp4" "$L/data/fireplace.mp4" 2>/dev/null || cp "$P/media/fireplace.mp4" "$L/data/fireplace.mp4"',
    '  printf \'{"quality":"4K","video":"13270910","bundled":true}\' > "$L/data/fireplace.json"',
    'fi',
    'touch "$L/.via-ipk"',       // lets boot.sh clean up if this package is removed without "Remove emzeeOS"
    'rm -f "$L/DISABLE"',
    'sh "$L/scripts/install.sh"',
    // an update must not leave the old helper running; boot.sh starts the new one.
    // The [e] keeps the pattern from matching this very script (busybox pkill would kill its own shell).
    'pkill -f "[e]mzee/service/service.js" || true'
  ].join('\n');
  run(script, function (err, log) {
    if (err) {
      // a half-done update may have swapped the files under the running Home; give LG's Home back for now
      var s = status();
      if (s.mounted && exists(path.join(L, 'scripts/undo-home.sh'))) detach('sh "' + L + '/scripts/undo-home.sh" temp');
      return msg.respond({ returnValue: false, errorText: 'setup failed' + (s.mounted ? '; LG\'s Home is coming back for now' : ''), log: log, status: s });
    }
    msg.respond({ returnValue: true, log: log, status: status() });
    // puts emzeeOS in Home's place and brings it to the front, which closes the setup app
    setTimeout(function () { detach('sh "' + L + '/scripts/boot.sh" now'); }, 1500);
  });
});

// give LG's Home back now and on later boots (creates DISABLE); "Make emzeeOS my Home" turns it on again
service.register('disable', function (msg) {
  if (!guard(msg)) return;
  if (!exists(path.join(L, 'scripts/undo-home.sh'))) return msg.respond({ returnValue: true, status: status() });
  msg.respond({ returnValue: true, status: status() });
  setTimeout(function () { detach('sh "' + L + '/scripts/undo-home.sh"'); }, 500);
});

// everything goes: LG's Home back, boot hook, /media/developer/emzee, the launcher app and this package
service.register('uninstall', function (msg) {
  if (!guard(msg)) return;
  msg.respond({ returnValue: true });
  var script = exists(path.join(L, 'scripts/uninstall.sh'))
    ? 'sh "' + L + '/scripts/uninstall.sh" -y'
    : 'rm -f "' + INITD + '"; luna-send -n 1 -w 10000 luna://com.webos.appInstallService/dev/remove \'{"id":"com.emzee.home"}\'';
  setTimeout(function () { detach(script); }, 500);
});

// the last lines of each log, for the setup app's log view: what boot.sh did at power-on and how long each step
// took, the helper's errors, and this service's own output. Nothing in them is private.
var LOGS = [['Startup', '/tmp/emzee-boot.log'], ['Helper', '/tmp/emzee-helper.log'], ['Setup', LOG]];
service.register('logs', function (msg) {
  var out = LOGS.map(function (l) {
    var lines = read(l[1]).split('\n').filter(Boolean);
    return { name: l[0], file: l[1], lines: lines.slice(-120) };
  });
  msg.respond({ returnValue: true, logs: out, status: status() });
  if (!root) setTimeout(function () { process.exit(0); }, 300);
});
