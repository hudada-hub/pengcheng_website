# 新闻轮播不等宽设计

## 概述

在 News & Events 区块实现不等宽的新闻轮播效果，第一个新闻卡片宽度是第二个的 2 倍，初始只显示右滑动箭头。

## 需求

1. 显示两个新闻卡片
2. 第一个卡片宽度是第二个的 2 倍（2:1 比例）
3. 初始状态只显示右滑动箭头
4. 滑动到第二个卡片时才出现左滑动箭头
5. 响应式：移动端可能只显示 1 个 slide

## 方案

使用 Swiper 的 `slidesPerView: 'auto'` + 自定义 CSS 宽度控制。

## 设计详情

### 1. 布局结构

**容器布局**：
- 左侧新闻轮播区：占约 2/3 宽度
- 右侧活动区：占约 1/3 宽度

**新闻轮播**：
- 使用 `slidesPerView: 'auto'`
- 第一个 slide 宽度 ≈ 67%（容器宽度的 2/3）
- 第二个 slide 宽度 ≈ 33%（容器宽度的 1/3）

### 2. 导航箭头逻辑

**初始状态**：
- 隐藏左箭头（`.swiper-button-prev`）
- 显示右箭头（`.swiper-button-next`）

**滑动后**：
- 监听 Swiper 的 `slideChange` 事件
- 当 `activeIndex > 0` 时，显示左箭头
- 当 `activeIndex === 0` 时，隐藏左箭头

### 3. CSS 样式

```css
/* 初始隐藏左箭头 */
.g-news__prev {
  opacity: 0;
  visibility: hidden;
}

/* 显示状态 */
.g-news__prev.show {
  opacity: 1;
  visibility: visible;
}

/* 响应式：移动端调整宽度比例 */
@media (max-width: 768px) {
  .g-news__slide:nth-child(odd) {
    width: 80%;
  }
  .g-news__slide:nth-child(even) {
    width: 80%;
  }
}
```

### 4. JavaScript 逻辑

```javascript
var newsSwiper = new Swiper('.g-news__swiper', {
  slidesPerView: 'auto',
  on: {
    init: function() {
      updateNavigation(this);
    },
    slideChange: function() {
      updateNavigation(this);
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

## 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `views/website/global/partials/home/news-events.hbs` | 修改 Swiper 配置，添加导航箭头控制逻辑 |
| `public/css/global/home-global.css` | 添加左箭头隐藏/显示样式，slide 宽度控制 |

## 用户交互

```
1. 页面加载时，只显示右箭头
2. 点击右箭头或自动轮播到第二个新闻
3. 左箭头淡入显示
4. 点击左箭头返回第一个新闻
5. 左箭头淡出隐藏
```

## 响应式断点

- **≥1200px**: 第一个 67%，第二个 33%
- **768px-1199px**: 第一个 70%，第二个 70%（部分显示下一个）
- **<768px**: 单个 100% 宽度
