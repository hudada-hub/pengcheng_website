/**
 * 产品详情：Swiper 图库（主图 + 缩略图联动）、主图外侧箭头、点击全屏灯箱
 *
 * 幻灯片数量以 DOM 为准（与模板 {{#each mainPics}} 一致），不依赖 #g-pd-main-pics-json：
 * 若 JSON 含非法序列或 URL 中出现 </script> 导致内联脚本被截断，parse 会得到空数组，
 * 但页面上仍有幻灯片与箭头，此前会因 !pics.length 提前 return 导致箭头无任何绑定。
 */
(function () {
  'use strict';

  var galleryRoot = document.getElementById('productDetailGallery');
  var lightbox = document.getElementById('productDetailLightbox');
  var mainSwiperEl = document.getElementById('productDetailMainSwiper');

  if (!galleryRoot || !mainSwiperEl) {
    return;
  }

  var slides = mainSwiperEl.querySelectorAll('.swiper-wrapper .swiper-slide');
  var count = slides.length;
  if (!count) {
    return;
  }

  if (typeof Swiper === 'undefined') {
    console.warn('[product-detail] Swiper 未加载，图库无法切换');
    return;
  }
  var mainSwiper = null;
  var lbMainSwiper = null;
  var lbThumbsSwiper = null;
  var lightboxInitialized = false;

  /** 缩略图不用 loop：与主图 loop 搭配仍按 realIndex 联动；避免复制 slide 撑满一行导致靠左无法居中 */
  function getThumbsOptions() {
    return {
      slidesPerView: 'auto',
      spaceBetween: 0,
      watchSlidesProgress: true,
      slideToClickedSlide: true,
      centeredSlides: true,
      centeredSlidesBounds: true,
      centerInsufficientSlides: true,
      loop: false,
    };
  }

  /** loop 模式下用真实下标跳转，避免 duplicate slide 索引错位 */
  function slideSwiperToReal(swiper, realIndex, speed) {
    if (!swiper) return;
    var sp = typeof speed === 'number' ? speed : 0;
    if (swiper.params && swiper.params.loop) {
      swiper.slideToLoop(realIndex, sp);
    } else {
      swiper.slideTo(realIndex, sp);
    }
  }

  function getSwiperRealIndex(swiper) {
    if (!swiper) return 0;
    return typeof swiper.realIndex === 'number' ? swiper.realIndex : swiper.activeIndex;
  }

  /**
   * Swiper 11 在部分环境下 navigation + thumbs 组合不绑定箭头，改为显式 slidePrev/slideNext（无 autoplay）
   */
  function bindNavClicks(swiper, prevId, nextId) {
    if (!swiper) return;
    var prev = document.getElementById(prevId);
    var next = document.getElementById(nextId);
    if (prev) {
      prev.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        swiper.slidePrev();
      });
    }
    if (next) {
      next.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        swiper.slideNext();
      });
    }
  }

  try {
    if (count > 1) {
      var thumbsEl = document.getElementById('productDetailThumbsSwiper');
      if (!thumbsEl) {
        console.warn('[product-detail] 多图但缺少缩略图容器，仅初始化主图 Swiper');
        mainSwiper = new Swiper('#productDetailMainSwiper', {
          speed: 400,
          loop: true,
        });
      } else {
        var thumbsSwiper = new Swiper('#productDetailThumbsSwiper', getThumbsOptions());
        mainSwiper = new Swiper('#productDetailMainSwiper', {
          speed: 400,
          loop: true,
          thumbs: {
            swiper: thumbsSwiper,
          },
        });
      }
      bindNavClicks(mainSwiper, 'productDetailGalleryPrev', 'productDetailGalleryNext');
    } else {
      mainSwiper = new Swiper('#productDetailMainSwiper', {
        speed: 400,
        loop: false,
      });
    }
  } catch (err) {
    console.error('[product-detail] Swiper 初始化失败', err);
    return;
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.setAttribute('hidden', '');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('g-pd-lightbox-open');
    if (lbMainSwiper && mainSwiper) {
      slideSwiperToReal(mainSwiper, getSwiperRealIndex(lbMainSwiper), 0);
    }
  }

  function initLightboxSwipers() {
    if (lightboxInitialized) return;
    var lbMainEl = document.getElementById('productDetailLightboxSwiper');
    if (!lbMainEl) return;

    if (count > 1) {
      lbThumbsSwiper = new Swiper('#productDetailLightboxThumbsSwiper', getThumbsOptions());
      lbMainSwiper = new Swiper('#productDetailLightboxSwiper', {
        speed: 400,
        loop: true,
        thumbs: {
          swiper: lbThumbsSwiper,
        },
      });
      bindNavClicks(lbMainSwiper, 'productDetailLightboxPrev', 'productDetailLightboxNext');
    } else {
      lbMainSwiper = new Swiper('#productDetailLightboxSwiper', {
        speed: 400,
        loop: false,
      });
    }
    lightboxInitialized = true;
  }

  function openLightbox(index) {
    if (!lightbox) return;
    initLightboxSwipers();
    lightbox.removeAttribute('hidden');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('g-pd-lightbox-open');
    if (lbMainSwiper) {
      slideSwiperToReal(lbMainSwiper, index, 0);
    }
    var closeBtn = document.getElementById('productDetailLightboxClose');
    if (closeBtn) {
      closeBtn.focus();
    }
  }

  galleryRoot.addEventListener('click', function (e) {
    var trigger = e.target.closest('.g-pd-gallery__zoom-trigger');
    if (!trigger) return;
    e.preventDefault();
    var idx = mainSwiper ? getSwiperRealIndex(mainSwiper) : 0;
    openLightbox(idx);
  });

  if (lightbox) {
    var backdrop = document.getElementById('productDetailLightboxBackdrop');
    var closeBtn = document.getElementById('productDetailLightboxClose');
    if (backdrop) backdrop.addEventListener('click', closeLightbox);
    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !lightbox.hasAttribute('hidden')) {
        closeLightbox();
      }
    });
  }

  // 产品特点 Tab 切换
  (function () {
    var tabGrid = document.querySelector('.g-pd-info__feature-tab-grid');
    if (!tabGrid) return;

    var tabs = tabGrid.querySelectorAll('.g-pd-info__feature-tab');
    var panels = document.querySelectorAll('.g-pd-info__panel[data-panel-index]');

    if (!tabs.length || !panels.length) return;

    function switchTab(index) {
      // 移除所有 tab 的活跃状态
      tabs.forEach(function (tab) {
        tab.classList.remove('is-active');
      });
      // 移除所有 panel 的活跃状态
      panels.forEach(function (panel) {
        panel.classList.remove('is-active');
      });
      // 添加当前 tab 和 panel 的活跃状态
      if (tabs[index]) {
        tabs[index].classList.add('is-active');
      }
      if (panels[index]) {
        panels[index].classList.add('is-active');
      }
    }

    // 为每个 tab 添加点击事件
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        switchTab(index);
      });
    });

    // 默认激活第一个 tab
    switchTab(0);
  })();
})();
