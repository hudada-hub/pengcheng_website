(function () {
  // Add CSS for dimensions display
  var style = document.createElement('style');
  style.textContent = '.afm-thumb { position: relative; } .afm-thumb-dim { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.6); color: #fff; font-size: 10px; padding: 2px 4px; border-radius: 3px; pointer-events: none; }';
  document.head.appendChild(style);

  function qs(id) { return document.getElementById(id); }
  function getCsrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function isImage(file) {
    var t = (file.fileType || '').toLowerCase();
    if (t.indexOf('image/') === 0) return true;
    var p = (file.filePath || '').toLowerCase();
    return /\.(png|jpe?g|gif|webp|svg)$/.test(p);
  }

  var state = {
    open: false,
    categoryId: '',
    keyword: '',
    page: 1,
    pageSize: 12,
    total: 0,
    type: '',
    targetInput: null,
    targetPreview: null,
    callback: null,
    selectedIds: [],
    categories: [],
  };

  function openModal(opts) {
    state.targetInput = opts && opts.targetInput ? opts.targetInput : null;
    state.targetPreview = opts && opts.targetPreview ? opts.targetPreview : null;
    state.callback = opts && opts.callback ? opts.callback : null;
    state.type = (opts && opts.type) ? String(opts.type).toLowerCase() : '';
    state.categoryId = '';
    state.keyword = '';
    state.page = 1;
    state.selectedIds = [];
    qs('afmKeyword').value = '';
    var uploadInput = qs('afmUploadInput');
    if (uploadInput) {
      if (state.type === 'image') uploadInput.setAttribute('accept', 'image/*');
      else if (state.type === 'video') uploadInput.setAttribute('accept', 'video/*');
      else uploadInput.setAttribute('accept', '');
    }
    qs('afmOverlay').classList.add('open');
    qs('afmOverlay').setAttribute('aria-hidden', 'false');
    state.open = true;
    loadCategories().then(loadFiles);
    updateMoveButton();
  }

  function closeModal() {
    qs('afmOverlay').classList.remove('open');
    qs('afmOverlay').setAttribute('aria-hidden', 'true');
    state.open = false;
    hideContextMenu();
  }

  var contextMenuTarget = null;
  var contextMenuEl = null;

  function showContextMenu(x, y, item) {
    hideContextMenu();
    contextMenuTarget = item;
    if (!contextMenuEl) {
      contextMenuEl = document.createElement('div');
      contextMenuEl.className = 'afm-context-menu';
      contextMenuEl.setAttribute('role', 'menu');
      contextMenuEl.innerHTML =
        '<button type="button" class="afm-cm-item" data-action="download"><iconify-icon icon="mdi:download-outline"></iconify-icon> 下载文件</button>' +
        '<button type="button" class="afm-cm-item" data-action="rename"><iconify-icon icon="mdi:rename-box-outline"></iconify-icon> 重命名文件</button>' +
        '<button type="button" class="afm-cm-item" data-action="delete"><iconify-icon icon="mdi:delete-outline"></iconify-icon> 删除文件</button>';
      contextMenuEl.onclick = function (e) {
        var btn = e.target && e.target.closest('.afm-cm-item');
        if (!btn || !contextMenuTarget) return;
        var action = btn.getAttribute('data-action');
        if (action === 'download') doDownloadFile(contextMenuTarget.path, contextMenuTarget.name);
        if (action === 'delete') doDeleteFile(contextMenuTarget.id);
        if (action === 'rename') doRenameFile(contextMenuTarget.id, contextMenuTarget.name);
        hideContextMenu();
      };
      document.body.appendChild(contextMenuEl);
      document.addEventListener('click', hideContextMenu);
      document.addEventListener('scroll', hideContextMenu, true);
    }
    contextMenuEl.style.left = x + 'px';
    contextMenuEl.style.top = y + 'px';
    contextMenuEl.classList.add('open');
    requestAnimationFrame(function () {
      if (!contextMenuEl || !contextMenuEl.classList.contains('open')) return;
      var r = contextMenuEl.getBoundingClientRect();
      var vw = document.documentElement.clientWidth;
      var vh = document.documentElement.clientHeight;
      var left = r.left;
      var top = r.top;
      if (r.right > vw - 4) left = vw - r.width - 4;
      if (r.bottom > vh - 4) top = vh - r.height - 4;
      if (left < 4) left = 4;
      if (top < 4) top = 4;
      contextMenuEl.style.left = left + 'px';
      contextMenuEl.style.top = top + 'px';
    });
  }

  function hideContextMenu() {
    contextMenuTarget = null;
    if (contextMenuEl) contextMenuEl.classList.remove('open');
  }

  function doDownloadFile(path, name) {
    if (!path) return;
    var url = path;
    var link = document.createElement('a');
    link.href = url;
    link.download = name || '';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function doDeleteFile(id) {
    if (!id) return;
    if (!confirm('确定删除该文件？')) return;
    
    console.log('[FileManager] Deleting file:', id);
    console.log('[FileManager] CSRF token:', getCsrf());
    
    fetch('/admin/api/file-material/' + encodeURIComponent(id), {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'csrf-token': getCsrf() }
    })
      .then(function (r) {
        console.log('[FileManager] Delete response status:', r.status);
        return r.json().catch(function (err) {
          console.error('[FileManager] Parse error:', err);
          return {};
        });
      })
      .then(function (data) {
        console.log('[FileManager] Delete response data:', data);
        if (data && data.ok) {
          state.page = 1;
          loadFiles();
        } else {
          alert('删除失败：' + (data.message || '未知错误'));
        }
      })
      .catch(function (err) {
        console.error('[FileManager] Delete error:', err);
        alert('删除失败：' + err.message);
      });
  }

  function doRenameFile(id, currentName) {
    if (!id) return;
    var name = prompt('重命名文件', currentName || '');
    if (name == null || (name = (name || '').trim()) === '') return;
    fetch('/admin/api/file-material/' + encodeURIComponent(id), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'csrf-token': getCsrf() },
      body: JSON.stringify({ fileName: name })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function () {
        state.page = 1;
        loadFiles();
      })
      .catch(function () { alert('重命名失败'); });
  }

  function setActiveCat(id) {
    state.categoryId = id || '';
    var btns = qs('afmCatList').querySelectorAll('.afm-cat');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', (btns[i].getAttribute('data-id') || '') === state.categoryId);
    }
  }

  function loadCategories() {
    var prevCat = state.categoryId;
    return fetch('/admin/api/file-material/categories', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        state.categories = list || [];
        var el = qs('afmCatList');
        var html = '<li><button type="button" class="afm-cat active" data-id="">全部</button></li>';
        state.categories.forEach(function (c) {
          html += '<li><button type="button" class="afm-cat" data-id="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</button></li>';
        });
        el.innerHTML = html;
        el.onclick = function (e) {
          var t = e.target;
          if (t && t.classList && t.classList.contains('afm-cat')) {
            setActiveCat(t.getAttribute('data-id') || '');
            state.page = 1;
            loadFiles();
          }
        };
        var keep =
          prevCat === '' || prevCat == null
            ? ''
            : state.categories.some(function (c) {
                return String(c.id) === String(prevCat);
              })
              ? String(prevCat)
              : '';
        setActiveCat(keep);
        renderMoveDropdown();
      })
      .catch(function () {});
  }

  function updateMoveButton() {
    var btn = qs('afmBtnMoveToCat');
    if (btn) btn.disabled = !state.selectedIds || state.selectedIds.length === 0;
  }

  function renderMoveDropdown() {
    var wrap = qs('afmMoveCatList');
    if (!wrap) return;
    var html = '';
    (state.categories || []).forEach(function (c) {
      html += '<button type="button" class="afm-move-opt" data-id="' + escapeHtml(String(c.id)) + '">' + escapeHtml(c.name) + '</button>';
    });
    wrap.innerHTML = html;
  }

  function hideMoveDropdown() {
    var dd = qs('afmMoveDropdown');
    if (dd) { dd.classList.remove('open'); dd.setAttribute('aria-hidden', 'true'); }
  }

  function doBatchMove(categoryId) {
    var ids = state.selectedIds && state.selectedIds.length ? state.selectedIds.slice() : [];
    if (ids.length === 0) return;
    hideMoveDropdown();
    var catId = categoryId === '' || categoryId == null ? null : parseInt(categoryId, 10);
    fetch('/admin/api/file-material/batch-move', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'csrf-token': getCsrf() },
      body: JSON.stringify({ ids: ids.map(function (x) { return typeof x === 'string' ? parseInt(x, 10) : x; }), categoryId: catId })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        state.selectedIds = [];
        updateMoveButton();
        state.page = 1;
        loadFiles();
        if (d && d.ok) alert('已转移 ' + (d.count || ids.length) + ' 个文件');
      })
      .catch(function () { alert('转移失败'); });
  }

  // 渲染页码数字（定义在 loadFiles 之前，确保可访问）
  function renderPageNumbers(current, total) {
    var container = qs('afmPageNumbers');
    if (!container) return;

    var html = '';
    var maxVisible = 5; // 最多显示5个页码
    var start, end;

    if (total <= maxVisible) {
      start = 1;
      end = total;
    } else {
      var half = Math.floor(maxVisible / 2);
      if (current <= half + 1) {
        start = 1;
        end = maxVisible;
      } else if (current >= total - half) {
        start = total - maxVisible + 1;
        end = total;
      } else {
        start = current - half;
        end = current + half;
      }
    }

    // 第一页
    if (start > 1) {
      html += '<button type="button" class="afm-pager__num' + (current === 1 ? ' is-active' : '') + '" data-page="1">1</button>';
      if (start > 2) {
        html += '<span class="afm-pager__ellipsis" style="padding:0 4px;color:var(--admin-text-muted);">...</span>';
      }
    }

    // 中间页码
    for (var i = start; i <= end; i++) {
      html += '<button type="button" class="afm-pager__num' + (i === current ? ' is-active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }

    // 最后一页
    if (end < total) {
      if (end < total - 1) {
        html += '<span class="afm-pager__ellipsis" style="padding:0 4px;color:var(--admin-text-muted);">...</span>';
      }
      html += '<button type="button" class="afm-pager__num' + (current === total ? ' is-active' : '') + '" data-page="' + total + '">' + total + '</button>';
    }

    container.innerHTML = html;
  }

  function loadFiles() {
    var url = '/admin/api/file-material?page=' + state.page + '&pageSize=' + state.pageSize;
    if (state.categoryId) url += '&categoryId=' + encodeURIComponent(state.categoryId);
    if (state.keyword) url += '&keyword=' + encodeURIComponent(state.keyword);
    if (state.type === 'image') url += '&fileType=image';
    if (state.type === 'video') url += '&fileType=video';
    qs('afmGrid').innerHTML = '<div style="color:var(--admin-text-muted);">加载中...</div>';
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var items = res.items || [];
        state.total = res.total || 0;
        var totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
        qs('afmMeta').textContent = '共 ' + state.total + ' 条';
        renderPageNumbers(state.page, totalPages);
        qs('afmPrev').disabled = state.page <= 1;
        qs('afmNext').disabled = state.page >= totalPages;

        var html = '';
        var selectedSet = {};
        (state.selectedIds || []).forEach(function (id) { selectedSet[String(id)] = true; });
        for (var i = 0; i < items.length; i++) {
          var f = items[i];
          var idStr = String(f.id || '');
          var sel = selectedSet[idStr];
          var isImg = isImage(f);
          var imgTag = isImg ? '<img src="' + escapeHtml(f.filePath) + '" alt="" onload="if(this.parentNode){this.parentNode.dataset.w=this.naturalWidth;this.parentNode.dataset.h=this.naturalHeight;var dim=this.parentNode.querySelector(\'.afm-thumb-dim\');if(dim)dim.textContent=this.naturalWidth+\'x\'+this.naturalHeight;}">' : '';
          html += '<div class="afm-item' + (sel ? ' afm-item-selected' : '') + '" data-id="' + escapeHtml(idStr) + '" data-path="' + escapeHtml(f.filePath) + '" data-name="' + escapeHtml(f.fileName) + '">' +
            '<label class="afm-item-check"><input type="checkbox" class="afm-item-cb" data-id="' + escapeHtml(idStr) + '"' + (sel ? ' checked' : '') + '><span class="afm-item-checkbox"></span></label>' +
            '<div class="afm-thumb">' +
            (isImg ? imgTag : '<iconify-icon icon="mdi:file" style="font-size:44px;color:var(--admin-text-muted)"></iconify-icon>') +
            '<span class="afm-thumb-dim"></span>' +
            '</div>' +
            '<div class="afm-name" title="' + escapeHtml(f.fileName) + '">' + escapeHtml(f.fileName) + '</div>' +
          '</div>';
        }
        qs('afmGrid').innerHTML = html || '<div style="color:var(--admin-text-muted);">暂无文件</div>';

        qs('afmGrid').onchange = function (e) {
          var cb = e.target && e.target.classList && e.target.classList.contains('afm-item-cb') ? e.target : null;
          if (!cb) return;
          e.stopPropagation();
          var id = cb.getAttribute('data-id');
          if (!id) return;
          state.selectedIds = state.selectedIds || [];
          var idx = state.selectedIds.indexOf(id);
          if (cb.checked) { if (idx < 0) state.selectedIds.push(id); } else { if (idx >= 0) state.selectedIds.splice(idx, 1); }
          var item = cb.closest('.afm-item');
          if (item) item.classList.toggle('afm-item-selected', cb.checked);
          updateMoveButton();
        };

        qs('afmGrid').onclick = function (e) {
          if (e.target && (e.target.closest('.afm-item-check') || e.target.classList.contains('afm-item-cb'))) return;
          var node = e.target;
          while (node && node !== qs('afmGrid') && !(node.classList && node.classList.contains('afm-item'))) {
            node = node.parentNode;
          }
          if (!node || node === qs('afmGrid')) return;
          var path = node.getAttribute('data-path') || '';
          // 先写入 input / 预览，再 callback（避免 callback 里 sync 时读到旧值，例如具体优势「选择」后保存丢失图片）
          if (state.targetInput) state.targetInput.value = path;
          if (state.targetPreview) {
            state.targetPreview.innerHTML = path ? '<img src="' + escapeHtml(path) + '" alt="">' : '';
          }
          if (state.callback) state.callback(path);
          closeModal();
        };

        qs('afmGrid').oncontextmenu = function (e) {
          var node = e.target;
          while (node && node !== qs('afmGrid') && !(node.classList && node.classList.contains('afm-item'))) {
            node = node.parentNode;
          }
          if (!node || node === qs('afmGrid')) return;
          e.preventDefault();
          showContextMenu(e.clientX, e.clientY, {
            id: node.getAttribute('data-id'),
            path: node.getAttribute('data-path') || '',
            name: node.getAttribute('data-name') || ''
          });
        };

      })
      .catch(function (err) {
        var errorMsg = err && err.message ? err.message : '未知错误';
        qs('afmGrid').innerHTML =
          '<div style="text-align:center;padding:40px 20px;">' +
          '<div style="color:var(--admin-text-muted);margin-bottom:12px;">加载失败: ' + escapeHtml(errorMsg) + '</div>' +
          '<button type="button" class="btn" id="afmRetryBtn">重新加载</button>' +
          '</div>';
        qs('afmRetryBtn').onclick = function () {
          loadFiles();
        };
        console.error('加载文件失败:', err);
      });
  }

  function uploadOne(file) {
    var fd = new FormData();
    // 字段放在文件之前，便于服务端在解析到 file 时 fields 里已有 categoryId（与 pipeline 后读取双保险）
    if (state.categoryId) fd.append('categoryId', String(state.categoryId));
    fd.append('file', file);
    return fetch('/admin/api/file-material/upload', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'csrf-token': getCsrf() },
      body: fd
    }).then(function (r) { return r.json(); });
  }

  function uploadFiles(files, onProgress) {
    var list = [];
    for (var i = 0; i < files.length; i++) list.push(files[i]);
    var total = list.length;
    var done = 0;
    var failed = 0;
    function next() {
      if (list.length === 0) {
        if (onProgress) onProgress(done, total, failed, true);
        return Promise.resolve();
      }
      var file = list.shift();
      return uploadOne(file)
        .then(function (d) {
          done++;
          if (!d || d.ok !== true) failed++;
          if (d && d.ok === true && state.categoryId) {
            state.page = 1;
            return loadFiles();
          }
        })
        .then(function () {
          if (onProgress) onProgress(done, total, failed, list.length === 0);
          return next();
        })
        .catch(function () {
          done++;
          failed++;
          if (onProgress) onProgress(done, total, failed, list.length === 0);
          return next();
        });
    }
    return next();
  }

  function bind() {
    var overlay = qs('afmOverlay');
    if (!overlay) return;

    qs('afmBtnClose').onclick = closeModal;
    overlay.onclick = function (e) {
      if (e.target === overlay) closeModal();
    };
    document.addEventListener('keydown', function (e) {
      if (state.open && e.key === 'Escape') closeModal();
    });

    qs('afmPrev').onclick = function () { if (state.page > 1) { state.page--; loadFiles(); } };
    qs('afmNext').onclick = function () { state.page++; loadFiles(); };

    // 页码点击事件委托
    qs('afmPageNumbers').onclick = function (e) {
      var btn = e.target && e.target.closest('.afm-pager__num');
      if (!btn) return;
      var page = parseInt(btn.getAttribute('data-page'), 10);
      if (page && page !== state.page) {
        state.page = page;
        loadFiles();
      }
    };

    var kw = qs('afmKeyword');
    var timer = null;
    kw.oninput = function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.keyword = (kw.value || '').trim();
        state.page = 1;
        loadFiles();
      }, 300);
    };

    var uploadBtn = qs('afmBtnUpload');
    var uploadInput = qs('afmUploadInput');
    uploadBtn.onclick = function () { uploadInput.click(); };
    uploadInput.onchange = function () {
      var fileList = uploadInput.files;
      if (!fileList || fileList.length === 0) return;
      var files = [];
      for (var i = 0; i < fileList.length; i++) files.push(fileList[i]);
      uploadInput.value = '';
      var origText = uploadBtn.innerHTML;
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = '上传中 0/' + files.length + '...';
      uploadFiles(files, function (done, total, failed, isLast) {
        uploadBtn.innerHTML = '上传中 ' + done + '/' + total + '...';
        if (isLast) {
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = origText;
          // 已选分类时每个文件成功后已 loadFiles；「全部」下在此处刷新
          if (!state.categoryId) {
            state.page = 1;
            loadFiles();
          }
          if (failed > 0) alert('上传完成，其中 ' + failed + ' 个失败');
        }
      }).then(function () {
        if (uploadBtn.disabled && uploadBtn.innerHTML.indexOf('上传中') === 0) {
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = origText;
          if (!state.categoryId) {
            state.page = 1;
            loadFiles();
          }
        }
      });
    };

    var moveBtn = qs('afmBtnMoveToCat');
    var moveDrop = qs('afmMoveDropdown');
    if (moveBtn && moveDrop) {
      moveBtn.onclick = function (e) {
        e.stopPropagation();
        if (moveBtn.disabled) return;
        moveDrop.classList.toggle('open');
        moveDrop.setAttribute('aria-hidden', moveDrop.classList.contains('open') ? 'false' : 'true');
      };
      moveDrop.onclick = function (e) {
        var opt = e.target && e.target.classList && e.target.classList.contains('afm-move-opt') ? e.target : null;
        if (opt) {
          e.stopPropagation();
          doBatchMove(opt.getAttribute('data-id'));
        }
      };
      document.addEventListener('click', function (e) {
        if (moveDrop.classList.contains('open') && !moveDrop.contains(e.target) && !moveBtn.contains(e.target)) hideMoveDropdown();
      });
    }

    qs('afmBtnNewCategory').onclick = function () {
      var name = prompt('请输入分类名称');
      if (!name) return;
      fetch('/admin/api/file-material/categories', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'csrf-token': getCsrf() },
        body: JSON.stringify({ name: name })
      }).then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || d.ok !== true) { alert((d && d.message) || '创建失败'); return; }
          loadCategories();
        })
        .catch(function () { alert('创建失败'); });
    };
  }

  window.AdminFileManager = {
    open: openModal,
    close: closeModal
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();

