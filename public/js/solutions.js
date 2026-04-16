/**
 * Solutions list: mobile category sidebar toggle（与产品列表相同结构）
 */
(function () {
  'use strict';

  var categoryToggleBtn = document.getElementById('categoryToggleBtn');
  var categoryList = document.getElementById('categoryList');

  if (categoryToggleBtn && categoryList) {
    categoryToggleBtn.addEventListener('click', function () {
      var isExpanded = categoryToggleBtn.getAttribute('aria-expanded') === 'true';
      categoryToggleBtn.setAttribute('aria-expanded', !isExpanded);
      categoryList.classList.toggle('is-visible');
    });
  }
})();
