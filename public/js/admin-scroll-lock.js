(function () {
  var LOCK_CLASS = 'admin-scroll-locked';
  var lockCount = 0;
  var saved = null;

  function getScrollbarWidth() {
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  }

  function applyLock() {
    if (saved) return;
    var y = window.scrollY || window.pageYOffset || 0;
    var body = document.body;
    if (!body) return;

    saved = {
      scrollY: y,
      paddingRight: body.style.paddingRight || '',
    };

    var sbw = getScrollbarWidth();
    if (sbw) body.style.paddingRight = sbw + 'px';

    body.classList.add(LOCK_CLASS);
  }

  function releaseLock() {
    var body = document.body;
    if (!body) return;
    body.classList.remove(LOCK_CLASS);
    if (saved) {
      body.style.paddingRight = saved.paddingRight;
      window.scrollTo(0, saved.scrollY || 0);
    }
    saved = null;
  }

  function lock() {
    lockCount += 1;
    if (lockCount === 1) applyLock();
  }

  function unlock() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) releaseLock();
  }

  function isOpen(el) {
    if (!el) return false;
    if (el.classList && el.classList.contains('open')) return true;
    var aria = el.getAttribute && el.getAttribute('aria-hidden');
    if (aria === 'false') return true;
    if (el.style && el.style.display && el.style.display !== 'none') return true;
    return false;
  }

  function anyModalOpen() {
    var selectors = [
      '.admin-modal-overlay',
      '.admin-modal',
      '.afm-overlay',
      '.product-params-univer-overlay',
      '.admin-image-preview-overlay',
    ];
    for (var i = 0; i < selectors.length; i += 1) {
      var list = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < list.length; j += 1) {
        if (isOpen(list[j])) return true;
      }
    }
    return false;
  }

  function syncByDomState() {
    var shouldLock = anyModalOpen();
    if (shouldLock && lockCount === 0) lock();
    if (!shouldLock && lockCount > 0) {
      lockCount = 1;
      unlock();
    }
  }

  window.AdminScrollLock = {
    lock: lock,
    unlock: unlock,
    sync: syncByDomState,
  };

  document.addEventListener('DOMContentLoaded', function () {
    syncByDomState();
    var mo = new MutationObserver(function () {
      syncByDomState();
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden'],
      subtree: true,
      childList: true,
    });
  });
})();

