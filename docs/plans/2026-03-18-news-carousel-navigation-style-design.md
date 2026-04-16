# 新闻轮播导航按钮样式设计

## 概述

将新闻轮播的左右切换箭头按钮修改为圆形白色背景 + 黑色箭头的样式。

## 需求

1. 宽高 48px，圆形
2. 白色背景
3. 黑色左右箭头
4. 保持左箭头初始隐藏、滑动后显示的逻辑

## 方案

使用 Swiper 默认伪元素箭头，通过 CSS 自定义样式。

## 设计详情

### CSS 样式

```css
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

### 设计要点

| 属性 | 值 | 说明 |
|------|-----|------|
| 尺寸 | 48px × 48px | 正方形 |
| 圆角 | 50% | 完美圆形 |
| 背景色 | #fff | 白色 |
| 箭头颜色 | #000 | 黑色 |
| 阴影 | 0 2px 8px rgba(0,0,0,0.15) | 轻微投影 |
| Hover 背景 | #f0f0f0 | 浅灰色 |
| Hover 缩放 | scale(1.05) | 轻微放大 |
| 箭头大小 | 24px | Swiper 伪元素字体大小 |

### 交互效果

1. **初始状态**：
   - 左箭头：隐藏（opacity: 0, visibility: hidden）
   - 右箭头：显示

2. **滑动后**：
   - 滑动到第二个 slide 时，左箭头淡入显示
   - 返回第一个 slide 时，左箭头淡出隐藏

3. **Hover 效果**：
   - 背景变浅灰色
   - 按钮轻微放大 5%
   - 过渡时间 0.3s

## 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `public/css/global/home-global.css` | 修改 `.g-news__prev` 和 `.g-news__next` 样式 |

## 用户视觉体验

```
圆形白色按钮，黑色箭头
  ↓
鼠标悬停 → 按钮变深灰，轻微放大
  ↓
点击 → 轮播切换
```
