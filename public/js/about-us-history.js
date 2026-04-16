(function () {
  var root = document.querySelector('.g-about-us-history');
  if (!root) return;
  var el = root.querySelector('.about_history_swiper');
  var main = root.querySelector('.about_history_main');
  var prev = main && main.querySelector('.swiper_prev');
  var next = main && main.querySelector('.swiper_next');
  if (!el || !prev || !next || typeof Swiper === 'undefined') return;

  var reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  new Swiper(el, {
    slidesPerView: 1,
    slidesPerGroup: 1,
    spaceBetween: 10,
    speed: reduceMotion ? 0 : 1000,
    observer: true,
    observeParents: true,
    observeSlideChildren: true,
    watchOverflow: true,
    navigation: {
      nextEl: next,
      prevEl: prev,
      disabledClass: 'swiper-button-disabled',
    },
    breakpoints: {
      951: {
        slidesPerView: 5,
        slidesPerGroup: 2,
      },
    },
  });
})();
