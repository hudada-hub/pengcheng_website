# 产品列表页实现说明

## 文件结构2

```
views/website/
├── global/
│   ├── products.hbs                      # 主页面模板
│   └── partials/products/
│       ├── banner.hbs                    # Banner 区域
│       ├── breadcrumb.hbs                # 面包屑导航
│       ├── category-sidebar.hbs          # 左侧分类导航
│       └── product-list.hbs              # 产品列表
├── cn/
│   └── products.hbs                      # 中文版产品列表页

public/
├── css/global/
│   └── products-global.css               # 产品页样式
└── js/
    └── products.js                       # 产品页交互逻辑

src/modules/website/
└── home.controller.ts                    # 添加产品列表路由
```

## 功能特性

### 1. 响应式布局
- **桌面端**: 3 列产品网格
- **平板端**: 2 列产品网格
- **移动端**: 1 列产品网格

### 2. 左侧分类导航
- 支持多级分类树
- 复选框筛选（可扩展 AJAX 筛选）
- 分类展开/收起动画
- 移动端折叠/展开
- 单选导航（点击分类跳转到新 URL）

### 3. 产品卡片
- 图片悬浮放大效果
- 三标签切换（Images / Description / Specifications）
- 规格参数展示
- 悬浮时显示黄色"Get a Quote"按钮
- 卡片悬浮动画

### 4. 多语言支持
- 支持中文、英文、日文等
- 面包屑导航多语言
- 分类标题多语言
- Banner 标题多语言

### 5. SEO 优化
- 语义化 HTML 标签
- 面包屑导航结构化
- Meta 描述和关键词
- 图片懒加载

## 路由

```
/products                     # 英文产品列表页
/cn/products                  # 中文产品列表页
/en/products                  # 英文产品列表页（同 /products）
/jp/products                  # 日文产品列表页
```

## 数据接口

### 后端需要提供的数据

#### 1. 分类树 (`categoryTree`)
```json
[
  {
    "id": 1,
    "title": "Forklift Battery",
    "url": "/products/forklift-battery",
    "selected": true,
    "active": true,
    "children": [
      {
        "id": 11,
        "title": "24V Forklift LiFePO4 Battery",
        "url": "/products/forklift-battery/24v",
        "selected": false,
        "active": false
      }
    ]
  }
]
```

#### 2. 产品列表 (`products`)
```json
[
  {
    "id": 1,
    "title": "24V Forklift LiFePO4 Battery",
    "model": "PC-FL-24V",
    "url": "/products/24v-forklift-lifepo4-battery",
    "picUrl": "/images/products/24v-forklift.jpg",
    "coreParams": [
      { "label": "Nominal Voltage", "value": "25.76V" },
      { "label": "Nominal Capacity", "value": "173Ah - 684Ah" }
    ]
  }
]
```

## 待完善功能

### 1. 数据库集成
- [ ] 创建 `ProductCategory` 实体表
- [ ] 创建 `Product` 实体表
- [ ] 实现 `buildCategoryTree()` 方法从数据库获取
- [ ] 实现 `buildProductsList()` 方法从数据库获取
- [ ] 添加分页支持

### 2. 筛选功能
- [ ] 复选框筛选 AJAX 实现
- [ ] URL 参数筛选（如 `?category=1&voltage=24v`）
- [ ] 价格范围筛选
- [ ] 排序功能（按价格、按名称等）

### 3. 搜索功能
- [ ] 产品搜索框
- [ ] 全文搜索
- [ ] 搜索建议

### 4. 图片资源
- [ ] 添加 Banner 背景图 `/images/products/banner-bg.jpg`
- [ ] 添加产品示例图片

## 样式定制

### 主题色修改
在 `products-global.css` 中修改 CSS 变量：
```css
:root {
  --color01: #f89d1b;  /* 橙色主色 */
  --color02: #424558;  /* 深蓝灰色 */
}
```

### 网格列数调整
修改 `.g-products-list__grid`:
```css
.g-products-list__grid {
  grid-template-columns: repeat(3, 1fr); /* 改为 2 或 4 */
}
```

## 交互说明

### 分类导航交互
1. 点击分类复选框：触发筛选（目前仅控制台输出）
2. 点击分类链接：跳转到对应分类页面
3. 点击展开箭头：展开/收起子分类
4. 移动端点击切换按钮：展开/收起整个分类列表

### 产品卡片交互
1. 悬浮卡片：卡片上浮、阴影加深、图片放大
2. 点击标签：切换显示内容（Images/Description/Specifications）
3. 悬浮按钮：从底部滑出黄色"Get a Quote"按钮
4. 点击产品：跳转到产品详情页

## 动画效果

### WOW.js 滚动动画
产品卡片在滚动时依次淡入上浮

### CSS 过渡动画
- 卡片悬浮过渡
- 按钮滑出动画
- 分类展开/收起
- 标签切换下划线

## 测试清单

- [x] 桌面端布局（1920px, 1440px, 1024px）
- [x] 平板端布局（768px）
- [x] 移动端布局（375px）
- [ ] 多语言切换测试
- [ ] 分类展开/收起测试
- [ ] 标签切换测试
- [ ] 悬浮效果测试
- [ ] 路由跳转测试

## 下一步计划

1. **数据库对接**: 创建实体表，实现 CRUD
2. **后台管理**: 添加产品分类和产品管理界面
3. **图片上传**: 实现产品图片上传功能
4. **SEO 优化**: 添加产品详情页
5. **性能优化**: 图片懒加载、分页加载
6. **统计分析**: 添加产品浏览次数统计
