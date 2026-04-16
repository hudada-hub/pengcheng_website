(function () {
  var root = document.querySelector('.g-about-us-customers.about_customer_warp');
  var track = document.getElementById('about-us-customer-track');
  var wrap = document.getElementById('about-us-customer-swiper');
  var prev = document.getElementById('about-us-customer-prev');
  var next = document.getElementById('about-us-customer-next');

  /* 2 行网格：每列最多 2 个 Logo；columnsVisible = 视口内列数（每列占 2 行） */
  function columnsVisible() {
    var w = window.innerWidth;
    if (w <= 640) return 2;
    if (w <= 950) return 3;
    if (w <= 1280) return 4;
    return 5;
  }

  function slideCount() {
    return track ? track.querySelectorAll('.about_customer_slide').length : 0;
  }

  function columnCount() {
    var n = slideCount();
    return n ? Math.ceil(n / 2) : 0;
  }

  function maxIndex() {
    var cols = columnsVisible();
    var totalCol = columnCount();
    return Math.max(0, totalCol - cols);
  }

  function columnWidth() {
    var cols = columnsVisible();
    if (!wrap || cols < 1) return 0;
    return wrap.clientWidth / cols;
  }

  var index = 0;
  var dragActive = false;
  var dragPointerId = null;
  var dragStartClientX = 0;
  var dragStartOffsetPx = 0;
  var lastPointerX = 0;
  var autoPlayTimer = null;
  var isAutoPlaying = false;
  var AUTO_PLAY_INTERVAL = 4000;

  function autoPlayNext() {
    if (index >= maxIndex()) {
      index = 0;
      go();
      return;
    }
    index = Math.min(maxIndex(), index + 1);
    go();
  }

  function startAutoPlay() {
    if (autoPlayTimer || isAutoPlaying) return;
    isAutoPlaying = true;
    autoPlayTimer = setInterval(autoPlayNext, AUTO_PLAY_INTERVAL);
  }

  function stopAutoPlay() {
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
    isAutoPlaying = false;
  }

  function pauseAutoPlay() {
    stopAutoPlay();
    if (autoPlayTimer) clearInterval(autoPlayTimer);
    autoPlayTimer = null;
    isAutoPlaying = false;
  }

  function resumeAutoPlay() {
    if (!autoPlayTimer && isAutoPlaying) {
      autoPlayTimer = setInterval(autoPlayNext, AUTO_PLAY_INTERVAL);
    }
  }

  function applySizes() {
    if (!track || !wrap) return;
    var cw = columnWidth();
    var totalCol = columnCount();
    track.style.gridAutoColumns = cw + 'px';
    track.style.width = totalCol * cw + 'px';
    var list = track.querySelectorAll('.about_customer_slide');
    for (var i = 0; i < list.length; i++) {
      list[i].style.width = '';
      list[i].style.flexBasis = '';
    }
  }

  function setTrackTransition(enabled) {
    if (!track) return;
    track.style.transition = enabled ? 'transform 0.4s ease' : 'none';
  }

  function clampOffsetPx(off) {
    applySizes();
    var cw = columnWidth();
    var mi = maxIndex();
    var min = -mi * cw;
    var max = 0;
    if (off < min) return min;
    if (off > max) return max;
    return off;
  }

  function go() {
    if (!track || !wrap) return;
    dragActive = false;
    dragPointerId = null;
    if (wrap) wrap.classList.remove('is-dragging');
    applySizes();
    index = Math.min(Math.max(0, index), maxIndex());
    var cw = columnWidth();
    setTrackTransition(true);
    track.style.transform = 'translateX(' + -index * cw + 'px)';
  }

  function endDrag() {
    if (!dragActive || !wrap) return;
    dragActive = false;
    dragPointerId = null;
    wrap.classList.remove('is-dragging');
    var dx = lastPointerX - dragStartClientX;
    var off = clampOffsetPx(dragStartOffsetPx + dx);
    applySizes();
    var cw = columnWidth();
    index = Math.round(-off / (cw || 1));
    index = Math.min(Math.max(0, index), maxIndex());
    go();
  }

  if (wrap && track) {
    wrap.addEventListener('pointerdown', function (e) {
      pauseAutoPlay();
      if (!e.isPrimary) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragActive = true;
      dragPointerId = e.pointerId;
      dragStartClientX = e.clientX;
      lastPointerX = e.clientX;
      applySizes();
      dragStartOffsetPx = -index * columnWidth();
      setTrackTransition(false);
      wrap.classList.add('is-dragging');
      try {
        wrap.setPointerCapture(e.pointerId);
      } catch (err) {}
    });

    wrap.addEventListener(
      'pointermove',
      function (e) {
        if (!dragActive || e.pointerId !== dragPointerId) return;
        lastPointerX = e.clientX;
        var dx = lastPointerX - dragStartClientX;
        var off = clampOffsetPx(dragStartOffsetPx + dx);
        track.style.transform = 'translateX(' + off + 'px)';
        if (e.pointerType === 'touch' && Math.abs(dx) > 6) {
          e.preventDefault();
        }
      },
      { passive: false },
    );

    function onPointerEnd(e) {
      if (!dragActive || e.pointerId !== dragPointerId) return;
      try {
        wrap.releasePointerCapture(e.pointerId);
      } catch (err) {}
      endDrag();
    }
    wrap.addEventListener('pointerup', onPointerEnd);
    wrap.addEventListener('pointercancel', onPointerEnd);
  }

  if (prev) {
    prev.addEventListener('click', function () {
      pauseAutoPlay();
      index = Math.max(0, index - 1);
      go();
    });
  }
  if (next) {
    next.addEventListener('click', function () {
      pauseAutoPlay();
      index = Math.min(maxIndex(), index + 1);
      go();
    });
  }

  window.addEventListener('resize', function () {
    go();
  });

  function initCarousel() {
    if (track && wrap) go();
    if (root) {
      root.addEventListener('mouseenter', function () {
        pauseAutoPlay();
      });
      root.addEventListener('mouseleave', function () {
        if (isAutoPlaying) {
          autoPlayTimer = setInterval(autoPlayNext, AUTO_PLAY_INTERVAL);
        }
      });
    }
  }

  if (!root) {
    initCarousel();
    startAutoPlay();
    return;
  }

  var reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function reveal() {
    root.classList.remove('about_customer_warp--pending');
    root.classList.add('is-revealed');
    initCarousel();
    startAutoPlay();
  }

  if (reduceMotion) {
    initCarousel();
    return;
  }

  if (!window.IntersectionObserver) {
    initCarousel();
    startAutoPlay();
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
    { threshold: 0.1 },
  );

  obs.observe(root);
})();
