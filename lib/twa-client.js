(function (C) {
  'use strict';
  var w = window;
  var d = document;
  var de = d.documentElement;
  var standalone = function () {
    return w.matchMedia('(display-mode: standalone)').matches || w.matchMedia('(display-mode: fullscreen)').matches;
  };
  var inApp = false;
  try {
    inApp = w.sessionStorage.getItem('twa') === '1' || /^android-app:\/\//.test(d.referrer) || standalone();
    if (inApp) w.sessionStorage.setItem('twa', '1');
  } catch (e) {
    inApp = standalone();
  }
  if (!inApp) return;
  de.setAttribute('data-twa', '1');
  var P = C.pullToRefresh;
  var desktopUa = function () {
    var uad = navigator.userAgentData;
    return uad ? !uad.mobile : !/Mobi/i.test(navigator.userAgent);
  };
  var content = function () {
    return C.mobileOnly && desktopUa() && screen.width < 900 ? C.viewport.replace(/width\s*=\s*device-width/i, 'width=' + screen.width) : C.viewport;
  };
  var apply = function () {
    var c = content();
    d.querySelectorAll('meta[name="viewport"]').forEach(function (m) {
      if (m.getAttribute('content') !== c) m.setAttribute('content', c);
    });
  };
  if (!d.querySelector('meta[name="viewport"]')) {
    var meta = d.createElement('meta');
    meta.name = 'viewport';
    d.head.appendChild(meta);
  }
  apply();
  new MutationObserver(apply).observe(d.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
  w.addEventListener('resize', apply);
  w.addEventListener('orientationchange', apply);
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
    d.addEventListener(t, function (e) { e.preventDefault(); });
  });
  d.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1 && e.cancelable) e.preventDefault();
  }, { passive: false });
  var style = d.createElement('style');
  style.textContent =
    'html{touch-action:pan-x pan-y;-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}' +
    (P.enabled ? 'html,body{overscroll-behavior-y:contain}' : '') +
    '#twa-ptr{position:fixed;left:50%;top:env(safe-area-inset-top,0px);width:40px;height:40px;margin-left:-20px;border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:2147483647;pointer-events:none;opacity:0;transform:translateY(-60px);box-shadow:0 2px 8px rgba(0,0,0,.25)}' +
    '#twa-ptr svg{width:22px;height:22px}' +
    '#twa-ptr.twa-spin svg{animation:twa-spin .8s linear infinite}' +
    '@keyframes twa-spin{to{transform:rotate(360deg)}}';
  d.head.appendChild(style);
  if (!P.enabled) return;
  var dark = function () {
    var attr = de.getAttribute('data-theme');
    return de.classList.contains('dark') || attr === 'dark' || (!de.classList.contains('light') && attr !== 'light' && w.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  var isHex = function (v) { return /^#[0-9a-f]{6}$/i.test(v || ''); };
  var colors = function () {
    var dk = dark();
    var tag = d.querySelector('meta[name="theme-color"]:not([media])') || d.querySelector('meta[name="theme-color"][media*="' + (dk ? 'dark' : 'light') + '"]');
    var accent = tag && isHex(tag.content) ? tag.content : (dk ? P.accentDark : P.accent);
    var r = parseInt(accent.slice(1, 3), 16);
    var g = parseInt(accent.slice(3, 5), 16);
    var b = parseInt(accent.slice(5, 7), 16);
    return { accent: accent, fg: (r * 299 + g * 587 + b * 114) / 1000 > 149 ? '#000' : '#fff' };
  };
  var boot = function () {
    var el = d.createElement('div');
    el.id = 'twa-ptr';
    el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="56.5" stroke-dashoffset="56.5"/></svg>';
    d.body.appendChild(el);
    var svg = el.firstChild;
    var ring = svg.firstChild;
    var startY = 0;
    var pull = 0;
    var active = false;
    var busy = false;
    var scrolled = function (n) {
      for (; n && n !== d.body && n !== de; n = n.parentElement) if (n.scrollTop > 0) return true;
      return (d.scrollingElement || de).scrollTop > 0;
    };
    var place = function (p) {
      el.style.opacity = Math.min(1, p * 1.5);
      el.style.transform = 'translateY(' + (Math.min(p, 1.3) * 70 - 60) + 'px)';
      svg.style.transform = 'rotate(' + p * 270 + 'deg)';
      ring.style.strokeDashoffset = 56.5 * (1 - Math.min(p, 1));
    };
    d.addEventListener('touchstart', function (e) {
      if (busy || e.touches.length !== 1 || scrolled(e.target)) return;
      var c = colors();
      el.style.background = c.accent;
      el.style.color = c.fg;
      el.style.transition = 'none';
      startY = e.touches[0].clientY;
      pull = 0;
      active = true;
    }, { passive: true });
    d.addEventListener('touchmove', function (e) {
      if (!active) return;
      var dy = (e.touches[0].clientY - startY) * 0.5;
      if (dy <= 0) {
        active = false;
        place(0);
        return;
      }
      pull = dy;
      if (e.cancelable) e.preventDefault();
      place(dy / P.threshold);
    }, { passive: false });
    d.addEventListener('touchend', function () {
      if (!active) return;
      active = false;
      el.style.transition = 'transform .2s,opacity .2s';
      if (pull >= P.threshold) {
        busy = true;
        el.style.opacity = 1;
        el.style.transform = 'translateY(20px)';
        el.classList.add('twa-spin');
        w.location.reload();
      } else {
        el.style.opacity = 0;
        el.style.transform = 'translateY(-60px)';
      }
    }, { passive: true });
  };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.__TWA_CONFIG__);
