(function (C) {
  'use strict';
  var w = window;
  var d = document;
  var de = d.documentElement;
  var standalone = function () {
    return ['standalone', 'fullscreen', 'minimal-ui'].some(function (m) { return w.matchMedia('(display-mode: ' + m + ')').matches; });
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
  var B = C.progressBar;
  var U = C.ui;
  var T = C.colors;
  var desktopUa = function () {
    var uad = navigator.userAgentData;
    return uad ? !uad.mobile : !/Mobi/i.test(navigator.userAgent);
  };
  var content = function () {
    return C.mobileOnly && desktopUa() && Math.min(screen.width, screen.height) < 900 ? C.viewport.replace(/width\s*=\s*device-width/i, 'width=' + screen.width) : C.viewport;
  };
  var dark = function () {
    var attr = de.getAttribute('data-theme');
    return de.classList.contains('dark') || attr === 'dark' || (!de.classList.contains('light') && attr !== 'light' && w.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  var hex = function (v) { return /^#[0-9a-f]{6}$/i.test(v || ''); };
  var pick = function (l, dk) { return dark() ? dk : l; };
  var fgOn = function (c) {
    var r = parseInt(c.slice(1, 3), 16);
    var g = parseInt(c.slice(3, 5), 16);
    var b = parseInt(c.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 149 ? '#000' : '#fff';
  };
  var accent = function () {
    var dk = dark();
    var own = (w.getComputedStyle(de).getPropertyValue('--accent') || '').trim();
    if (hex(own)) return own;
    var tag = d.querySelector('meta[name="theme-color"]:not([media])') || d.querySelector('meta[name="theme-color"][media*="' + (dk ? 'dark' : 'light') + '"]');
    return tag && hex(tag.content) ? tag.content : pick(T.accent, T.accentDark);
  };
  var theme = function () {
    var a = accent();
    var s = de.style;
    s.setProperty('--twa-accent', a);
    s.setProperty('--twa-fg', fgOn(a));
    s.setProperty('--twa-bar', pick(B.color, B.colorDark) || a);
    s.setProperty('--twa-scheme', dark() ? 'dark' : 'light');
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
  theme();
  new MutationObserver(function () { apply(); theme(); }).observe(d.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
  new MutationObserver(theme).observe(de, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  w.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
  w.addEventListener('resize', apply);
  w.addEventListener('orientationchange', apply);
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
    d.addEventListener(t, function (e) { e.preventDefault(); });
  });
  d.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1 && e.cancelable) e.preventDefault();
  }, { passive: false });
  d.addEventListener('wheel', function (e) {
    if (e.ctrlKey && e.cancelable) e.preventDefault();
  }, { passive: false });
  d.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && /^[-+=0]$/.test(e.key)) e.preventDefault();
  });
  if (U.lockContextMenu) d.addEventListener('contextmenu', function (e) {
    if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && !e.target.isContentEditable) e.preventDefault();
  });
  var style = d.createElement('style');
  style.textContent =
    'html{touch-action:pan-x pan-y;-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}' +
    ':root{--twa-safe-top:env(safe-area-inset-top,0px);--twa-safe-right:env(safe-area-inset-right,0px);--twa-safe-bottom:env(safe-area-inset-bottom,0px);--twa-safe-left:env(safe-area-inset-left,0px)}' +
    (U.safeArea === 'pad' ? 'html{padding:var(--twa-safe-top) var(--twa-safe-right) var(--twa-safe-bottom) var(--twa-safe-left)}' : '') +
    (U.lockSelection ? ':where(body){-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}:where(input,textarea,[contenteditable]){-webkit-user-select:text;user-select:text}' : '') +
    (U.nativeTheme ?
      ':where(html){accent-color:var(--twa-accent);color-scheme:var(--twa-scheme)}' +
      ':where(*){scrollbar-width:thin;scrollbar-color:var(--twa-accent) transparent;-webkit-tap-highlight-color:transparent}' +
      '::selection{background:var(--twa-accent);color:var(--twa-fg)}' +
      ':where(:focus-visible){outline:2px solid var(--twa-accent);outline-offset:2px}' +
      ':where(progress){-webkit-appearance:none;appearance:none;height:6px;border:0;border-radius:999px;overflow:hidden;color:var(--twa-accent);background:color-mix(in srgb,var(--twa-accent) 20%,transparent)}' +
      'progress::-webkit-progress-bar{background:transparent}' +
      'progress::-webkit-progress-value{background:var(--twa-accent);border-radius:999px}' +
      'progress::-moz-progress-bar{background:var(--twa-accent);border-radius:999px}' +
      ':where(input:-webkit-autofill){-webkit-text-fill-color:inherit;transition:background-color 5000s ease-in-out 0s}' : '') +
    (B.enabled ? '#twa-bar{position:fixed;left:0;top:env(safe-area-inset-top,0px);width:100%;height:' + B.height + 'px;background:var(--twa-bar);transform-origin:left;transform:scaleX(0);opacity:0;z-index:2147483647;pointer-events:none;transition:transform .25s ease,opacity .25s ease}' : '');
  d.head.appendChild(style);
  if (B.enabled) {
    var bar = d.createElement('div');
    bar.id = 'twa-bar';
    de.appendChild(bar);
    var pending = 0;
    var prog = 0;
    var timer = 0;
    var guard = 0;
    var paint = function (v, o) {
      bar.style.transform = 'scaleX(' + v + ')';
      bar.style.opacity = o;
    };
    var start = function () {
      if (pending++) return;
      clearInterval(timer);
      bar.style.transition = 'none';
      paint(0, 0);
      void bar.offsetWidth;
      bar.style.transition = '';
      prog = 0.08;
      paint(prog, 1);
      timer = setInterval(function () {
        prog += (0.92 - prog) * 0.08;
        paint(prog, 1);
      }, 200);
    };
    var done = function () {
      if (pending > 0) pending--;
      if (pending) return;
      clearInterval(timer);
      paint(1, 1);
      setTimeout(function () { if (!pending) paint(1, 0); }, 220);
    };
    var reset = function () {
      pending = 0;
      clearInterval(timer);
      clearTimeout(guard);
      paint(0, 0);
    };
    var nav = function () {
      start();
      clearTimeout(guard);
      guard = setTimeout(reset, 8000);
    };
    var track = function (p) {
      var begun = false;
      var t = setTimeout(function () { begun = true; start(); }, 250);
      var fin = function () {
        clearTimeout(t);
        if (begun) done();
      };
      p.then(fin, fin);
      return p;
    };
    if (d.readyState !== 'complete') {
      start();
      w.addEventListener('load', done);
    }
    w.addEventListener('beforeunload', nav);
    w.addEventListener('pageshow', function (e) { if (e.persisted) reset(); });
    d.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.button || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank' || a.hasAttribute('download') || a.origin !== w.location.origin || (a.pathname === w.location.pathname && a.search === w.location.search)) return;
      setTimeout(function () { if (!e.defaultPrevented) nav(); }, 0);
    });
    if (w.fetch) {
      var nativeFetch = w.fetch;
      w.fetch = function () { return track(nativeFetch.apply(this, arguments)); };
    }
    var nativeSend = w.XMLHttpRequest.prototype.send;
    w.XMLHttpRequest.prototype.send = function () {
      var begun = false;
      var t = setTimeout(function () { begun = true; start(); }, 250);
      this.addEventListener('loadend', function () {
        clearTimeout(t);
        if (begun) done();
      });
      return nativeSend.apply(this, arguments);
    };
  }
  var ownPtr = function () {
    var ob = function (n) { return w.getComputedStyle(n).overscrollBehaviorY || 'auto'; };
    return !!w.__TWA_PTR_OFF__ || !!d.querySelector('meta[name="twa-ptr"][content="off"],[data-ptr],[data-pull-to-refresh],[class*="pull-to-refresh" i],[id*="pull-to-refresh" i],[class*="pulltorefresh" i],.ptr-element') || ob(de) !== 'auto' || ob(d.body) !== 'auto';
  };
  var boot = function () {
    theme();
    if (!(P.enabled === true || (P.enabled === 'auto' && !ownPtr()))) return;
    var ps = d.createElement('style');
    ps.textContent =
      'html,body{overscroll-behavior-y:none}' +
      '#twa-ptr{position:fixed;left:50%;top:env(safe-area-inset-top,0px);width:40px;height:40px;margin-left:-20px;box-sizing:border-box;border:2px solid transparent;border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:2147483647;pointer-events:none;opacity:0;transform:translateY(-60px);box-shadow:0 2px 8px rgba(0,0,0,.25)}' +
      '#twa-ptr svg{width:22px;height:22px}' +
      '#twa-ptr.twa-spin svg{animation:twa-spin .8s linear infinite}' +
      '@keyframes twa-spin{to{transform:rotate(360deg)}}';
    d.head.appendChild(ps);
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
      if (busy || e.touches.length !== 1 || scrolled(e.target) || (e.target.closest && e.target.closest('[data-no-ptr],[role="dialog"],dialog'))) return;
      var bg = pick(P.background, P.backgroundDark);
      el.style.background = bg;
      el.style.borderColor = pick(P.border, P.borderDark);
      el.style.color = pick(P.ring, P.ringDark) || fgOn(bg);
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
