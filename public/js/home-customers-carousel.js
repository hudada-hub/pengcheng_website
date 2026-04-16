/**
 * 首页 Our Customers：2 行 CSS Grid + 按列 translateX + 拖拽；末尾克隆一份实现无缝循环。
 */
(function () {
  var root = document.querySelector('.g-customers');
  var track = document.getElementById('home-customers-track');
  var wrap = document.getElementById('home-customers-swiper');
  var prev = document.getElementById('home-customers-prev');
  var next = document.getElementById('home-customers-next');

  /* 每屏列数：大屏 7 列；窄屏逐级减少 */
  function columnsVisible() {
    var w = window.innerWidth;
    if (w <= 640) return 2;
    if (w <= 900) return 3;
    if (w <= 1100) return 4;
    if (w <= 1200) return 5;
    return 7;
  }

  function loopReady() {
    return !!(track && track.dataset.loopReady === '1');
  }

  function origColCount() {
    if (!track) return 0;
    return parseInt(track.dataset.loopOrigCols || '0', 10) || 0;
  }

  function slideCount() {
    return track ? track.querySelectorAll('.g-customers__slide').length : 0;
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

  /** 克隆一份幻灯片，grid 列数翻倍，用于 translateX 无缝回绕 */
  function ensureLoopClones() {
    if (!track || track.dataset.loopReady === '1') return;
    var slides = track.querySelectorAll('.g-customers__slide');
    var n = slides.length;
    if (n < 2) return;
    var origCols = Math.ceil(n / 2);
    var arr = Array.prototype.slice.call(slides);
    for (var i = 0; i < arr.length; i++) {
      track.appendChild(arr[i].cloneNode(true));
    }
    track.dataset.loopOrigCols = String(origCols);
    track.dataset.loopReady = '1';
  }

  /** 自动轮播：向右滚动 */
  function autoPlayNext() {
    if (loopReady() && index >= maxIndex()) {
      index = 0;
      jumpTransform();
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
    var list = track.querySelectorAll('.g-customers__slide');
    for (var i = 0; i < list.length; i++) {
      list[i].style.width = '';
      list[i].style.flexBasis = '';
    }
  }

  function setTrackTransition(enabled) {
    if (!track) return;
    track.style.transition = enabled ? 'transform 0.4s ease' : 'none';
  }

  function jumpTransform() {
    applySizes();
    var cw = columnWidth();
    setTrackTransition(false);
    track.style.transform = 'translateX(' + -index * cw + 'px)';
    requestAnimationFrame(function () {
      setTrackTransition(true);
    });
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
    wrap.classList.remove('is-dragging');
    applySizes();
    index = Math.min(Math.max(0, index), maxIndex());
    var cw = columnWidth();
    setTrackTransition(true);
    track.style.transform = 'translateX(' + -index * cw + 'px)';
  }

  function onTrackTransitionEnd(e) {
    if (!track || e.target !== track) return;
    if (e.propertyName !== 'transform') return;
    var oc = origColCount();
    if (!loopReady() || oc < 1) return;
    if (index >= oc) {
      setTrackTransition(false);
      index -= oc;
      applySizes();
      var cw = columnWidth();
      track.style.transform = 'translateX(' + -index * cw + 'px)';
      requestAnimationFrame(function () {
        setTrackTransition(true);
      });
    }
  }

  /** 拖拽开始：停止自动轮播 */
  function onDragStart() {
    pauseAutoPlay();
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
    if (loopReady()) {
      var oc = origColCount();
      if (oc > 0 && index >= oc) index -= oc;
    }
    go();
  }

  if (track) {
    track.addEventListener('transitionend', onTrackTransitionEnd);
  }

  if (wrap && track) {
    wrap.addEventListener('pointerdown', function (e) {
      onDragStart();
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
      if (loopReady() && index <= 0) {
        index = maxIndex();
        jumpTransform();
        return;
      }
      index = Math.max(0, index - 1);
      go();
    });
  }
  if (next) {
    next.addEventListener('click', function () {
      pauseAutoPlay();
      if (loopReady() && index >= maxIndex()) {
        index = 0;
        jumpTransform();
        return;
      }
      index = Math.min(maxIndex(), index + 1);
      go();
    });
  }

  window.addEventListener('resize', function () {
    go();
  });

  function initCarousel() {
    if (!track || !wrap) return;
    ensureLoopClones();
    go();
    startAutoPlay();
    if (root) {
      root.addEventListener('mouseenter', function () {
        pauseAutoPlay();
      });
      root.addEventListener('mouseleave', function () {
        startAutoPlay();
      });
    }
  }

  if (!track || !wrap) {
    return;
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
        initCarousel();
        startAutoPlay();
        obs.unobserve(root);
      });
    },
    { threshold: 0.08 },
  );

  obs.observe(root);
})();
