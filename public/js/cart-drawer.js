(function () {
  'use strict';

  var PLACEHOLDER_THUMB = '/images/products/placeholder.jpg';
  var API_MEMBER = '/api/member';

  var csrfToken = '';
  var pendingAfterNext = false;
  var pendingInquiryOrderUuid = '';
  var drawerOpen = false;
  var recommendLoaded = false;
  var textsMemo = null;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function parseJsonScript(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var raw = el.textContent ? el.textContent.trim() : '';
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function pickStr(v, fb) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    return fb;
  }

  function T() {
    if (textsMemo) return textsMemo;
    var cartCfg = parseJsonScript('pcCartDrawerCartTexts');
    var inqCfg = parseJsonScript('pcCartDrawerInquiryTexts');

    var fullNameLabel = '';
    if (inqCfg) {
      var fn = pickStr(inqCfg.firstName, '');
      var ln = pickStr(inqCfg.lastName, '');
      if (fn && ln) fullNameLabel = fn + ' / ' + ln;
      else if (fn || ln) fullNameLabel = fn || ln;
    }

    var inquiryHead =
      inqCfg && typeof inqCfg.contactInformation === 'string' && inqCfg.contactInformation.trim()
        ? inqCfg.contactInformation.trim()
        : '';

    textsMemo = {
      empty: pickStr(cartCfg && cartCfg.yourCartIsEmpty, 'Your cart is empty'),
      continueShopping: pickStr(cartCfg && cartCfg.continueShopping, 'Continue Shopping'),
      next: pickStr(cartCfg && cartCfg.next, 'Next'),
      remove: pickStr(cartCfg && cartCfg.remove, 'Remove'),
      recommend: pickStr(cartCfg && cartCfg.youMightAlsoLike, 'You might also like'),
      add: pickStr(cartCfg && cartCfg.add, 'Add +'),
      haveAnAccount: pickStr(cartCfg && cartCfg.haveAnAccount, 'Have an account?'),
      signIn: pickStr(cartCfg && cartCfg.signIn, 'Sign in'),
      yourCartIsEmpty: pickStr(cartCfg && cartCfg.yourCartIsEmpty, 'Your cart is empty'),
      total: pickStr(cartCfg && cartCfg.total, '{n} item(s)'),
      productLine: pickStr(cartCfg && cartCfg.productLine, 'Product #{id}'),
      inquiryTitle: inquiryHead,
      inquiryDesc: pickStr(inqCfg && inqCfg.descriptionParagraph, ''),
      fullName: fullNameLabel,
      email: pickStr(inqCfg && inqCfg.email, ''),
      nation: '',
      location: pickStr(inqCfg && inqCfg.address, ''),
      phone: pickStr(inqCfg && inqCfg.phoneNumber, ''),
      message: pickStr(inqCfg && inqCfg.leaveMessage, ''),
      submit: pickStr(inqCfg && inqCfg.submit, 'Submit'),
      submitOk: pickStr(cartCfg && cartCfg.submitOk, 'Thank you. We will get back to you shortly.'),
      mergeFail: pickStr(cartCfg && cartCfg.mergeFail, 'Could not merge your cart. Please try again.'),
      startInquiryFail: pickStr(cartCfg && cartCfg.startInquiryFail, 'Could not start inquiry. Please try again.'),
      network: pickStr(cartCfg && cartCfg.network, 'Network error'),
      addFail: pickStr(cartCfg && cartCfg.addFail, 'Could not add to cart'),
      qtyDecAria: pickStr(cartCfg && cartCfg.qtyDecAria, 'Decrease quantity'),
      qtyIncAria: pickStr(cartCfg && cartCfg.qtyIncAria, 'Increase quantity'),
    };
    return textsMemo;
  }

  function showToast(msg, isErr) {
    var el = document.createElement('div');
    el.className = 'pc-cart-toast' + (isErr ? ' pc-cart-toast--error' : '');
    el.setAttribute('role', 'alert');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add('pc-cart-toast--show');
    });
    setTimeout(function () {
      el.classList.remove('pc-cart-toast--show');
      setTimeout(function () {
        el.remove();
      }, 280);
    }, 4200);
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function shakeCartIcon() {
    var trigger = document.getElementById('pcNavCartTrigger');
    if (!trigger) return;
    trigger.classList.remove('pc-nav-cart--shake');
    // Force reflow so animation can re-run.
    void trigger.offsetWidth;
    trigger.classList.add('pc-nav-cart--shake');
    setTimeout(function () {
      trigger.classList.remove('pc-nav-cart--shake');
    }, 700);
  }

  function getCenterRect(el) {
    if (!el || !el.getBoundingClientRect) return null;
    var r = el.getBoundingClientRect();
    if (!r || !r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }

  function flyToCart(fromEl) {
    if (prefersReducedMotion()) {
      shakeCartIcon();
      return;
    }
    var toEl = document.getElementById('pcNavCartTrigger');
    if (!toEl) {
      shakeCartIcon();
      return;
    }
    var from = getCenterRect(fromEl);
    var to = getCenterRect(toEl);
    if (!from || !to) {
      shakeCartIcon();
      return;
    }

    // Remove any previous flight.
    document.querySelectorAll('.pc-cart-fly').forEach(function (n) {
      try {
        n.remove();
      } catch (e) {}
    });

    var fly = document.createElement('div');
    fly.className = 'pc-cart-fly';
    fly.setAttribute('aria-hidden', 'true');
    fly.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' +
      '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' +
      '</svg>';
    document.body.appendChild(fly);

    var dx = to.x - from.x;
    var dy = to.y - from.y;
    // Control point: lift upward, with slight sideways bias.
    var cx = from.x + dx * 0.4;
    var cy = Math.min(from.y, to.y) - Math.min(160, Math.max(80, Math.abs(dx) * 0.15));

    var dur = 520;
    var start = performance.now();
    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }
    function qbez(t, p0, p1, p2) {
      var u = 1 - t;
      return u * u * p0 + 2 * u * t * p1 + t * t * p2;
    }

    function frame(now) {
      var t = Math.min(1, (now - start) / dur);
      var e = easeOutCubic(t);
      var x = qbez(e, from.x, cx, to.x);
      var y = qbez(e, from.y, cy, to.y);
      var s = 1 - e * 0.25;
      var o = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
      fly.style.transform = 'translate(' + (x - 9) + 'px,' + (y - 9) + 'px) scale(' + s + ')';
      fly.style.opacity = String(Math.max(0, Math.min(1, o)));
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        try {
          fly.remove();
        } catch (e2) {}
        shakeCartIcon();
      }
    }

    requestAnimationFrame(frame);
  }

  function basePath() {
    var root = document.getElementById('pcCartDrawer');
    var bp = (root && root.getAttribute('data-base-path')) || '';
    return bp || '';
  }

  function isLoggedIn() {
    var entry = document.getElementById('pcMemberEntry');
    return entry && entry.getAttribute('data-logged-in') === '1';
  }

  /** 与后台 Lang 路由段一致：默认英文传空字符串 */
  function localeSegment() {
    var bp = basePath().replace(/^\//, '');
    return bp.split('/')[0] || '';
  }

  function postJsonMember(path, payload) {
    var t = typeof csrfToken === 'string' ? csrfToken : '';
    var body = Object.assign({}, payload || {}, { _csrf: t });
    return fetch(API_MEMBER + path, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-csrf-token': t,
      },
      body: JSON.stringify(body),
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

  function parseProductIdFromPath() {
    var m = location.pathname.match(/\/products\/(\d+)(?:\/|$)/);
    return m ? parseInt(m[1], 10) : NaN;
  }

  function readDetailProductForCart() {
    var layout = document.querySelector('.g-product-detail-layout[data-category-id]');
    var categoryId = null;
    if (layout) {
      var c = parseInt(layout.getAttribute('data-category-id') || '', 10);
      if (Number.isFinite(c) && c > 0) categoryId = c;
    }
    var productId = parseProductIdFromPath();
    var titleEl = document.querySelector('#productDetailInfo .g-pd-info__title');
    var title = titleEl ? titleEl.textContent.trim() : '';
    var img =
      document.querySelector('#productDetailMainSwiper .swiper-slide img') ||
      document.querySelector('#productDetailGallery img');
    var thumbUrl = PLACEHOLDER_THUMB;
    if (img) {
      var src = img.getAttribute('src') || '';
      if (src) thumbUrl = src;
    }
    return { productId: productId, title: title, thumbUrl: thumbUrl, categoryId: categoryId };
  }

  function postMemberForm(path, fields) {
    var params = new URLSearchParams();
    Object.keys(fields).forEach(function (k) {
      params.set(k, fields[k] == null ? '' : String(fields[k]));
    });
    params.set('_csrf', csrfToken);
    return fetch(API_MEMBER + path, {
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

  function fetchBootstrap() {
    return fetch(API_MEMBER + '/bootstrap', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && typeof data.csrfToken === 'string') csrfToken = data.csrfToken;
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  function fetchMemberCartItems() {
    var seg = localeSegment();
    var q = '/cart/items?locale=' + encodeURIComponent(seg);
    return fetch(API_MEMBER + q, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.ok && Array.isArray(data.items)) return data.items;
        return [];
      })
      .catch(function () {
        return [];
      });
  }

  function deleteMemberCartItem(itemId) {
    var params = new URLSearchParams();
    params.set('_csrf', csrfToken);
    return fetch(API_MEMBER + '/cart/items/' + encodeURIComponent(String(itemId)), {
      method: 'DELETE',
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

  function patchMemberCartItemQty(itemId, qty) {
    var params = new URLSearchParams();
    params.set('_csrf', csrfToken);
    params.set('qty', String(qty));
    return fetch(API_MEMBER + '/cart/items/' + encodeURIComponent(String(itemId)), {
      method: 'PATCH',
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

  function fetchRecommendations(categoryId) {
    var q = '/api/website/recommend-products?limit=8';
    if (categoryId != null && categoryId > 0) q += '&categoryId=' + encodeURIComponent(String(categoryId));
    var seg = basePath().replace(/^\//, '');
    if (seg) q += '&locale=' + encodeURIComponent(seg);
    return fetch(q, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        return data && Array.isArray(data.items) ? data.items : [];
      })
      .catch(function () {
        return [];
      });
  }

  function pickCategoryFromLines(lines) {
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].categoryId != null && lines[i].categoryId > 0) return lines[i].categoryId;
    }
    return null;
  }

  function setDrawerOpen(open) {
    drawerOpen = !!open;
    var el = document.getElementById('pcCartDrawer');
    var panel = document.getElementById('pcCartDrawerPanel');
    var trigger = document.getElementById('pcNavCartTrigger');
    if (el) {
      el.classList.toggle('pc-cart-drawer--open', drawerOpen);
      el.setAttribute('aria-hidden', drawerOpen ? 'false' : 'true');
    }
    if (panel) panel.setAttribute('aria-hidden', drawerOpen ? 'false' : 'true');
    if (trigger) {
      trigger.setAttribute('aria-expanded', drawerOpen ? 'true' : 'false');
    }
    document.body.classList.toggle('pc-cart-drawer-open', drawerOpen);
    if (drawerOpen && panel) {
      try {
        panel.focus();
      } catch (e) {}
    }
  }

  function showStages(stage) {
    var empty = document.getElementById('pcCartDrawerStageEmpty');
    var list = document.getElementById('pcCartDrawerStageList');
    var inq = document.getElementById('pcCartDrawerStageInquiry');
    if (empty) {
      empty.hidden = stage !== 'empty';
    }
    if (list) {
      list.hidden = stage !== 'list';
    }
    if (inq) {
      inq.hidden = stage !== 'inquiry';
    }
  }

  function lineTitle(line) {
    if (line.title && String(line.title).trim()) return line.title;
    return T().productLine.replace('{id}', String(line.productId));
  }

  function buildCartLinesMember(rows) {
    return rows.map(function (r) {
      var cat = r.categoryId != null ? Number(r.categoryId) : null;
      return {
        key: 'm-' + r.itemId,
        productId: r.productId,
        title: typeof r.title === 'string' ? r.title : '',
        thumbUrl: r.thumbUrl || PLACEHOLDER_THUMB,
        qty: r.qty,
        categoryId: cat != null && Number.isFinite(cat) && cat > 0 ? cat : null,
        categoryName: typeof r.categoryName === 'string' ? r.categoryName : '',
        attributes: Array.isArray(r.attributes) ? r.attributes : [],
        itemId: r.itemId,
        guest: false,
      };
    });
  }

  function renderEmpty() {
    var wrap = document.querySelector('[data-pc-cart-empty]');
    if (!wrap) return;
    var t = T();
    var isLogged = isLoggedIn();
    var signInLink = isLogged
      ? ''
      : '<p class="pc-cart-empty__signin">' +
        escapeHtml(t.haveAnAccount) +
        '<a href="#" class="pc-cart-empty__signin-link" data-pc-cart-signin>' +
        escapeHtml(t.signIn) +
        '</a></p>';
    wrap.innerHTML =
      '<div class="pc-cart-empty">' +
      '<div class="pc-cart-empty__icon-wrap">' +
      '<svg class="pc-cart-empty__icon" viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
      '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' +
      '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' +
      '</svg>' +
      '</div>' +
      '<p class="pc-cart-empty__title">' +
      escapeHtml(t.empty) +
      '</p>' +
      '<a href="' +
      escapeHtml(basePath() + '/products') +
      '" class="pc-cart-btn pc-cart-btn--primary pc-cart-btn--wide">' +
      escapeHtml(t.continueShopping) +
      '</a>' +
      signInLink +
      '<div class="pc-cart-recommend" data-pc-cart-recommend></div>' +
      '</div>';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function lineAttrsHtml(line) {
    if (!line.attributes || !line.attributes.length) return '';
    var bits = line.attributes.map(function (a) {
      var ct = escapeHtml(a.categoryTitle || '');
      var vt = escapeHtml(a.valueTitle || '');
      var vv = a.value != null && String(a.value).trim() ? escapeHtml(String(a.value).trim()) : '';
      var val = vv || vt;
      var catId = a.categoryId || '';
      var valId = a.valueId || '';
      return '<div class="pc-cart-line__attr" data-attr-category-id="' + catId + '" data-attr-value-id="' + valId + '">' +
        '<span class="pc-cart-line__attr-label">' + ct + ':</span>' +
        '<span class="pc-cart-line__attr-value">' + val + '</span>' +
        '<svg class="pc-cart-line__attr-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</div>';
    });
    return (
      '<div class="pc-cart-line__attrs">' +
      bits.join('') +
      '</div>'
    );
  }

  function renderList(lines) {
    var wrap = document.querySelector('[data-pc-cart-list]');
    if (!wrap) return;
    var t = T();
    var totalQty = 0;
    var rows = lines
      .map(function (line) {
        totalQty += line.qty;
        var thumb = line.thumbUrl || PLACEHOLDER_THUMB;
        var catName =
          line.categoryName && String(line.categoryName).trim()
            ? '<div class="pc-cart-line__cat" style="font-size:12px;color:#888;margin-top:2px;">' +
              escapeHtml(line.categoryName) +
              '</div>'
            : '';
        var catData = line.categoryId != null && line.categoryId > 0 ? ' data-category-id="' + line.categoryId + '"' : '';
        return (
          '<div class="pc-cart-line" data-line-key="' +
          escapeHtml(line.key) +
          '" data-product-id="' +
          line.productId +
          '" data-item-id="' +
          (line.itemId != null ? line.itemId : '') +
          '" data-guest="0"' +
          catData +
          ' data-qty="' +
          line.qty +
          '">' +
          '<img class="pc-cart-line__thumb" src="' +
          escapeHtml(thumb) +
          '" alt="" loading="lazy"/>' +
          '<div class="pc-cart-line__main">' +
          '<div class="pc-cart-line__title-row">' +
          '<div class="pc-cart-line__title">' +
          escapeHtml(lineTitle(line)) +
          '</div>' +
          lineAttrsHtml(line) +
          '</div>' +
          '</div>' +
          '<button type="button" class="pc-cart-line__remove" data-pc-cart-remove aria-label="' +
          escapeHtml(t.remove) +
          '">' +
          '<img src="/images/global/delete.png" alt="" width="32" height="32">' +
          '</button>' +
          '</div>'
        );
      })
      .join('');
    var rec = '<div class="pc-cart-recommend" data-pc-cart-recommend></div>';
    wrap.innerHTML =
      '<div class="pc-cart-list">' +
      rows +
      '<div class="pc-cart-list__footer">' +
      '<button type="button" class="pc-cart-btn pc-cart-btn--primary" data-pc-cart-next>' +
      escapeHtml(t.next) +
      '</button>' +
      '</div>' +
      rec +
      '</div>';
  }

  function cartSummaryText(lines) {
    return lines
      .map(function (l) {
        var extra = '';
        if (l.attributes && l.attributes.length) {
          extra =
            ' | ' +
            l.attributes
              .map(function (a) {
                var val = a.value || a.valueTitle || '';
                return (a.categoryTitle || '') + ': ' + val;
              })
              .join('; ');
        }
        return '- ' + lineTitle(l) + ' × ' + l.qty + ' (ID ' + l.productId + ')' + extra;
      })
      .join('\n');
  }

  function renderInquiry(lines, orderUuid) {
    var wrap = document.querySelector('[data-pc-cart-inquiry]');
    if (!wrap) return;
    var t = T();
    var summary = cartSummaryText(lines);
    var ou = orderUuid ? escapeHtml(orderUuid) : '';
    wrap.innerHTML =
      '<div class="pc-cart-inquiry">' +
      (t.inquiryTitle
        ? '<p class="pc-cart-inquiry__head">' + escapeHtml(t.inquiryTitle) + '</p>'
        : '') +
      '<p class="pc-cart-inquiry__desc">' +
      escapeHtml(t.inquiryDesc) +
      '</p>' +
      '<form class="pc-cart-inquiry__form" data-pc-cart-inquiry-form data-pc-inquiry-order-uuid="' +
      ou +
      '">' +
      '<label class="pc-cart-field"><span class="pc-cart-field__label">' +
      escapeHtml(t.fullName) +
      '</span><input class="pc-cart-field__input" name="fullName" required maxlength="128" autocomplete="name" /></label>' +
      '<label class="pc-cart-field"><span class="pc-cart-field__label">' +
      escapeHtml(t.email) +
      '</span><input class="pc-cart-field__input" type="email" name="email" required maxlength="128" autocomplete="email" /></label>' +
      '<label class="pc-cart-field"><span class="pc-cart-field__label">' +
      escapeHtml(t.nation) +
      '</span><input class="pc-cart-field__input" name="nation" maxlength="128" /></label>' +
      '<label class="pc-cart-field"><span class="pc-cart-field__label">' +
      escapeHtml(t.location) +
      '</span><input class="pc-cart-field__input" name="location" maxlength="255" /></label>' +
      '<label class="pc-cart-field"><span class="pc-cart-field__label">' +
      escapeHtml(t.phone) +
      '</span><input class="pc-cart-field__input" type="tel" name="phone" maxlength="64" /></label>' +
      '<label class="pc-cart-field"><span class="pc-cart-field__label">' +
      escapeHtml(t.message) +
      '</span><textarea class="pc-cart-field__textarea" name="question" rows="4" maxlength="65535">' +
      escapeHtml(summary) +
      '</textarea></label>' +
      '<button type="submit" class="pc-cart-btn pc-cart-btn--primary" data-pc-cart-inquiry-submit>' +
      escapeHtml(t.submit) +
      '</button>' +
      '</form></div>';
  }

  function fillRecommendations(items) {
    var host = document.querySelector('[data-pc-cart-recommend]');
    if (!host) return;
    // 始终保留推荐模块区域，即使没有推荐产品也不删除
    if (!items || items.length === 0) {
      // 可选：不显示任何内容但保留区域，或显示默认提示
      host.innerHTML = '';
      return;
    }
    var t = T();
    var cards = items
      .map(function (p) {
        var paramsHtml = '';
        if (p.coreParams && Array.isArray(p.coreParams) && p.coreParams.length > 0) {
          paramsHtml = '<div class="pc-cart-rec-card__params">' +
            p.coreParams.slice(0, 3).map(function(param) {
              return '<div class="pc-cart-rec-card__param">' + escapeHtml(param) + '</div>';
            }).join('') +
            '</div>';
        }
        return (
          '<div class="pc-cart-rec-card" data-rec-product-id="' +
          p.productId +
          '" data-rec-title="' +
          escapeHtml(p.title || '') +
          '" data-rec-thumb="' +
          escapeHtml(p.thumbUrl || PLACEHOLDER_THUMB) +
          '" data-rec-cat="' +
          (p.categoryId != null ? p.categoryId : '') +
          '">' +
          '<img class="pc-cart-rec-card__img" src="' +
          escapeHtml(p.thumbUrl || PLACEHOLDER_THUMB) +
          '" alt="" loading="lazy"/>' +
          '<div class="pc-cart-rec-card__title">' +
          escapeHtml(p.title || '') +
          '</div>' +
          paramsHtml +
          '<button type="button" class="pc-cart-rec-card__add" data-pc-cart-rec-add>' +
          escapeHtml(t.add) +
          '</button></div>'
        );
      })
      .join('');
    host.innerHTML = '<p class="pc-cart-recommend__title">' + escapeHtml(t.recommend) + '</p><div class="pc-cart-rec-grid">' + cards + '</div>';
  }

  async function refreshDrawerContent() {
    await fetchBootstrap();
    var lines = [];
    var stage = 'empty';
    if (!isLoggedIn()) {
      showStages('empty');
      renderEmpty();
      if (!recommendLoaded) {
        recommendLoaded = true;
        fetchRecommendations(null).then(function (items) {
          if (!drawerOpen) return;
          fillRecommendations(items);
        });
      }
      return;
    }
    var rows = await fetchMemberCartItems();
    lines = buildCartLinesMember(rows);
    if (!lines.length) stage = 'empty';
    else stage = 'list';
    if (stage === 'empty') {
      showStages('empty');
      renderEmpty();
    } else {
      showStages('list');
      renderList(lines);
    }
    if (!recommendLoaded) {
      recommendLoaded = true;
      var cat = pickCategoryFromLines(lines);
      fetchRecommendations(cat).then(function (items) {
        if (!drawerOpen) return;
        fillRecommendations(items);
      });
    }
  }

  function openDrawer() {
    setDrawerOpen(true);
    recommendLoaded = false;
    refreshDrawerContent();
    document.dispatchEvent(new CustomEvent('pc:cart-updated'));
  }

  function closeDrawer() {
    setDrawerOpen(false);
    recommendLoaded = false;
    pendingInquiryOrderUuid = '';
  }

  async function clearAllCarts() {
    if (isLoggedIn()) {
      var rows = await fetchMemberCartItems();
      for (var i = 0; i < rows.length; i++) {
        var o = await deleteMemberCartItem(rows[i].itemId);
        if (o.data && o.data.csrfToken) csrfToken = o.data.csrfToken;
      }
    }
  }

  async function handleNext() {
    await fetchBootstrap();
    if (!isLoggedIn()) {
      pendingAfterNext = true;
      document.dispatchEvent(new CustomEvent('pc:open-member-auth'));
      return;
    }
    pendingAfterNext = false;
    var loc = localeSegment();
    var o = await postJsonMember('/cart/start-inquiry', { locale: loc });
    if (o.data && o.data.csrfToken) csrfToken = o.data.csrfToken;
    if (!o.res.ok || !o.data || !o.data.ok) {
      showToast((o.data && o.data.message) || T().startInquiryFail, true);
      return;
    }
    var orderUuid = o.data.orderUuid;
    var items = Array.isArray(o.data.items) ? o.data.items : [];
    if (!orderUuid || !items.length) {
      showToast(T().startInquiryFail, true);
      return;
    }
    pendingInquiryOrderUuid = orderUuid;
    var lines = buildCartLinesMember(items);
    // 关闭购物车抽屉并打开询价弹窗
    closeDrawer();
    await openInquiryModal(lines, orderUuid);
  }

  async function openInquiryModal(lines, orderUuid) {
    var modal = document.getElementById('gInquiryModal');
    if (!modal) return;
    // 清空 question 字段（用户手动填写）
    var questionInput = document.getElementById('g-inquiry-question');
    if (questionInput) questionInput.value = '';
    // 设置 orderUuid 到表单
    var form = document.getElementById('gInquiryForm');
    if (form) form.setAttribute('data-pc-inquiry-order-uuid', orderUuid || '');

    // 获取并设置 CSRF token
    var csrfInput = document.getElementById('gInquiryCsrf');
    if (csrfInput) {
      try {
        var res = await fetch('/api/member/bootstrap', { credentials: 'same-origin' });
        var data = await res.json();
        if (data && typeof data.csrfToken === 'string') {
          csrfInput.value = data.csrfToken;
        }
      } catch (e) {
        console.error('获取 CSRF token 失败:', e);
      }
    }

    // 打开弹窗
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  async function afterLoginInquiryContinue() {
    await fetchBootstrap();
    await handleNext();
  }

  function onAddCartClick(e) {
    var a = e.target.closest('[data-action="add-cart"]');
    if (!a) return;
    e.preventDefault();
    if (!isLoggedIn()) {
      flyToCart(a);
      // Login not required
      document.dispatchEvent(new CustomEvent('pc:open-member-auth'));
      return;
    }
    flyToCart(a);
    var info = readDetailProductForCart();
    if (!Number.isFinite(info.productId) || info.productId < 1) {
      showToast(T().addFail, true);
      return;
    }
    postMemberForm('/cart/items', { productId: String(info.productId), qtyDelta: '1' }).then(function (o) {
      if (o.data && o.data.csrfToken) csrfToken = o.data.csrfToken;
      if (o.res.ok && o.data && o.data.ok) return;
      var msg = (o.data && o.data.message) || T().addFail;
      showToast(msg, true);
    });
  }

  async function onRecommendAdd(btn) {
    var card = btn.closest('.pc-cart-rec-card');
    if (!card) return;
    var pid = parseInt(card.getAttribute('data-rec-product-id') || '', 10);
    if (!Number.isFinite(pid) || pid < 1) return;
    flyToCart(btn);
    if (!isLoggedIn()) {
      // Login not required
      document.dispatchEvent(new CustomEvent('pc:open-member-auth'));
      return;
    }
    var o = await postMemberForm('/cart/items', { productId: String(pid), qtyDelta: '1' });
    if (o.data && o.data.csrfToken) csrfToken = o.data.csrfToken;
    if (!o.res.ok || !o.data || !o.data.ok) {
      showToast((o.data && o.data.message) || T().addFail, true);
      return;
    }
    await refreshDrawerContent();
  }

  // Quick Quote: 点击产品卡片上的 Get a Quote 按钮，直接加入购物车并打开询价表单
  async function onQuickQuoteClick(e) {
    var btn = e.target.closest('[data-pc-quick-quote]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn()) {
      // Login not required
      document.dispatchEvent(new CustomEvent('pc:open-member-auth'));
      return;
    }

    var productId = parseInt(btn.getAttribute('data-product-id') || '', 10);
    var productTitle = btn.getAttribute('data-product-title') || '';
    var productPic = btn.getAttribute('data-product-pic') || '';

    if (!Number.isFinite(productId) || productId < 1) {
      showToast(T().addFail, true);
      return;
    }

    // 先加入购物车
    var o = await postMemberForm('/cart/items', { productId: String(productId), qtyDelta: '1' });
    if (o.data && o.data.csrfToken) csrfToken = o.data.csrfToken;
    if (!o.res.ok || !o.data || !o.data.ok) {
      showToast((o.data && o.data.message) || T().addFail, true);
      return;
    }

    // 获取购物车商品并创建询价订单
    await fetchBootstrap();
    var items = await fetchMemberCartItems();
    if (!items.length) {
      showToast(T().startInquiryFail, true);
      return;
    }

    // 创建询价订单
    var startRes = await postJsonMember('/cart/start-inquiry', { locale: localeSegment() });
    if (startRes.data && startRes.data.csrfToken) csrfToken = startRes.data.csrfToken;
    if (!startRes.res.ok || !startRes.data || !startRes.data.ok) {
      showToast(T().startInquiryFail, true);
      return;
    }

    var orderUuid = startRes.data.orderUuid;
    if (!orderUuid) {
      showToast(T().startInquiryFail, true);
      return;
    }

    pendingInquiryOrderUuid = orderUuid;

    // 获取产品参数
    var productParams = [];
    try {
      var paramsStr = btn.getAttribute('data-product-params');
      if (paramsStr) {
        productParams = JSON.parse(paramsStr);
      }
    } catch (e) {
      console.error('解析产品参数失败:', e);
    }

    // 构建单个产品的询价表单内容
    var singleProductLine = buildSingleProductLine(productId, productTitle, productPic, productParams);
    await openInquiryModalWithProduct(singleProductLine, orderUuid);
  }

  // 构建单个产品行（用于 Quick Quote）
  function buildSingleProductLine(productId, title, picUrl, params) {
    var thumb = picUrl || PLACEHOLDER_THUMB;
    var paramsHtml = '';
    if (Array.isArray(params) && params.length > 0) {
      paramsHtml = '<div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;">' +
        params.map(function(p) {
          var label = p.label ? escapeHtml(p.label) + ': ' : '';
          var value = escapeHtml(p.value || '');
          return '<span style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: #666;">' + label + value + '</span>';
        }).join('') +
        '</div>';
    }

    return [
      '<div style="display: flex; align-items: flex-start; gap: 16px; padding: 16px; background: #fafafa; border-radius: 8px; margin-bottom: 16px;">',
      '  <div style="flex-shrink: 0; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; background: #fff; border: 1px solid #eee;">',
      '    <img src="' + escapeHtml(thumb) + '" alt="" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">',
      '  </div>',
      '  <div style="flex: 1; min-width: 0;">',
      '    <div style="font-weight: 600; font-size: 16px; color: #333; line-height: 1.4;">' + escapeHtml(title) + '</div>',
           paramsHtml,
      '  </div>',
      '</div>'
    ].join('');
  }

  // 打开询价表单并显示单个产品
  async function openInquiryModalWithProduct(productHtml, orderUuid) {
    // 清空 question 字段
    var questionInput = document.getElementById('g-inquiry-question');
    if (questionInput) questionInput.value = '';

    // 设置 orderUuid 到表单
    var form = document.getElementById('gInquiryForm');
    if (form) form.setAttribute('data-pc-inquiry-order-uuid', orderUuid || '');

    // 获取并设置 CSRF token
    var csrfInput = document.getElementById('gInquiryCsrf');
    if (csrfInput) {
      try {
        var res = await fetch('/api/member/bootstrap', { credentials: 'same-origin' });
        var data = await res.json();
        if (data && typeof data.csrfToken === 'string') {
          csrfInput.value = data.csrfToken;
        }
      } catch (e) {
        console.error('获取 CSRF token 失败:', e);
      }
    }

    // 更新询价表单中的产品列表区域
    var productListEl = document.getElementById('gInquiryProductList');
    if (productListEl) {
      productListEl.innerHTML = productHtml;
    }

    // 打开弹窗
    var modal = document.getElementById('gInquiryModal');
    if (modal) {
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  }

  async function onRemoveLine(btn) {
    var line = btn.closest('.pc-cart-line');
    if (!line) return;
    var itemId = parseInt(line.getAttribute('data-item-id') || '', 10);
    if (Number.isFinite(itemId) && itemId > 0) {
      var o = await deleteMemberCartItem(itemId);
      if (o.data && o.data.csrfToken) csrfToken = o.data.csrfToken;
    }
    await refreshDrawerContent();
  }

  async function onQtyDelta(btn, delta) {
    var line = btn.closest('.pc-cart-line');
    if (!line) return;
    var itemId = parseInt(line.getAttribute('data-item-id') || '', 10);
    var curQty = parseInt(line.getAttribute('data-qty') || '1', 10);
    if (!Number.isFinite(curQty) || curQty < 1) curQty = 1;
    var newQty = curQty + delta;

    if (!Number.isFinite(itemId) || itemId < 1) return;
    await fetchBootstrap();
    if (newQty <= 0) {
      var od = await deleteMemberCartItem(itemId);
      if (od.data && od.data.csrfToken) csrfToken = od.data.csrfToken;
      await refreshDrawerContent();
      return;
    }
    var op = await patchMemberCartItemQty(itemId, newQty);
    if (op.data && op.data.csrfToken) csrfToken = op.data.csrfToken;
    if (!op.res.ok || !op.data || !op.data.ok) {
      showToast((op.data && op.data.message) || T().network, true);
      return;
    }
    await refreshDrawerContent();
  }

  // 属性下拉选择相关功能
  var currentAttrDropdown = null;
  var attrOptionsCache = {};

  function closeAllAttrDropdowns() {
    document.querySelectorAll('.pc-cart-line__attr-dropdown').forEach(function (el) {
      el.classList.remove('active');
    });
    currentAttrDropdown = null;
  }

  async function onAttrClick(attrValueEl) {
    var attrEl = attrValueEl.closest('.pc-cart-line__attr');
    if (!attrEl) {
      return;
    }

    // 如果已经有下拉菜单，关闭它
    var existingDropdown = attrEl.querySelector('.pc-cart-line__attr-dropdown');
    if (existingDropdown && existingDropdown.classList.contains('active')) {
      existingDropdown.classList.remove('active');
      currentAttrDropdown = null;
      return;
    }

    closeAllAttrDropdowns();

    var line = attrEl.closest('.pc-cart-line');
    if (!line) return;

    var itemId = parseInt(line.getAttribute('data-item-id') || '', 10);
    var categoryId = attrEl.getAttribute('data-attr-category-id');
    if (!itemId || !categoryId) return;

    // 显示加载状态
    var dropdown = existingDropdown;
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'pc-cart-line__attr-dropdown';
      attrEl.style.position = 'relative';
      attrEl.appendChild(dropdown);
    }
    dropdown.innerHTML = '<div class="pc-cart-line__attr-dropdown-item">加载中...</div>';
    dropdown.classList.add('active');
    currentAttrDropdown = dropdown;

    // 获取属性选项
    var cacheKey = itemId + '_' + categoryId;
    var options = attrOptionsCache[cacheKey];

    if (!options) {
      var loc = localeSegment();
      try {
        var res = await fetch('/api/member/cart/item/' + itemId + '/param-options?locale=' + encodeURIComponent(loc), {
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json' }
        });
        var data = await res.json();
        if (data && data.ok && Array.isArray(data.options)) {
          // 找到对应分类的选项
          var catOption = data.options.find(function (opt) {
            return String(opt.categoryId) === String(categoryId);
          });
          options = catOption ? catOption.values : [];
          attrOptionsCache[cacheKey] = options;
        }
      } catch (e) {
        console.error('获取属性选项失败:', e);
      }
    }

    renderAttrDropdown(dropdown, options, attrEl);
  }

  function renderAttrDropdown(dropdown, options, attrEl) {
    var currentValueId = attrEl.getAttribute('data-attr-value-id');

    if (!options || !options.length) {
      dropdown.innerHTML = '<div class="pc-cart-line__attr-dropdown-item">暂无选项</div>';
      return;
    }

    var html = options.map(function (opt) {
      var selected = String(opt.id) === String(currentValueId) ? ' selected' : '';
      var text = escapeHtml(opt.title || opt.value || '');
      return '<div class="pc-cart-line__attr-dropdown-item' + selected + '" data-value-id="' + opt.id + '">' + text + '</div>';
    }).join('');

    dropdown.innerHTML = html;
  }

  async function onAttrOptionSelect(itemEl) {
    var dropdown = itemEl.closest('.pc-cart-line__attr-dropdown');
    var attrEl = dropdown ? dropdown.closest('.pc-cart-line__attr') : null;
    var line = attrEl ? attrEl.closest('.pc-cart-line') : null;

    if (!line || !attrEl) return;

    var itemId = parseInt(line.getAttribute('data-item-id') || '', 10);
    var newValueId = parseInt(itemEl.getAttribute('data-value-id') || '', 10);

    if (!itemId || !newValueId) return;

    closeAllAttrDropdowns();

    // 调用接口更新产品 - 只传递新选择的值ID
    var loc = localeSegment();
    try {
      var res = await fetch('/api/member/cart/item/' + itemId + '/replace-by-params', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'csrf-token': csrfToken || ''
        },
        body: JSON.stringify({
          paramValueIds: [newValueId],
          locale: loc,
          _csrf: csrfToken || ''
        })
      });
      var data = await res.json();
      if (data && data.csrfToken) csrfToken = data.csrfToken;
      if (data && data.ok) {
        // 清除缓存
        attrOptionsCache = {};
        await refreshDrawerContent();
      } else {
        showToast((data && data.message) || '更新失败', true);
      }
    } catch (e) {
      console.error('更新属性失败:', e);
      showToast('更新失败', true);
    }
  }

  function wireDrawer() {
    var trigger = document.getElementById('pcNavCartTrigger');
    var backdrop = document.getElementById('pcCartDrawerBackdrop');
    var closeBtn = document.getElementById('pcCartDrawerClose');
    if (trigger) {
      trigger.addEventListener('click', function () {
        openDrawer();
      });
    }
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        closeDrawer();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closeDrawer();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !drawerOpen) return;
      if (document.body.classList.contains('pc-member-auth-open')) return;
      closeDrawer();
    });

    document.addEventListener('click', onAddCartClick);

    var root = document.getElementById('pcCartDrawer');
   
    if (root) {
      root.addEventListener('click', function (e) {
        var t = e.target;

        // 优先检查属性值点击
        var attrValueEl = t.closest ? t.closest('.pc-cart-line__attr-value') : null;
        if (attrValueEl) {
          e.preventDefault();
          e.stopPropagation();
          onAttrClick(attrValueEl);
          return;
        }

        // 检查下拉选项点击
        var dropdownItemEl = t.closest ? t.closest('.pc-cart-line__attr-dropdown-item') : null;
        if (dropdownItemEl) {
          e.preventDefault();
          e.stopPropagation();
          onAttrOptionSelect(dropdownItemEl);
          return;
        }
        
        if (t.closest && t.closest('[data-pc-cart-signin]')) {
          e.preventDefault();
          document.dispatchEvent(new CustomEvent('pc:open-member-auth'));
        } else if (t.closest && t.closest('[data-pc-cart-next]')) {
          e.preventDefault();
          handleNext();
        } else if (t.closest && t.closest('[data-pc-cart-qty-dec]')) {
          e.preventDefault();
          void onQtyDelta(t.closest('[data-pc-cart-qty-dec]'), -1);
        } else if (t.closest && t.closest('[data-pc-cart-qty-inc]')) {
          e.preventDefault();
          void onQtyDelta(t.closest('[data-pc-cart-qty-inc]'), 1);
        } else if (t.closest && t.closest('[data-pc-cart-remove]')) {
          e.preventDefault();
          onRemoveLine(t.closest('[data-pc-cart-remove]'));
        } else if (t.closest && t.closest('[data-pc-cart-rec-add]')) {
          e.preventDefault();
          onRecommendAdd(t.closest('[data-pc-cart-rec-add]'));
        }
      });

      // 点击其他地方关闭属性下拉
      document.addEventListener('click', function (e) {
        if (!e.target.closest('.pc-cart-line__attr')) {
          closeAllAttrDropdowns();
        }
      });

      root.addEventListener('submit', function (e) {
        var form = e.target;
        if (!form || !form.getAttribute || !form.getAttribute('data-pc-cart-inquiry-form')) return;
        e.preventDefault();
        var submitBtn = form.querySelector('[data-pc-cart-inquiry-submit]');
        if (submitBtn) {
          submitBtn.disabled = true;
        }
        var fd = new FormData(form);
        var orderUuid = (form.getAttribute('data-pc-inquiry-order-uuid') || pendingInquiryOrderUuid || '').trim();
        if (!orderUuid) {
          showToast(T().network, true);
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        var payload = {
          orderUuid: orderUuid,
          fullName: fd.get('fullName'),
          email: fd.get('email'),
          nation: fd.get('nation'),
          location: fd.get('location'),
          phone: fd.get('phone'),
          question: fd.get('question'),
        };
        void fetchBootstrap().then(function () {
          return postJsonMember('/cart/inquiry-submit', payload);
        }).then(function (o) {
          if (o.data && o.data.csrfToken) csrfToken = o.data.csrfToken;
          if (o.res.ok && o.data && o.data.ok) {
            pendingInquiryOrderUuid = '';
            form.reset();
            return clearAllCarts().then(function () {
              closeDrawer();
              showToast(T().submitOk, false);
            });
          }
          if (o.res.status === 400 && o.data && o.data.message) {
            showToast(o.data.message, true);
            return;
          }
          showToast(T().network, true);
        }).catch(function () {
          showToast(T().network, true);
        }).finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
      });
    }

    document.addEventListener('pc:member-login-success', function (ev) {
      var d = (ev && ev.detail) || {};
      if (typeof d.csrfToken === 'string' && d.csrfToken) csrfToken = d.csrfToken;
      if (!pendingAfterNext) return;
      void afterLoginInquiryContinue();
    });

    document.addEventListener('pc:member-auth-closed', function () {
      pendingAfterNext = false;
    });

    // Quick Quote 按钮点击事件（必须在 onQuickQuoteClick 函数定义之后绑定）
    document.addEventListener('click', onQuickQuoteClick);
  }

  document.addEventListener('DOMContentLoaded', function () {
    fetchBootstrap();
    wireDrawer();
  });
})();
