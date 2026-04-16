/**
 * 穿梭框：初始化页面上所有 .admin-transfer 组件
 * 左列表为可选，右列表为已选；隐藏域保存已选 id 逗号拼接
 */
(function () {
  function initTransfer(container) {
    if (!container) return;
    var idPrefix = container.getAttribute('data-id-prefix');
    if (!idPrefix) return;
    var inputEl = document.getElementById(idPrefix + 'TransferInput');
    var leftList = document.getElementById(idPrefix + 'TransferLeftList');
    var rightList = document.getElementById(idPrefix + 'TransferRightList');
    var btnRight = document.getElementById(idPrefix + 'TransferBtnRight');
    var btnLeft = document.getElementById(idPrefix + 'TransferBtnLeft');
    if (!inputEl || !leftList || !rightList || !btnRight || !btnLeft) return;

    function getSelectedIds(listEl) {
      var ids = [];
      var items = listEl.querySelectorAll('.admin-transfer-item');
      items.forEach(function (item) {
        var cb = item.querySelector('.admin-transfer-cb');
        if (cb && cb.checked) ids.push(item.getAttribute('data-id'));
      });
      return ids;
    }

    function syncInput() {
      var items = rightList.querySelectorAll('.admin-transfer-item');
      var ids = [];
      items.forEach(function (item) {
        var id = item.getAttribute('data-id');
        if (id) ids.push(id);
      });
      inputEl.value = ids.join(',');
    }

    function ensureEmptyText(listEl, text) {
      var count = listEl.querySelectorAll('.admin-transfer-item').length;
      var empty = listEl.querySelector('.admin-transfer-empty');
      if (count === 0) {
        if (!empty) {
          var el = document.createElement('div');
          el.className = 'admin-transfer-empty';
          el.textContent = text;
          listEl.appendChild(el);
        }
      } else {
        if (empty) empty.remove();
      }
    }

    function moveItems(fromList, toList) {
      var ids = getSelectedIds(fromList);
      if (!ids.length) return;
      var fromItems = fromList.querySelectorAll('.admin-transfer-item');
      fromItems.forEach(function (item) {
        if (ids.indexOf(item.getAttribute('data-id')) !== -1) {
          var cb = item.querySelector('.admin-transfer-cb');
          if (cb) cb.checked = false;
          toList.appendChild(item);
        }
      });
      ensureEmptyText(leftList, '暂无可选');
      ensureEmptyText(rightList, '暂无已选');
      syncInput();
    }

    btnRight.addEventListener('click', function () {
      moveItems(leftList, rightList);
    });
    btnLeft.addEventListener('click', function () {
      moveItems(rightList, leftList);
    });

    ensureEmptyText(leftList, '暂无可选');
    ensureEmptyText(rightList, '暂无已选');
    syncInput();
  }

  function initAll() {
    document.querySelectorAll('.admin-transfer').forEach(initTransfer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  window.AdminTransfer = { init: initTransfer, initAll: initAll };
})();

