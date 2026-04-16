/**
 * 首页 Key metrics：数字滚动（GSAP + ScrollTrigger）
 * 支持：90,000+、3GWh+、24/7、20years+、12-1000V、50000+ 等由 {{title}} 传入的文案格式
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

  function parseStatText(raw, suffixFromAttr) {
    var s = (raw || '').trim();
    if (!s) return { type: 'raw', text: s, suffix: suffixFromAttr || '' };

    var mRatio = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
    if (mRatio) {
      return { type: 'ratio', a: parseInt(mRatio[1], 10), b: parseInt(mRatio[2], 10), suffix: suffixFromAttr || '' };
    }

    var mRange = /^(\d+)\s*-\s*(\d+)(.*)$/.exec(s);
    if (mRange) {
      return {
        type: 'range',
        lo: parseInt(mRange[1], 10),
        hi: parseInt(mRange[2], 10),
        suffix: (mRange[3] || '').trim() || suffixFromAttr || '',
      };
    }

    var mNum = /^([\d,]+)([\s\S]*)$/.exec(s);
    if (mNum) {
      var n = parseInt(mNum[1].replace(/,/g, ''), 10);
      if (!isNaN(n) && isFinite(n)) {
        return { type: 'single', value: n, suffix: mNum[2]?.trim() || suffixFromAttr || '' };
      }
    }

    return { type: 'raw', text: s, suffix: suffixFromAttr || '' };
  }

  function animateEl(el, spec, gsap, index) {
    if (spec.type === 'raw') {
      var suffix = spec.suffix || '';
      if (suffix) {
        el.innerHTML = spec.text + '<sup>' + suffix + '</sup>';
      } else {
        el.textContent = spec.text;
      }
      return null;
    }

    var delay = index * 0.08;
    var duration = 1.65;
    var ease = 'power2.out';
    var suffix = spec.suffix || '';

    if (spec.type === 'single') {
      var proxy = { n: 0 };
      return gsap.to(proxy, {
        n: spec.value,
        duration: duration,
        delay: delay,
        ease: ease,
        onUpdate: function () {
          if (suffix) {
            el.innerHTML = formatInt(proxy.n) + '<sup>' + suffix + '</sup>';
          } else {
            el.textContent = formatInt(proxy.n);
          }
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
          if (suffix) {
            el.innerHTML = formatInt(pr.a) + '/' + formatInt(pr.b) + '<sup>' + suffix + '</sup>';
          } else {
            el.textContent = formatInt(pr.a) + '/' + formatInt(pr.b);
          }
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
          if (suffix) {
            el.innerHTML = formatInt(pg.lo) + '-' + formatInt(pg.hi) + '<sup>' + suffix + '</sup>';
          } else {
            el.textContent = formatInt(pg.lo) + '-' + formatInt(pg.hi);
          }
        },
      });
    }

    return null;
  }

  function run(section, gsap, ScrollTrigger) {
    var nodes = section.querySelectorAll('.g-stats__value > .g-stats__value-num');
    if (!nodes.length) return;

    if (prefersReducedMotion()) {
      return;
    }

    var completed = false;
    function play() {
      if (completed) return;
      completed = true;
      nodes.forEach(function (el, i) {
        var raw = el.getAttribute('data-value') || el.getAttribute('data-stats-target') || el.textContent || '';
        var suffixFromAttr = el.getAttribute('data-suffix') || '';
        var spec = parseStatText(raw, suffixFromAttr);
        if (spec.type !== 'raw' && spec.type !== undefined) {
          if (spec.type === 'single') {
            if (spec.suffix) {
              el.innerHTML = formatInt(0) + '<sup>' + spec.suffix + '</sup>';
            } else {
              el.textContent = formatInt(0);
            }
          } else if (spec.type === 'ratio') {
            if (spec.suffix) {
              el.innerHTML = '0/0' + '<sup>' + spec.suffix + '</sup>';
            } else {
              el.textContent = '0/0';
            }
          } else if (spec.type === 'range') {
            if (spec.suffix) {
              el.innerHTML = '0-0' + '<sup>' + spec.suffix + '</sup>';
            } else {
              el.textContent = '0-0';
            }
          }
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

    // 首屏已在可视区内时立即播放
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

    var section = document.querySelector('.g-stats');
    if (!section) return;

    run(section, gsap, ScrollTrigger);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
