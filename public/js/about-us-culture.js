(function () {
  var root = document.querySelector('.g-about-us-culture.about_culture_warp');
  if (!root) return;
  var reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    root.classList.remove('about_culture_warp--pending');
    root.classList.add('is-revealed');
    return;
  }

  function show() {
    root.classList.remove('about_culture_warp--pending');
    root.classList.add('is-revealed');
  }

  if (!window.IntersectionObserver) {
    show();
    return;
  }

  var obs = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        show();
        obs.unobserve(root);
      });
    },
    { threshold: 0.12 },
  );

  obs.observe(root);
})();
