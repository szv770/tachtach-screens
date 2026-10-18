// Start-up animation controller, loaded as a blocking script in <head> of the
// kiosk and admin pages (markup: #tt-splash, styles: splash.css).
//
//   <html data-splash="always">   kiosk: every page load (each restart)
//   <html data-splash="session">  admin: once per app launch / tab session
//
// The app calls window.ttSplash.done() once its data has loaded; the splash
// then fades out as soon as the animation has finished playing. Never shown
// inside an iframe or on preview/error pages; ?splash=1 forces it on.
(function () {
  var html = document.documentElement;
  var qs = location.search;
  var force = /[?&]splash=1(&|$)/.test(qs);
  var skip = !force && (window.self !== window.top || /[?&](preview|previewDate)=/.test(qs) || location.pathname === '/error');

  if (!skip && html.getAttribute('data-splash') === 'session') {
    try {
      skip = !force && sessionStorage.getItem('tt-splash-seen') === '1';
      sessionStorage.setItem('tt-splash-seen', '1');
    } catch (e) { /* storage blocked: just show it */ }
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PLAY_MS = reduce ? 1300 : 3200; // length of the animation in splash.css
  var MAX_MS = 12000;                 // never block the app longer than this
  var started = Date.now();
  var hidden = false;

  function splash() { return document.getElementById('tt-splash'); }

  function hide() {
    if (hidden) return;
    hidden = true;
    var el = splash();
    if (!el) return;
    el.classList.add('tt-out');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 500);
  }

  window.ttSplash = {
    done: function () {
      if (skip) return;
      setTimeout(hide, Math.max(0, PLAY_MS - (Date.now() - started)));
    },
  };

  if (skip) {
    html.classList.add('tt-nosplash');
    document.addEventListener('DOMContentLoaded', function () {
      var el = splash();
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    return;
  }

  // Start the animation only once every layer has loaded (or after 1.5 s),
  // so it never plays with pieces missing on a slow phone connection.
  document.addEventListener('DOMContentLoaded', function () {
    var el = splash();
    if (!el) return;
    var imgs = el.querySelectorAll('img');
    var left = imgs.length;
    var playing = false;
    function play() {
      if (playing) return;
      playing = true;
      started = Date.now();
      el.classList.add('tt-play');
    }
    function loaded() { if (--left <= 0) play(); }
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].complete) loaded();
      else { imgs[i].addEventListener('load', loaded); imgs[i].addEventListener('error', loaded); }
    }
    if (!imgs.length) play();
    setTimeout(play, 1500);
  });

  setTimeout(hide, MAX_MS);
})();
