(function () {
  var MENU_KEY_UPLOAD_FILE = 'uploadFile';
  var menuRegistered = false;

  function getCsrfToken() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function insertHtml(editor, textarea, html) {
    try {
      if (editor && typeof editor.restoreSelection === 'function') editor.restoreSelection();
      if (editor && typeof editor.dangerouslyInsertHtml === 'function') {
        editor.dangerouslyInsertHtml(html);
        return;
      }
      if (editor && typeof editor.getHtml === 'function' && typeof editor.setHtml === 'function') {
        editor.setHtml((editor.getHtml() || '') + html);
        return;
      }
    } catch (e) {}
    if (textarea) textarea.value = (textarea.value || '') + html;
  }

  function registerUploadFileMenuOnce() {
    if (menuRegistered) return;
    if (!window.wangEditor || !window.wangEditor.Boot || typeof window.wangEditor.Boot.registerMenu !== 'function') return;

    // Button menu: 点击后选择文件并上传，成功插入下载链接
    function UploadFileMenu() {
      this.title = '上传文件';
      this.tag = 'button';
      this.iconSvg =
        '<svg viewBox="0 0 1024 1024"><path d="M480 928V512H320l192-224 192 224H544v416h-64zM192 832h640v64H192v-64z" /></svg>';
    }
    UploadFileMenu.prototype.getValue = function () { return ''; };
    UploadFileMenu.prototype.isActive = function () { return false; };
    UploadFileMenu.prototype.isDisabled = function () { return false; };
    UploadFileMenu.prototype.exec = function (editor) {
      var cfg = (editor && typeof editor.getConfig === 'function') ? editor.getConfig() : {};
      var menuCfg = (cfg && cfg.MENU_CONF && cfg.MENU_CONF[MENU_KEY_UPLOAD_FILE]) ? cfg.MENU_CONF[MENU_KEY_UPLOAD_FILE] : {};
      var uploadUrl = menuCfg.uploadUrl || '/admin/api/file-material/upload';
      var accept = menuCfg.accept || '.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.pdf,.ppt,.pptx,.txt,.csv';

      var input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.style.top = '-9999px';
      document.body.appendChild(input);

      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        input.value = '';
        input.remove();
        if (!file) return;
        var csrf = getCsrfToken();
        if (!csrf) { alert('请刷新页面后重试'); return; }
        var fd = new FormData();
        fd.append('file', file);
        fd.append('_csrf', csrf);

        fetch(uploadUrl, {
          method: 'POST',
          credentials: 'same-origin',
          body: fd,
          headers: { 'csrf-token': csrf },
        })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (!res || !res.ok || !res.file || !res.file.filePath) {
              alert((res && res.message) || '上传失败');
              return;
            }
            var url = res.file.filePath;
            var name = res.file.fileName || file.name || '下载';
            var linkHtml = '<a href="' + escapeAttr(url) + '" download="' + escapeAttr(name) + '">' + escapeText(name) + '</a> ';
            insertHtml(editor, null, linkHtml);
          })
          .catch(function () { alert('上传失败'); });
      });

      input.click();
    };

    try {
      window.wangEditor.Boot.registerMenu({
        key: MENU_KEY_UPLOAD_FILE,
        factory: function () { return new UploadFileMenu(); },
      });
      menuRegistered = true;
    } catch (e) {}
  }

  function init(opts) {
    registerUploadFileMenuOnce();
    var root = (opts && opts.root) ? opts.root : document;
    var editorSel = opts && opts.editorSelector ? opts.editorSelector : null;
    var toolbarSel = opts && opts.toolbarSelector ? opts.toolbarSelector : null;
    var textareaSel = opts && opts.textareaSelector ? opts.textareaSelector : null;
    var placeholder = (opts && opts.placeholder) ? String(opts.placeholder) : '请输入内容...';
    var uploadUrl = (opts && opts.uploadUrl) ? String(opts.uploadUrl) : '/admin/api/file-material/upload';
    var enableUpload = opts && opts.enableUpload !== false;
    var fileAccept = (opts && opts.fileAccept) ? String(opts.fileAccept) : '.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.pdf,.ppt,.pptx,.txt,.csv';

    if (!root || !window.wangEditor || !editorSel || !toolbarSel || !textareaSel) return null;
    var editorEl = root.querySelector(editorSel);
    var toolbarEl = root.querySelector(toolbarSel);
    var textareaEl = root.querySelector(textareaSel);
    if (!editorEl || !toolbarEl || !textareaEl) return null;
    try {
      toolbarEl.classList.add('admin-richtext-toolbar');
      editorEl.classList.add('admin-richtext-editor');
    } catch (e) {}

    var createEditor = window.wangEditor.createEditor;
    var createToolbar = window.wangEditor.createToolbar;
    if (typeof createEditor !== 'function' || typeof createToolbar !== 'function') return null;

    var csrf = getCsrfToken();
    var editorConfig = {
      placeholder: placeholder,
      onChange: function (ed) { textareaEl.value = ed.getHtml(); },
      MENU_CONF: {},
    };

    if (enableUpload && csrf) {
      var doUpload = function (file, insertFn) {
        var fd = new FormData();
        fd.append('file', file);
        fd.append('_csrf', csrf);
        fetch(uploadUrl, {
          method: 'POST',
          credentials: 'same-origin',
          body: fd,
          headers: { 'csrf-token': csrf },
        })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res && res.ok && res.file && res.file.filePath) {
              insertFn(res.file.filePath, file.name, res.file.filePath);
            }
          });
      };
      editorConfig.MENU_CONF.uploadImage = { customUpload: doUpload };
      editorConfig.MENU_CONF.uploadVideo = { customUpload: doUpload };
    }

    // 自定义菜单：上传文件（插入下载链接）
    editorConfig.MENU_CONF[MENU_KEY_UPLOAD_FILE] = {
      uploadUrl: uploadUrl,
      accept: fileAccept,
    };

    var html = (textareaEl.value || '').trim() || '<p><br></p>';
    var instance = createEditor({ selector: editorSel, html: html, config: editorConfig, mode: 'default' });
    // 把“上传文件”菜单插入到工具栏最前
    try {
      createToolbar({
        editor: instance,
        selector: toolbarSel,
        config: { insertKeys: { index: 0, keys: [MENU_KEY_UPLOAD_FILE] } },
        mode: 'default',
      });
    } catch (e) {
      createToolbar({ editor: instance, selector: toolbarSel, config: {}, mode: 'default' });
    }

    return {
      editor: instance,
      textarea: textareaEl,
      destroy: function () {
        try {
          if (instance && typeof instance.destroy === 'function') instance.destroy();
        } catch (e) {}
      },
      sync: function () {
        try {
          if (instance && typeof instance.getHtml === 'function') textareaEl.value = instance.getHtml();
        } catch (e) {}
      },
      insertFileLink: function (url, name) {
        if (!url) return;
        var n = name || '下载';
        var linkHtml = '<a href="' + escapeAttr(url) + '" download="' + escapeAttr(n) + '">' + escapeText(n) + '</a> ';
        insertHtml(instance, textareaEl, linkHtml);
      },
    };
  }

  window.AdminRichText = {
    init: init,
  };
})();

