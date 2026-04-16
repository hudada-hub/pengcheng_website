(function () {
  var reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.querySelector('.g-about-us-banner.about_sys_warp.about_sys_warp--pending');
  if (!root) return;
  if (reduced) {
    root.classList.add('is-revealed');
    return;
  }
  function reveal() {
    root.classList.add('is-revealed');
  }
  if (!window.IntersectionObserver) {
    reveal();
    return;
  }
  var obs = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        reveal();
        obs.unobserve(root);
      });
    },
    { threshold: 0.12 },
  );
  obs.observe(root);
})();
