# 新闻轮播导航按钮样式实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将新闻轮播导航按钮修改为圆形白色背景 + 黑色箭头样式。

**Architecture:** 纯 CSS 修改，保持 HTML 结构不变，使用 Swiper 默认伪元素箭头。

**Tech Stack:** CSS

---

## Task 1: 修改 CSS 样式

**Files:**
- Modify: `public/css/global/home-global.css`

**Step 1: 修改导航按钮样式**

找到 `.g-news__prev, .g-news__next` 相关样式（约第 916 行），替换为：

```css
/* News Swiper 导航按钮 */
.g-news__prev,
.g-news__next {
  width: 48px;
  height: 48px;
  background: #fff;
  border-radius: 50%;
  color: #000;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  transition: background 0.3s ease, opacity 0.3s ease, visibility 0.3s ease, transform 0.2s ease;
  top: 50%;
  margin-top: -24px; /* height/2 */
}

.g-news__prev {
  left: 20px;
  opacity: 0;
  visibility: hidden;
}

.g-news__prev.show {
  opacity: 1;
  visibility: visible;
}

.g-news__next {
  right: 20px;
}

.g-news__prev:hover,
.g-news__next:hover {
  background: #f0f0f0;
  transform: scale(1.05);
}

.g-news__prev::after,
.g-news__next::after {
  font-size: 24px;
  font-weight: 600;
  color: #000;
}
```

**关键点：**
- `width: 48px; height: 48px;` - 正方形尺寸
- `border-radius: 50%;` - 圆形
- `background: #fff;` - 白色背景
- `color: #000;` - 黑色箭头
- `margin-top: -24px;` - 垂直居中（height/2）
- `box-shadow` - 轻微投影
- `transform: scale(1.05);` - Hover 放大效果

**Step 2: 验证编译**

运行: `npm run build`
预期: 编译成功，无错误

**Step 3: Commit**

```bash
git add public/css/global/home-global.css
git commit -m "style(news-carousel): update navigation buttons to circular white style"
```

---

## Task 2: 验证测试

**Step 1: 启动开发服务器**

运行: `npm run start:dev`

**Step 2: 视觉验证**

1. 访问首页新闻轮播区域
2. 验证按钮样式：
   - ✅ 圆形，48px × 48px
   - ✅ 白色背景
   - ✅ 黑色箭头
   - ✅ 垂直居中对齐
3. 验证交互：
   - ✅ 初始只显示右箭头
   - ✅ 滑动后左箭头显示
   - ✅ Hover 时背景变深灰
   - ✅ Hover 时轻微放大

**Step 3: 最终 Commit**

```bash
git add -A
git commit -m "style(news-carousel): complete circular navigation buttons"
```

---

## 参考设计

- 设计文档：`docs/plans/2026-03-18-news-carousel-navigation-style-design.md`
- 原始需求：圆形白色背景 + 黑色箭头，宽高 48px
