(function () {
  function ensureStyles() {
    if (document.getElementById('adminConfirmModalStyles')) return;
    var style = document.createElement('style');
    style.id = 'adminConfirmModalStyles';
    style.textContent = [
      '.admin-modal{position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;}',
      '.admin-confirm-modal-overlay{position:absolute;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,.5);display:block;}',
      '.admin-modal-content{position:relative;margin:10% auto;width:400px;max-width:90%;background:#fff;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);overflow:hidden;}',
      '.admin-modal-header{padding:16px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;background-color:#f8f9fa;}',
      '.admin-modal-title{margin:0;font-size:16px;font-weight:600;color:#333;}',
      '.admin-modal-close{background:none;border:none;font-size:20px;cursor:pointer;color:#999;padding:0;width:30px;height:30px;display:flex;align-items:center;justify-content:center;}',
      '.admin-modal-close:hover{color:#333;}',
      '.admin-modal-body{padding:24px;}',
      '.admin-modal-actions{margin-top:20px;display:flex;gap:12px;justify-content:flex-end;}',
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureModalDom() {
    if (document.getElementById('confirmModal')) return;
    ensureStyles();
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div id="confirmModal" class="admin-modal" style="display:none;">' +
      '  <div class="admin-confirm-modal-overlay" data-dismiss="confirmModal"></div>' +
      '  <div class="admin-modal-content">' +
      '    <div class="admin-modal-header">' +
      '      <h3 class="admin-modal-title">确认操作</h3>' +
      '      <button class="admin-modal-close" data-dismiss="confirmModal" aria-label="关闭">&times;</button>' +
      '    </div>' +
      '    <div class="admin-modal-body">' +
      '      <p id="confirmMessage">确定要执行此操作吗？</p>' +
      '      <div class="admin-modal-actions">' +
      '        <button id="confirmCancelBtn" class="btn btn-secondary" data-dismiss="confirmModal">取消</button>' +
      '        <button id="confirmOkBtn" class="btn btn-danger">确定</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(wrap.firstChild);
  }

  function hideConfirmModal() {
    var modal = document.getElementById('confirmModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function bindDismiss() {
    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest && e.target.closest('[data-dismiss="confirmModal"]');
      if (!el) return;
      hideConfirmModal();
    }, true);
  }

  function installGlobal() {
    if (window.showConfirmModal) return;
    window.showConfirmModal = function (message, onConfirm, onCancel) {
      ensureModalDom();
      var modal = document.getElementById('confirmModal');
      var messageEl = document.getElementById('confirmMessage');
      var okBtn = document.getElementById('confirmOkBtn');
      var cancelBtn = document.getElementById('confirmCancelBtn');
      if (!modal || !messageEl || !okBtn || !cancelBtn) return;

      messageEl.textContent = message || '确定要执行此操作吗？';

      // 清除之前的事件
      var newOkBtn = okBtn.cloneNode(true);
      okBtn.parentNode.replaceChild(newOkBtn, okBtn);
      var newCancelBtn = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

      var updatedOkBtn = document.getElementById('confirmOkBtn');
      var updatedCancelBtn = document.getElementById('confirmCancelBtn');

      updatedOkBtn.onclick = function () {
        hideConfirmModal();
        if (typeof onConfirm === 'function') onConfirm();
      };
      updatedCancelBtn.onclick = function () {
        hideConfirmModal();
        if (typeof onCancel === 'function') onCancel();
      };

      var overlay = modal.querySelector('.admin-confirm-modal-overlay');
      if (overlay) {
        overlay.onclick = function () {
          hideConfirmModal();
          if (typeof onCancel === 'function') onCancel();
        };
      }

      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
    };
  }

  function boot() {
    installGlobal();
    bindDismiss();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

