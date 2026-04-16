/**
 * Popconfirm：删除等操作前弹出确认框，点击确认才执行
 * 用法：在按钮或链接上加 data-popconfirm="确定删除吗？"，保留原有 href 或 form 提交
 */
(function () {
  function bind() {
    document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== document.body) {
        var msg = el.getAttribute && el.getAttribute('data-popconfirm');
        if (msg) {
          e.preventDefault();
          e.stopPropagation();
          var doSubmit = function () {
            if (el.tagName === 'A' && el.href) {
              window.location.href = el.href;
            } else if (el.tagName === 'BUTTON' && el.type === 'submit') {
              var form = el.closest('form');
              if (form) form.submit();
            } else if (el.form && el.form.tagName === 'FORM') {
              el.form.submit();
            }
          };
          if (window.showConfirmModal) {
            window.showConfirmModal(msg, doSubmit);
          } else {
            if (window.confirm(msg)) doSubmit();
          }
          return;
        }
        el = el.parentNode;
      }
    }, true);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
