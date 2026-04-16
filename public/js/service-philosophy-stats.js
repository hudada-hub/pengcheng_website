/**
 * 服务页「服务宗旨」统计：数字滚动（GSAP + ScrollTrigger），进入视口一次触发
 * 仅驱动 .g-service-philosophy__value-num，后缀（+、GWh 等）保留在 DOM 中不动
 */
(function () {
  function prefersReducedMotion() {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function formatInt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function parseStatText(raw) {
    var s = (raw || '').trim();
    if (!s) return { type: 'raw', text: s };

    var mRatio = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
    if (mRatio) {
      return { type: 'ratio', a: parseInt(mRatio[1], 10), b: parseInt(mRatio[2], 10) };
    }

    var mRange = /^(\d+)\s*-\s*(\d+)(.*)$/.exec(s);
    if (mRange) {
      return {
        type: 'range',
        lo: parseInt(mRange[1], 10),
        hi: parseInt(mRange[2], 10),
        suffix: (mRange[3] || '').trim(),
      };
    }

    var mNum = /^([\d,]+)([\s\S]*)$/.exec(s);
    if (mNum) {
      var n = parseInt(mNum[1].replace(/,/g, ''), 10);
      if (!isNaN(n) && isFinite(n)) {
        return { type: 'single', value: n, suffix: mNum[2] || '' };
      }
    }

    return { type: 'raw', text: s };
  }

  function animateEl(el, spec, gsap, index) {
    if (spec.type === 'raw') {
      el.textContent = spec.text;
      return null;
    }

    var delay = index * 0.08;
    var duration = 1.65;
    var ease = 'power2.out';

    if (spec.type === 'single') {
      var proxy = { n: 0 };
      return gsap.to(proxy, {
        n: spec.value,
        duration: duration,
        delay: delay,
        ease: ease,
        onUpdate: function () {
          el.textContent = formatInt(proxy.n);
        },
      });
    }

    if (spec.type === 'ratio') {
      var pr = { a: 0, b: 0 };
      return gsap.to(pr, {
        a: spec.a,
        b: spec.b,
        duration: duration,
        delay: delay,
        ease: ease,
        onUpdate: function () {
          el.textContent = formatInt(pr.a) + '/' + formatInt(pr.b);
        },
      });
    }

    if (spec.type === 'range') {
      var pg = { lo: 0, hi: 0 };
      return gsap.to(pg, {
        lo: spec.lo,
        hi: spec.hi,
        duration: duration,
        delay: delay,
        ease: ease,
        onUpdate: function () {
          el.textContent = formatInt(pg.lo) + '-' + formatInt(pg.hi) + spec.suffix;
        },
      });
    }

    return null;
  }

  function run(section, gsap, ScrollTrigger) {
    var nodes = section.querySelectorAll('.g-service-philosophy__value-num');
    if (!nodes.length) return;

    if (prefersReducedMotion()) {
      return;
    }

    var completed = false;
    function play() {
      if (completed) return;
      completed = true;
      nodes.forEach(function (el, i) {
        var raw = el.getAttribute('data-stats-target') || el.textContent || '';
        var spec = parseStatText(raw);
        if (spec.type !== 'raw' && spec.type !== undefined) {
          if (spec.type === 'single') el.textContent = formatInt(0);
          else if (spec.type === 'ratio') el.textContent = '0/0';
          else if (spec.type === 'range') el.textContent = '0-0' + spec.suffix;
        }
        animateEl(el, spec, gsap, i);
      });
    }

    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.create({
      trigger: section,
      start: 'top 88%',
      once: true,
      onEnter: play,
    });

    requestAnimationFrame(function () {
      var r = section.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92 && r.bottom > 0) {
        play();
      }
    });
  }

  function init() {
    if (typeof gsap === 'undefined') return;
    var ScrollTrigger = window.ScrollTrigger;
    if (!ScrollTrigger) return;

    var section = document.querySelector('.g-service-philosophy');
    if (!section) return;

    run(section, gsap, ScrollTrigger);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
