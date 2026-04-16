(function () {
  var reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var root = document.querySelector('.g-about-us-lead.about_company_warp.about_company_warp--pending');
  if (root) {
    if (reduced) {
      root.classList.add('is-revealed');
    } else {
      function reveal() {
        root.classList.add('is-revealed');
      }
      if (!window.IntersectionObserver) {
        reveal();
      } else {
        var r = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              if (!e.isIntersecting) return;
              reveal();
              r.unobserve(root);
            });
          },
          { threshold: 0.06 },
        );
        r.observe(root);
      }
    }
  }

  var list = document.querySelector('.g-about-us-lead .about_company_list');
  if (!list) return;

  function formatNum(n, decimals) {
    var s =
      decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function runCount(el) {
    var to = Number(el.getAttribute('data-to'));
    if (!Number.isFinite(to)) return;
    var duration = parseInt(el.getAttribute('data-speed'), 10) || 1200;
    var raw = String(to);
    var decPart = raw.split('.')[1];
    var decimals = decPart !== undefined ? decPart.length : 0;
    var start = performance.now();
    function frame(now) {
      var t = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatNum(to * eased, decimals);
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = formatNum(to, decimals);
    }
    requestAnimationFrame(frame);
  }

  var countersStarted = false;
  function startCounters() {
    if (countersStarted) return;
    countersStarted = true;
    list.querySelectorAll('.item_num.timer').forEach(function (el) {
      el.classList.remove('timer');
      if (reduced) {
        var to = Number(el.getAttribute('data-to'));
        var raw = String(to);
        var decPart = raw.split('.')[1];
        var decimals = decPart !== undefined ? decPart.length : 0;
        el.textContent = Number.isFinite(to) ? formatNum(to, decimals) : el.textContent;
        return;
      }
      runCount(el);
    });
  }

  if (reduced) {
    startCounters();
    return;
  }

  if (!window.IntersectionObserver) {
    startCounters();
    return;
  }

  var o = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        startCounters();
        o.unobserve(list);
      });
    },
    { threshold: 0.25 },
  );
  o.observe(list);
})();
