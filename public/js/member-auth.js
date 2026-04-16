(function () {
  /** 弹窗与样式表挂到 head/body 顶层，避免留在 header 或 main 内 */
  (function mountMemberAuthToBody() {
    var link = document.querySelector('link[href="/css/global/member-auth-global.css"]');
    if (link && link.parentElement && link.parentElement !== document.head) {
      document.head.appendChild(link);
    }
    var b = document.getElementById('pcMemberAuthBackdrop');
    var d = document.getElementById('pcMemberAuthDialog');
    if (b && b.parentElement !== document.body) document.body.appendChild(b);
    if (d && d.parentElement !== document.body) document.body.appendChild(d);
    var j = document.getElementById('pcMemberAuthL10n');
    if (j && j.parentElement !== document.body) document.body.appendChild(j);
  })();

  var API = '/api/member';
  var csrfToken = '';

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function readL10n() {
    var el = document.getElementById('pcMemberAuthL10n');
    if (!el || !el.textContent) return {};
    try {
      return JSON.parse(el.textContent) || {};
    } catch (e) {
      return {};
    }
  }

  function memberCenterHref() {
    var base = ($('#pcMemberEntry') && $('#pcMemberEntry').getAttribute('data-member-base')) || '/member';
    return base || '/member';
  }

  function setCsrf(t) {
    if (typeof t === 'string' && t) csrfToken = t;
  }

  function postForm(path, fields) {
    var params = new URLSearchParams();
    Object.keys(fields).forEach(function (k) {
      params.set(k, fields[k] == null ? '' : String(fields[k]));
    });
    params.set('_csrf', csrfToken);
    return fetch(API + path, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: params.toString(),
      credentials: 'same-origin',
    }).then(function (res) {
      var ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('application/json') !== -1) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      }
      return { res: res, data: null };
    });
  }

  function applyMemberUi(member) {
    var btn = $('#pcMemberEntry');
    if (!btn) return;
    if (member && member.id) {
      btn.setAttribute('href', memberCenterHref());
      btn.setAttribute('aria-label', 'Account');
      btn.setAttribute('data-logged-in', '1');
    } else {
      btn.setAttribute('href', '#');
      btn.setAttribute('aria-label', 'Login / Register');
      btn.setAttribute('data-logged-in', '0');
    }
  }

  function openModal() {
    var backdrop = $('#pcMemberAuthBackdrop');
    var dialog = $('#pcMemberAuthDialog');
    if (backdrop) backdrop.classList.add('is-open');
    if (dialog) dialog.classList.add('is-open');
    document.body.classList.add('pc-member-auth-open');
  }

  function closeModal() {
    var backdrop = $('#pcMemberAuthBackdrop');
    var dialog = $('#pcMemberAuthDialog');
    if (backdrop) backdrop.classList.remove('is-open');
    if (dialog) dialog.classList.remove('is-open');
    document.body.classList.remove('pc-member-auth-open');
    document.dispatchEvent(new CustomEvent('pc:member-auth-closed'));
  }

  function refreshBootstrap() {
    return fetch(API + '/bootstrap', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.csrfToken) setCsrf(data.csrfToken);
        applyMemberUi(data && data.member);
        return data;
      });
  }

  function wireModal() {
    var entry = $('#pcMemberEntry');
    var backdrop = $('#pcMemberAuthBackdrop');
    var closeBtn = $('#pcMemberAuthClose');
    var switchReg = $('#pcMemberAuthSwitchRegister');
    var switchLogin = $('#pcMemberAuthSwitchLogin');
    var modeInput = $('#pcMemberMode');
    var form = $('#pcMemberAuthForm');
    var errEl = $('#pcMemberAuthErr');
    var submitBtn = $('#pcMemberAuthSubmit');
    var confirmWrap = $('#pcMemberPasswordConfirmWrap');
    var confirmInput = $('#pcMemberPasswordConfirm');
    var passwordInput = $('#pcMemberPassword');
    var agreeWrap = $('#pcMemberAgreeWrap');
    var agreeCb = $('#pcMemberAgree');
    var titleEl = $('#pcMemberAuthTitle');
    var footerLogin = $('#pcMemberFooterLogin');
    var footerReg = $('#pcMemberFooterRegister');
    var dialog = $('#pcMemberAuthDialog');
    var L = readL10n();

    function setMode(m) {
      var isLogin = m === 'login';
      if (modeInput) modeInput.value = m;
      if (errEl) errEl.textContent = '';

      if (titleEl) titleEl.textContent = isLogin ? L.signInTitle || 'Sign in' : L.registerTitle || 'Register';
      if (submitBtn) {
        submitBtn.textContent = isLogin
          ? L.signInTitle || 'Sign in'
          : L.registerSubmit || L.registerTitle || 'Register';
        submitBtn.classList.toggle('pc-member-auth__submit--secondary', !isLogin);
      }

      if (agreeWrap) agreeWrap.hidden = !isLogin;
      if (agreeCb) {
        if (!isLogin) agreeCb.checked = false;
        agreeCb.required = !!isLogin;
      }

      if (confirmWrap) confirmWrap.hidden = isLogin;
      if (confirmInput) {
        confirmInput.required = !isLogin;
        if (isLogin) confirmInput.value = '';
      }

      if (footerLogin) footerLogin.hidden = !isLogin;
      if (footerReg) footerReg.hidden = isLogin;

      if (passwordInput) {
        passwordInput.setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
      }
      if (passwordInput && L.passwordPlaceholder) {
        passwordInput.setAttribute('placeholder', L.passwordPlaceholder);
      }
    }

    if (entry) {
      entry.addEventListener('click', function (e) {
        var member = entry.getAttribute('data-logged-in') === '1';
        if (member) return;
        e.preventDefault();
        setMode('login');
        openModal();
      });
    }
    if (backdrop) {
      backdrop.addEventListener('click', closeModal);
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dialog && dialog.classList.contains('is-open')) closeModal();
    });

    document.addEventListener('pc:open-member-auth', function () {
      setMode('login');
      openModal();
    });

    if (switchReg) {
      switchReg.addEventListener('click', function () {
        setMode('register');
      });
    }
    if (switchLogin) {
      switchLogin.addEventListener('click', function () {
        setMode('login');
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (errEl) errEl.textContent = '';
        var mode = (modeInput && modeInput.value) || 'login';
        var fd = new FormData(form);
        var email = (fd.get('email') || '').toString().trim();
        var password = (fd.get('password') || '').toString();
        var confirm = (fd.get('passwordConfirm') || '').toString();

        if (mode === 'login') {
          if (agreeCb && !agreeCb.checked) {
            if (errEl) errEl.textContent = L.msgAgree || 'Please accept the User Agreement';
            return;
          }
        }

        if (mode === 'register' && password !== confirm) {
          if (errEl) errEl.textContent = L.msgMismatch || 'Passwords do not match';
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
        }
        var path = mode === 'register' ? '/register' : '/login';
        var fields =
          mode === 'register'
            ? { email: email, password: password, passwordConfirm: confirm }
            : { email: email, password: password };
        postForm(path, fields)
          .then(function (o) {
            var res = o.res;
            var data = o.data;
            if (data && data.csrfToken) setCsrf(data.csrfToken);
            if (res.ok && data && data.ok) {
              entry.setAttribute('data-logged-in', '1');
              applyMemberUi(data.member);
              document.dispatchEvent(
                new CustomEvent('pc:member-login-success', {
                  detail: {
                    member: data.member,
                    csrfToken: (data && data.csrfToken) || '',
                  },
                }),
              );
              closeModal();
              form.reset();
              setMode('login');
              return;
            }
            if (data && data.message && errEl) errEl.textContent = data.message;
            else if (errEl) errEl.textContent = '操作失败，请重试';
          })
          .catch(function () {
            if (errEl) errEl.textContent = '网络错误';
          })
          .finally(function () {
            if (submitBtn) submitBtn.disabled = false;
          });
      });
    }
  }

  function wireLogout() {
    var btn = $('#pcMemberLogoutBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      refreshBootstrap()
        .then(function () {
          return postForm('/logout', {});
        })
        .then(function () {
          var bp = document.body && document.body.getAttribute('data-base-path');
          window.location.href = bp != null && bp !== '' ? bp : '/';
        })
        .catch(function () {
          btn.disabled = false;
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireModal();
    wireLogout();
    refreshBootstrap();
  });
})();
