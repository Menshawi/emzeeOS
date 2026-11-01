'use strict';
// Prints the appinfo.json for the overlay: LG's Home appinfo (keeps its id, trust level and permissions)
// switched to a web app that opens our index.html.
// Usage: node stage-appinfo.js <home-appinfo.orig.json> <emzee appinfo.json>
const fs = require('fs');

const orig = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ours = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

// keys that only make sense for a native, QML or Flutter Home
['executable', 'engine', 'nativeLifeCycleInterfaceVersion', 'enableKeyboard', 'useNativeScroll',
  'usePrerendering', 'splashBackground', 'splashIcon', 'flutter', 'qmlFile'].forEach(function (k) { delete orig[k]; });

const out = Object.assign(orig, {
  id: 'com.webos.app.home',   // must stay LG's id: the system launches Home by it
  type: 'web',
  main: 'index.html',
  icon: ours.icon,
  largeIcon: ours.largeIcon,
  splashBackground: ours.splashBackground,   // shown by webOS while the launcher starts
  bgColor: ours.bgColor,
  resolution: ours.resolution,
  disableBackHistoryAPI: true,
  handlesRelaunch: true,
  transparent: false,
  // On webOS 10/11 the Home key opens the default app of category "home"; without it the key does nothing
  // (Glasshouse Home, a G5 on webOS 10.3.1). LG's own keeps it out of app lists with visible false.
  appCategory: (Array.isArray(orig.appCategory) ? orig.appCategory : []).filter(function (c) { return c !== 'home'; }).concat(['home']),
  visible: orig.visible === undefined ? false : orig.visible,
  emzee: ours.version
});
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
