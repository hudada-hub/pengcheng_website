/**
 * 关于我们：锚点导航点击平滑滚动 + 滚动时高亮当前节（依赖页面内对应 id 的区块）
 */
(function () {
  var nav = document.querySelector('.g-about-us-anchor');
  if (!nav) return;

  var links = nav.querySelectorAll('a[data-about-anchor]');
  if (!links.length) return;

  // 移动端抽屉导航元素
  var mobileToggle = document.querySelector('.g-about-us-anchor-mobile__toggle');
  var mobileDrawer = document.querySelector('.g-about-us-anchor-mobile__drawer');
  var mobileLinks = document.querySelectorAll('.g-about-us-anchor-mobile__link');

  function getHeaderTop() {
    if (document.body.classList.contains('g-about-us-anchor-stuck')) return 0;
    return window.matchMedia('(max-width: 600px)').matches ? 56 : 72;
  }

  function updateMainHeaderDocked() {
    var header = document.querySelector('.g-about-us-page .pc-nav');
    if (!header) return;
    var headerH = window.matchMedia('(max-width: 600px)').matches ? 56 : 72;
    var rect = nav.getBoundingClientRect();
    var stuck = rect.top <= headerH + 1 && window.scrollY > 8;
    document.body.classList.toggle('g-about-us-anchor-stuck', stuck);
  }

  function setActive(id) {
    // 更新桌面端链接状态
    links.forEach(function (link) {
      var hid = link.getAttribute('data-about-anchor');
      link.classList.toggle('is-active', hid === id);
    });
    
    // 更新移动端链接状态
    mobileLinks.forEach(function (link) {
      var hid = link.getAttribute('data-about-anchor');
      link.classList.toggle('is-active', hid === id);
    });
  }

  var ids = Array.prototype.map.call(links, function (link) {
    return link.getAttribute('data-about-anchor');
  });

  function getScrollOffset() {
    return getHeaderTop() + nav.offsetHeight + 4;
  }

  // 处理桌面端链接点击
  links.forEach(function (link) {
    link.addEventListener('click', function (e) {
      var id = link.getAttribute('data-about-anchor');
      if (!id) return;
      var el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      var y = el.getBoundingClientRect().top + window.scrollY - getScrollOffset();
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      if (history.replaceState) {
        history.replaceState(null, '', '#' + id);
      }
      setActive(id);
      requestAnimationFrame(updateMainHeaderDocked);
    });
  });

  // 处理移动端链接点击
  mobileLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      var id = link.getAttribute('data-about-anchor');
      if (!id) return;
      var el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      
      // 关闭抽屉
      if (mobileToggle) {
        mobileToggle.setAttribute('aria-expanded', 'false');
      }
      if (mobileDrawer) {
        mobileDrawer.classList.remove('active');
      }
      
      // 滚动到对应位置
      var y = el.getBoundingClientRect().top + window.scrollY - 100; // 移动端顶部留一些空间
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      if (history.replaceState) {
        history.replaceState(null, '', '#' + id);
      }
      setActive(id);
    });
  });

  // 处理移动端抽屉开关
  if (mobileToggle && mobileDrawer) {
    mobileToggle.addEventListener('click', function () {
      var isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
      mobileToggle.setAttribute('aria-expanded', !isExpanded);
      mobileDrawer.classList.toggle('active', !isExpanded);
    });
    
    // 点击抽屉外部关闭
    document.addEventListener('click', function (e) {
      if (!mobileToggle.contains(e.target) && !mobileDrawer.contains(e.target)) {
        mobileToggle.setAttribute('aria-expanded', 'false');
        mobileDrawer.classList.remove('active');
      }
    });
  }

  function syncFromHash() {
    var h = (window.location.hash || '').replace(/^#/, '');
    if (h && ids.indexOf(h) !== -1) setActive(h);
  }

  function syncFromScroll() {
    var offset = getScrollOffset() + 24;
    var current = ids[0];
    for (var i = ids.length - 1; i >= 0; i--) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      var top = el.getBoundingClientRect().top;
      if (top <= offset) {
        current = ids[i];
        break;
      }
    }
    setActive(current);
  }

  var ticking = false;
  window.addEventListener(
    'scroll',
    function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        updateMainHeaderDocked();
        syncFromScroll();
      });
    },
    { passive: true },
  );

  window.addEventListener(
    'resize',
    function () {
      updateMainHeaderDocked();
    },
    { passive: true },
  );

  window.addEventListener('hashchange', syncFromHash);

  function scrollToId(id) {
    var el = document.getElementById(id);
    if (!el) {
      setActive(id);
      return;
    }
    var y = el.getBoundingClientRect().top + window.scrollY - getScrollOffset();
    window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
    setActive(id);
    requestAnimationFrame(updateMainHeaderDocked);
  }

  if (window.location.hash) {
    var hid = (window.location.hash || '').replace(/^#/, '');
    if (hid && ids.indexOf(hid) !== -1) {
      requestAnimationFrame(function () {
        scrollToId(hid);
      });
    } else {
      syncFromHash();
    }
  } else {
    syncFromHash();
  }
  updateMainHeaderDocked();
  syncFromScroll();
})();
