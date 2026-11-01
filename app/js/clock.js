// Clock: 24-hour time and a long date, refreshed on the minute.
(function () {
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function render() {
    var now = new Date();
    var h = now.getHours();
    // 24-hour unless Settings says 12-hour ("6:30", the period as a small suffix in the date line)
    var time = h24 ? EZ.pad(h) + ':' + EZ.pad(now.getMinutes()) : ((h % 12) || 12) + ':' + EZ.pad(now.getMinutes());
    var date = DAYS[now.getDay()] + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()] + (h24 ? '' : ' · ' + (h < 12 ? 'AM' : 'PM'));
    EZ.$$('[data-clock=time]').forEach(function (e) { e.textContent = time; });
    EZ.$$('[data-clock=date]').forEach(function (e) { e.textContent = date; });
    EZ.emit('minute', now);
  }

  function schedule() {
    var now = new Date();
    setTimeout(function () { render(); schedule(); }, (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 20);
  }

  var h24 = true;
  function setFormat(c) { if (c && c.clock24 === false) { if (h24) { h24 = false; render(); } } else if (!h24) { h24 = true; render(); } }

  EZ.clock = {
    start: function () {
      render(); schedule();
      EZ.api.config().then(setFormat);
      EZ.on('config', setFormat);
    },
    render: render
  };
})();
