/**
 * 区块管理 - 内容编辑器：按 type 显隐字段，isArray 时支持新增/删除项，提交前序列化为 content JSON
 */
(function () {
  var TYPE_KEYS = {
    1: ['content'],
    2: ['pic1Url'],
    3: ['pic1Url', 'title'],
    4: ['pic1Url', 'url'],
    5: ['title', 'content', 'pic1Url'],
    6: ['pic1Url', 'title', 'url'],
    7: ['pic1Url', 'pic2Url', 'title', 'url'],
    8: ['title', 'content', 'description', 'pic1Url', 'pic2Url', 'pic3Url', 'pic4Url'],
    9: ['pic1Url', 'pic2Url', 'title'],
    10: ['title', 'description'],
    11: ['title', 'description', 'pic1Url', 'url'],
    12: ['bigTitle', 'title', 'description', 'subtitle', 'subDescription', 'pic1Url'],
    13: ['content'],
  };

  function getType(form) {
    var sel = form.querySelector('select[name="type"]');
    return sel ? parseInt(sel.value, 10) || 1 : 1;
  }

  function getIsArray(form) {
    var sel = form.querySelector('select[name="isArray"]');
    return sel ? parseInt(sel.value, 10) === 1 : false;
  }

  function getEditor(form) {
    return form.querySelector('#content-editor');
  }

  function getContentTextarea(form) {
    return form.querySelector('textarea[name="content"]');
  }

  function applyTypeVisibility(editor, type) {
    if (!editor) return;
    var keys = TYPE_KEYS[type] || TYPE_KEYS[1];
    var fields = editor.querySelectorAll('.content-field');
    fields.forEach(function (f) {
      var key = f.getAttribute('data-content-key');
      var showField = keys.indexOf(key) >= 0;
      if (!showField) {
        f.style.display = 'none';
        return;
      }
      f.style.display = '';
      if (key === 'content') {
        var wrap = f.querySelector('.config-content-rich-wrap');
        var ta = f.querySelector('textarea.content-input[data-key="content"]');
        if (wrap && ta) {
          if (type === 13) {
            wrap.style.display = '';
            ta.style.display = 'none';
          } else {
            wrap.style.display = 'none';
            ta.style.display = '';
          }
        }
      }
    });
  }

  function destroyConfigRichEditors(form) {
    if (!form || !form._configRichTextInstances) return;
    form._configRichTextInstances.forEach(function (x) {
      try {
        if (x && typeof x.destroy === 'function') x.destroy();
      } catch (e) {}
    });
    form._configRichTextInstances = [];
  }

  function initConfigRichEditors(form) {
    if (!form) return;
    destroyConfigRichEditors(form);
    if (getType(form) !== 13) return;
    if (!window.AdminRichText || typeof window.AdminRichText.init !== 'function') return;
    var editor = getEditor(form);
    if (!editor) return;
    form._configRichTextInstances = [];
    editor.querySelectorAll('.config-content-item').forEach(function (item) {
      var wrap = item.querySelector('.config-content-rich-wrap');
      var tb = item.querySelector('.config-rich-toolbar');
      var ed = item.querySelector('.config-rich-editor');
      var ta = item.querySelector('textarea.content-input[data-key="content"]');
      if (!wrap || !tb || !ed || !ta) return;
      if (wrap.style.display === 'none') return;
      var inst = window.AdminRichText.init({
        root: item,
        editorSelector: '.config-rich-editor',
        toolbarSelector: '.config-rich-toolbar',
        textareaSelector: 'textarea.content-input[data-key="content"]',
        placeholder: '请输入富文本内容...',
      });
      if (inst) form._configRichTextInstances.push(inst);
    });
  }

  function toggleArrayUI(form) {
    var editor = getEditor(form);
    var isArray = getIsArray(form);
    var addBtn = form.querySelector('.config-content-add-btn');
    var items = editor ? editor.querySelectorAll('.config-content-item') : [];
    if (addBtn) addBtn.style.display = isArray ? '' : 'none';
    items.forEach(function (item, i) {
      var header = item.querySelector('.config-content-item-header');
      if (header) header.style.display = isArray && i > 0 ? '' : 'none';
      var removeBtn = item.querySelector('.config-content-item-remove');
      if (removeBtn) removeBtn.style.display = isArray && items.length > 1 ? '' : 'none';
    });
  }

  function collectItems(editor) {
    var items = (editor && editor.querySelectorAll('.config-content-item')) || [];
    var result = [];
    var keys = ['bigTitle', 'title', 'description', 'subtitle', 'subDescription', 'url', 'pic1Url', 'pic2Url', 'content'];
    items.forEach(function (item) {
      var obj = {};
      keys.forEach(function (k) {
        var el = item.querySelector('.content-input[data-key="' + k + '"]');
        obj[k] = el ? (el.value || '').trim() : '';
      });
      result.push(obj);
    });
    return result;
  }

  function syncToTextarea(form) {
    var editor = getEditor(form);
    var textarea = getContentTextarea(form);
    if (!textarea) return;
    var items = collectItems(editor);
    var isArray = getIsArray(form);
    var payload = isArray ? items : (items[0] || {});
    textarea.value = JSON.stringify(payload);
  }

  function itemTemplate() {
    var html = '<div class="config-content-item" data-item-index="-1">';
    html += '<div class="form-group content-field" data-content-key="bigTitle"><label>大标题</label><input type="text" class="content-input" data-key="bigTitle" value="" placeholder="大标题"></div>';
    html += '<div class="form-group content-field" data-content-key="title"><label>标题</label><input type="text" class="content-input" data-key="title" value="" placeholder="标题"></div>';
    html += '<div class="form-group content-field" data-content-key="description"><label>描述</label><textarea class="content-input" data-key="description" rows="2" placeholder="描述"></textarea></div>';
    html += '<div class="form-group content-field" data-content-key="subtitle"><label>小标题</label><input type="text" class="content-input" data-key="subtitle" value="" placeholder="小标题"></div>';
    html += '<div class="form-group content-field" data-content-key="subDescription"><label>小描述</label><textarea class="content-input" data-key="subDescription" rows="2" placeholder="小描述"></textarea></div>';
    html += '<div class="form-group content-field" data-content-key="url"><label>链接</label><input type="text" class="content-input" data-key="url" value="" placeholder="链接地址"></div>';
    html += '<div class="form-group content-field" data-content-key="pic1Url"><label>图片1</label><div class="admin-input-row"><input type="text" class="content-input content-pic" data-key="pic1Url" value="" placeholder="选择图片"><button type="button" class="btn btn-pick-pic" data-key="pic1Url"><iconify-icon icon="mdi:image-search-outline"></iconify-icon> 选择</button><span class="admin-input-preview content-pic-preview" data-key="pic1Url"></span></div></div>';
    html += '<div class="form-group content-field" data-content-key="pic2Url"><label>图片2</label><div class="admin-input-row"><input type="text" class="content-input content-pic" data-key="pic2Url" value="" placeholder="选择图片"><button type="button" class="btn btn-pick-pic" data-key="pic2Url"><iconify-icon icon="mdi:image-search-outline"></iconify-icon> 选择</button><span class="admin-input-preview content-pic-preview" data-key="pic2Url"></span></div></div>';
    html += '<div class="form-group content-field" data-content-key="content"><label>内容</label><div class="config-content-rich-wrap" style="display:none;"><div class="config-rich-toolbar"></div><div class="config-rich-editor" style="min-height:280px;"></div></div><textarea class="content-input" data-key="content" rows="3" placeholder="内容"></textarea></div>';
    html += '</div>';
    return html;
  }

  function bindForm(form) {
    if (!form) return;
    var editor = getEditor(form);
    var typeSel = form.querySelector('select[name="type"]');
    var isArraySel = form.querySelector('select[name="isArray"]');
    var addBtn = form.querySelector('.config-content-add-btn');

    function updateVisibility() {
      destroyConfigRichEditors(form);
      applyTypeVisibility(editor, getType(form));
      toggleArrayUI(form);
      initConfigRichEditors(form);
    }

    if (typeSel) typeSel.addEventListener('change', updateVisibility);
    if (isArraySel) isArraySel.addEventListener('change', updateVisibility);

    if (addBtn && editor) {
      addBtn.addEventListener('click', function () {
        var container = editor.querySelector('.config-content-items');
        if (!container) return;
        var div = document.createElement('div');
        div.innerHTML = itemTemplate();
        var newItem = div.firstElementChild;
        var idx = container.querySelectorAll('.config-content-item').length;
        newItem.setAttribute('data-item-index', String(idx));
        var header = '<div class="config-content-item-header"><span>第 ' + (idx + 1) + ' 项</span> <button type="button" class="btn btn-sm config-content-item-remove">删除</button></div>';
        newItem.insertAdjacentHTML('afterbegin', header);
        container.appendChild(newItem);
        bindPickPicInItem(newItem, form);
        bindRemoveInItem(newItem, form, editor);
        updateVisibility();
      });
    }

    editor.addEventListener('click', function (e) {
      var removeBtn = e.target && e.target.closest('.config-content-item-remove');
      if (removeBtn) {
        var item = removeBtn.closest('.config-content-item');
        if (item && editor.querySelectorAll('.config-content-item').length > 1) {
          item.remove();
          toggleArrayUI(form);
          initConfigRichEditors(form);
        }
      }
    });

    form.addEventListener('submit', function () {
      var arr = form._configRichTextInstances || [];
      arr.forEach(function (x) {
        if (x && typeof x.sync === 'function') x.sync();
      });
      syncToTextarea(form);
    });

    updateVisibility();
    if (editor) {
      editor.querySelectorAll('.config-content-item').forEach(function (item) {
        bindPickPicInItem(item, form);
      });
    }
  }

  function bindPickPicInItem(item, form) {
    if (!item || !window.AdminFileManager || !window.AdminFileManager.open) return;
    item.querySelectorAll('.btn-pick-pic').forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.getAttribute('data-key');
        var input = item.querySelector('.content-input.content-pic[data-key="' + key + '"]');
        var preview = item.querySelector('.content-pic-preview[data-key="' + key + '"]');
        window.AdminFileManager.open({
          targetInput: input,
          targetPreview: preview
        });
      };
    });
  }

  function bindRemoveInItem(item, form, editor) {
    var btn = item.querySelector('.config-content-item-remove');
    if (btn) btn.onclick = function () {
      if (editor.querySelectorAll('.config-content-item').length > 1) {
        item.remove();
        toggleArrayUI(form);
        initConfigRichEditors(form);
      }
    };
  }

  function init() {
    var form = document.querySelector('form[action="/admin/config/save"]');
    if (form) {
      bindForm(form);
      var editor = getEditor(form);
      if (editor) editor.querySelectorAll('.config-content-item').forEach(function (item) {
        bindPickPicInItem(item, form);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ConfigContentEditor = {
    applyTypeVisibility: applyTypeVisibility,
    toggleArrayUI: toggleArrayUI,
    bindForm: bindForm,
    syncToTextarea: syncToTextarea,
    destroyRichEditors: destroyConfigRichEditors,
    initRichEditors: initConfigRichEditors,
  };
})();
