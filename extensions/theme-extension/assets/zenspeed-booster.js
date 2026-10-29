/**
 * ZenSpeed Storefront Booster
 * Lightweight (< 2KB), zero-dependency performance script.
 */
(function() {
  'use strict';

  var config = window.ZenSpeedConfig || {
    preloader: true,
    lazyLoading: true,
    deferScripts: false
  };

  var prefetchedUrls = new Set();

  function prefetchUrl(url) {
    if (!url || prefetchedUrls.has(url)) return;
    if (url.indexOf('/cart') !== -1 || url.indexOf('/checkout') !== -1 || url.indexOf('/account') !== -1) return;

    prefetchedUrls.add(url);
    var link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = 'document';
    document.head.appendChild(link);
  }

  function applyLazyLoading() {
    var imgs = document.querySelectorAll('img:not([loading])');
    var iframes = document.querySelectorAll('iframe:not([loading])');

    for (var i = 0; i < imgs.length; i++) {
      var rect = imgs[i].getBoundingClientRect();
      // Only apply lazy loading to elements below the fold (> window.innerHeight)
      if (rect.top > (window.innerHeight || document.documentElement.clientHeight)) {
        imgs[i].setAttribute('loading', 'lazy');
      }
    }

    for (var j = 0; j < iframes.length; j++) {
      var ifRect = iframes[j].getBoundingClientRect();
      if (ifRect.top > (window.innerHeight || document.documentElement.clientHeight)) {
        iframes[j].setAttribute('loading', 'lazy');
      }
    }
  }

  // 1. Instant Page Preloader (Predictive Link Prefetching)
  if (config.preloader && ('fetch' in window || 'IntersectionObserver' in window)) {
    document.addEventListener('mouseover', function(e) {
      var a = e.target.closest('a');
      if (!a || !a.href || a.origin !== window.location.origin) return;
      prefetchUrl(a.href);
    }, { passive: true });

    document.addEventListener('touchstart', function(e) {
      var a = e.target.closest('a');
      if (!a || !a.href || a.origin !== window.location.origin) return;
      prefetchUrl(a.href);
    }, { passive: true });
  }

  // 2. Automated Native Lazy Loading for Off-screen Images & iFrames
  if (config.lazyLoading) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyLazyLoading);
    } else {
      applyLazyLoading();
    }
  }

  // 3. Script Deferral for Non-Critical Scripts
  if (config.deferScripts) {
    window.addEventListener('load', function() {
      // Allow browser to reach idle before loading deferred items
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(function() {
          document.dispatchEvent(new CustomEvent('zenspeed:idle'));
        });
      }
    });
  }
})();
