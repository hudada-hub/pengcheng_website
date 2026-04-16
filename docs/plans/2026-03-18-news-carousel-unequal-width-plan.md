# 新闻轮播不等宽实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现不等宽新闻轮播，第一个卡片宽度是第二个的 2 倍，初始只显示右箭头。

**Architecture:** 使用 Swiper 的 `slidesPerView: 'auto'` 模式，通过 CSS 控制每个 slide 的宽度，JavaScript 监听滑动事件动态控制左箭头显示。

**Tech Stack:** Swiper.js, CSS, Vanilla JavaScript

---

## Task 1: 修改 CSS 样式

**Files:**
- Modify: `public/css/global/home-global.css`

**Step 1: 添加左箭头初始隐藏样式**

在 `.g-news__prev` 相关样式后添加：

```css
/* 新闻轮播左箭头初始隐藏 */
.g-news__prev {
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease, visibility 0.3s ease;
}

.g-news__prev.show {
  opacity: 1;
  visibility: visible;
}
```

**Step 2: 添加 slide 宽度控制**

在新闻轮播相关样式中添加：

```css
/* 新闻轮播不等宽 slide */
.g-news__slide:nth-child(odd) {
  width: 67%;
}

.g-news__slide:nth-child(even) {
  width: 33%;
}

/* 响应式调整 */
@media (max-width: 1199px) {
  .g-news__slide:nth-child(odd) {
    width: 70%;
  }
  .g-news__slide:nth-child(even) {
    width: 70%;
  }
}

@media (max-width: 767px) {
  .g-news__slide:nth-child(odd),
  .g-news__slide:nth-child(even) {
    width: 100%;
  }
}
```

**Step 3: Commit**

```bash
git add public/css/global/home-global.css
git commit -m "style(news-carousel): add unequal width slide styles"
```

---

## Task 2: 修改 Swiper 配置

**Files:**
- Modify: `views/website/global/partials/home/news-events.hbs`

**Step 1: 修改 Swiper 配置**

找到新闻轮播初始化代码（约第 130 行），修改为：

```javascript
var newsSwiper = new Swiper('.g-news__swiper', {
  slidesPerView: 'auto',
  spaceBetween: 20,
  loop: {{#if (gt newsList.length 1)}}true{{else}}false{{/if}},
  autoplay: {
    delay: 4000,
    disableOnInteraction: false,
  },
  pagination: {
    el: '.g-news__pagination',
    clickable: true,
    bulletClass: 'swiper-pagination-bullet',
    bulletActiveClass: 'swiper-pagination-bullet-active',
    dynamicBullets: {{#if (gt newsList.length 5)}}true{{else}}false{{/if}},
    dynamicMainBullets: 5,
  },
  navigation: {
    nextEl: '.g-news__next',
    prevEl: '.g-news__prev',
  },
  on: {
    init: function() {
      updateNavigation(this);
    },
    slideChange: function() {
      updateNavigation(this);
    }
  },
  breakpoints: {
    768: {
      slidesPerView: 'auto',
      spaceBetween: 20,
    },
    1200: {
      slidesPerView: 'auto',
      spaceBetween: 20,
    }
  }
});

function updateNavigation(swiper) {
  var prevBtn = document.querySelector('.g-news__prev');
  if (prevBtn) {
    if (swiper.activeIndex > 0) {
      prevBtn.classList.add('show');
    } else {
      prevBtn.classList.remove('show');
    }
  }
}
```

**Step 2: Commit**

```bash
git add views/website/global/partials/home/news-events.hbs
git commit -m "feat(news-carousel): implement unequal width carousel with dynamic navigation"
```

---

## Task 3: 验证测试

**Step 1: 编译验证**

运行: `npm run build`
预期: 编译成功，无错误

**Step 2: 功能测试**

1. 启动开发服务器
2. 访问首页
3. 验证新闻轮播：
   - 第一个卡片宽度约为第二个的 2 倍
   - 初始只显示右箭头
   - 滑动到第二个卡片时左箭头出现
   - 点击左箭头返回时左箭头消失
4. 响应式测试：调整浏览器宽度验证不同断点下的显示效果

**Step 3: 最终 Commit**

```bash
git add -A
git commit -m "feat(news-carousel): complete unequal width implementation"
```

---

## 参考实现

- Swiper 官方文档: https://swiperjs.com/swiper-api#param-slidesPerView
- `slidesPerView: 'auto'` 模式允许通过 CSS 控制每个 slide 的宽度
