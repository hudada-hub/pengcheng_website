(function () {
  var reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.querySelector('.g-about-us-who.about_company_warp.about_company_warp--pending');
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
})();
