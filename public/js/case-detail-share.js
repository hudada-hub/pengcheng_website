/**
 * 详情页通用分享功能（模态框 + 二维码 + 多平台分享）
 * 根元素通过 data-share-root 属性定位，不绑定固定 ID，
 * 可在案例详情、新闻详情等多种页面复用。
 */
(function () {
  var root = document.querySelector('[data-share-root]');
  if (!root) return;
  var url = (
    root.getAttribute('data-share-url') ||
    window.location.href ||
    ''
  ).trim();
  if (!url) return;

  var title = document.title || '';
  var shareModal = document.getElementById('g-share-modal');
  var wechatQrModal = document.getElementById('g-wechat-qr-modal');
  var wechatQrContainer = document.getElementById('g-wechat-qr-container');
  var qrCodeInstance = null;

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'g-case-share-toast';
    t.textContent = msg;
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
    requestAnimationFrame(function () {
      t.classList.add('is-visible');
    });
    setTimeout(function () {
      t.classList.remove('is-visible');
      setTimeout(function () {
        t.remove();
      }, 300);
    }, 2200);
  }

  function copyLink() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () {
          toast(root.getAttribute('data-msg-copied') || 'Copied');
        },
        function () {
          fallbackCopy();
        },
      );
    } else {
      fallbackCopy();
    }
  }

  function fallbackCopy() {
    var ta = document.createElement('textarea');
    ta.value = url;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(root.getAttribute('data-msg-copied') || 'Copied');
    } catch (e) {
      toast(root.getAttribute('data-msg-copy-fail') || 'Copy failed');
    }
    document.body.removeChild(ta);
  }

  function openShare(urlToOpen) {
    window.open(urlToOpen, '_blank', 'noopener,noreferrer');
  }

  // 分享链接生成器
  var shareHandlers = {
    qq: function () {
      return (
        'http://connect.qq.com/widget/shareqq/index.html?' +
        'url=' +
        encodeURIComponent(url) +
        '&title=' +
        encodeURIComponent(title) +
        '&summary=' +
        encodeURIComponent(title)
      );
    },
    qzone: function () {
      return (
        'https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?' +
        'url=' +
        encodeURIComponent(url) +
        '&title=' +
        encodeURIComponent(title) +
        '&summary=' +
        encodeURIComponent(title)
      );
    },
    weibo: function () {
      return (
        'http://service.weibo.com/share/share.php?' +
        'url=' +
        encodeURIComponent(url) +
        '&title=' +
        encodeURIComponent(title)
      );
    },
    twitter: function () {
      return (
        'https://twitter.com/intent/tweet?' +
        'text=' +
        encodeURIComponent(title) +
        '&url=' +
        encodeURIComponent(url)
      );
    },
    facebook: function () {
      return (
        'https://www.facebook.com/sharer/sharer.php?' +
        'u=' +
        encodeURIComponent(url)
      );
    },
    linkedin: function () {
      return (
        'https://www.linkedin.com/sharing/share-offsite/?' +
        'url=' +
        encodeURIComponent(url)
      );
    },
    whatsapp: function () {
      return 'https://wa.me/?text=' + encodeURIComponent(title + ' ' + url);
    },
    telegram: function () {
      return (
        'https://t.me/share/url?' +
        'url=' +
        encodeURIComponent(url) +
        '&text=' +
        encodeURIComponent(title)
      );
    },
    email: function () {
      return (
        'mailto:?subject=' +
        encodeURIComponent(title) +
        '&body=' +
        encodeURIComponent(url)
      );
    },
    wechat: function () {
      // 微信分享显示二维码
      showWechatQrModal();
      return null;
    },
  };

  function openModal(modal) {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function showShareModal() {
    openModal(shareModal);
  }

  function hideShareModal() {
    closeModal(shareModal);
  }

  function showWechatQrModal() {
    hideShareModal();
    openModal(wechatQrModal);
    generateQrCode();
  }

  function hideWechatQrModal() {
    closeModal(wechatQrModal);
  }

  function generateQrCode() {
    if (!wechatQrContainer || !window.QRCode) return;

    // 清空容器
    wechatQrContainer.innerHTML = '';

    // 生成二维码
    try {
      qrCodeInstance = new QRCode(wechatQrContainer, {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H,
      });
    } catch (e) {
      console.error('QR Code generation failed:', e);
      wechatQrContainer.innerHTML =
        '<p style="color:#999;text-align:center;">二维码生成失败</p>';
    }
  }

  function handleShareType(type) {
    var handler = shareHandlers[type];
    if (!handler) {
      // 默认复制链接
      copyLink();
      return;
    }
    var shareUrl = handler();
    if (shareUrl) {
      openShare(shareUrl);
    }
  }

  // 绑定分享按钮点击事件（打开模态框）
  // 不使用 navigator.share：其在桌面端行为不一致（会先弹系统对话框，
  // 用户关闭后才触发 catch，导致需要多次点击才能看到自定义弹窗）。
  // 始终直接打开自定义分享模态框，保证一次点击即可弹出。
  root
    .querySelectorAll('[data-case-action="native-share"]')
    .forEach(function (btn) {
      btn.addEventListener('click', function () {
        showShareModal();
      });
    });

  // 分享模态框关闭按钮
  if (shareModal) {
    shareModal.querySelectorAll('[data-share-close]').forEach(function (el) {
      el.addEventListener('click', hideShareModal);
    });

    // 点击分享类型
    shareModal.querySelectorAll('[data-share-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var type = btn.getAttribute('data-share-type');
        handleShareType(type);
      });
    });

    // 点击遮罩关闭
    shareModal.addEventListener('click', function (e) {
      if (e.target === shareModal) {
        hideShareModal();
      }
    });

    // ESC 键关闭
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && shareModal.classList.contains('is-open')) {
        hideShareModal();
      }
    });
  }

  // 微信二维码模态框关闭按钮
  if (wechatQrModal) {
    wechatQrModal
      .querySelectorAll('[data-wechat-close]')
      .forEach(function (el) {
        el.addEventListener('click', hideWechatQrModal);
      });

    // 点击遮罩关闭
    wechatQrModal.addEventListener('click', function (e) {
      if (e.target === wechatQrModal) {
        hideWechatQrModal();
      }
    });

    // ESC 键关闭
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && wechatQrModal.classList.contains('is-open')) {
        hideWechatQrModal();
      }
    });
  }

  // 保留原有的复制链接功能
  root.querySelectorAll('[data-case-action="copy"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      copyLink();
    });
  });

  // 保留原有的 LinkedIn 分享功能
  root
    .querySelectorAll('[data-case-action="linkedin"]')
    .forEach(function (btn) {
      btn.addEventListener('click', function () {
        openShare(
          'https://www.linkedin.com/sharing/share-offsite/?url=' +
            encodeURIComponent(url),
        );
      });
    });

  // 保留原有的 Facebook 分享功能
  root
    .querySelectorAll('[data-case-action="facebook"]')
    .forEach(function (btn) {
      btn.addEventListener('click', function () {
        openShare(
          'https://www.facebook.com/sharer/sharer.php?u=' +
            encodeURIComponent(url),
        );
      });
    });
})();
