/**
 * Products Page Interactions
 */
(function () {
  'use strict';

  // Category Sidebar Toggle (Mobile)
  var categoryToggleBtn = document.getElementById('categoryToggleBtn');
  var categoryList = document.getElementById('categoryList');

  if (categoryToggleBtn && categoryList) {
    categoryToggleBtn.addEventListener('click', function () {
      var isExpanded = categoryToggleBtn.getAttribute('aria-expanded') === 'true';
      categoryToggleBtn.setAttribute('aria-expanded', !isExpanded);
      categoryList.classList.toggle('is-visible');
    });
  }

  // 一级分类手风琴
  document.querySelectorAll('.g-products-sidebar__l1-trigger').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      var next = btn.nextElementSibling;
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      if (next && next.classList.contains('g-products-sidebar__l2')) {
        next.classList.toggle('is-open', !expanded);
      }
    });
  });

  // 分类单选按钮：切换选中即整页跳转（URL 与链接 href 均为切换后的筛选状态，仅支持单选）
  document.querySelectorAll('.g-products-category__checkbox').forEach(function (checkbox) {
    checkbox.addEventListener('change', function () {
      var url = this.getAttribute('data-category-url');
      if (url) window.location.href = url;
    });
  });

  // Animate product cards on scroll
  var observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };

  var productObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry, index) {
      if (entry.isIntersecting) {
        setTimeout(function () {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, index * 100);
        productObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  var productCards = document.querySelectorAll('.g-product-card');
  productCards.forEach(function (card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    productObserver.observe(card);
  });

})();
