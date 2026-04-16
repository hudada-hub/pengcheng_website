本地开发+服务器部署

使用Nestjs开发,开发鹏成官网，这个官网有两套模板，一套国外，包含多语言，一套国内风格的模板
seo，通过/cn 、/en、/jp等来切换多语言
其中多语言数据，是存储在数据库中。

nestjs这个项目，将后台管理系统和前台两套模板的官网，集成在一个项目中，设计好目录结构

- 使用Handlebars模板引擎
- 使用TypeORM
- 使用typescript
- 使用Redis缓存配置表数据，菜单表数据
- 使用nestjs-i18n辅助多语言管理
- 使用MySQL数据库
- 前后端不分离
- seo友好，官网ssr
- docker部署mysql,redis
- 文件上传，使用本地上传
- 使用css3，有一个基本的normalize.css，然后定义主题色，大文本大小等等变量，然后从这些变量里，建立css文件，有commmon.css，网格.css用于自适应，国外theme.css和国内theme.css，后台管理系统theme.css等结构的css,简单的动画效果使用animate.css
- 图标库使用svg
- 复杂的动画特效使用：gsap
- 模板中的js使用vanilla



- 使用csrf保护
- nestjs内核使用fastify，更快
- 后台富文本插件，使用wangeditor
- 部署时：1panel使用pm2部署


- 后台登录权限使用cookie和seesion配合，不使用jwt
# 要求

- 采用响应式布局，确保在PC、平板、手机端均能完美显示，板块间距、字体大小、图片尺寸均自适应
- 后台可独立设置每个页面的SEO标题、关键词、描述，支持自动生成sitemap，并提交至主流搜索引擎
- 中、英、韩、日、意大利语，五种语言有独立配置表，支持后台维护
- 支持文件上传（PDF、Word、Zip等）、分类管理（宣传册、规格书、证书等）、并统计下载次数
- 支持产品分类管理、参数表（可编辑表格）、多图上传、关联解决方案与资料下载
- 图片上传时自动压缩（WebP格式），支持懒加载（Lazy Load），提升页面加载速度
- 前端代码压缩、缓存策略
- 视频采用流媒体加载，使用流媒体播放，204那种响应码，不是加载完整个视频才播放，避免直接加载大文件


后台css样式：
admin-common.css：通用样式，定义按钮样式（普通按钮，提交按钮等按钮），输入框样式，表格样式，选择框，单选框，多选框等样式
admin-theme.css:定义页面中的样式


后台操作：
新增、编辑操作：以弹窗形式操作，使用 `views/admin/partials/modal-form.hbs`，弹窗宽 80%、高 90% 固定；通过 JS 打开并将表单内容注入 `.admin-modal-form-body`
删除：必须确认后再执行，使用 Popconfirm（`public/js/admin-popconfirm.js`），在按钮或链接上增加 `data-popconfirm="确定删除吗？"` 即可
表格交互增强：行悬浮态，有空状态，表格分页使用ajax分页无感应切换数据
表格可以批量删除
提交按钮，加 disabled 和 spinner 防重复提交
分页：pagination.hbs partial（`views/admin/partials/pagination.hbs`），可配合 AJAX 分页使用
图标使用：iconify-icon.min.js
封装二次弹窗
定义 404 页面：后台路径错误时展示 `views/admin/404.hbs`，路由为 `/admin/not-found`（未匹配路径可重定向至此或由异常过滤器渲染）

| 路径                           | 说明            | 权限  |
| ---------------------------- | ------------- | --- |
| `/` `/cn` `/en` `/jp`...     | 官网首页 (自动识别语言) | 公开  |
| `/products` `/solutions`...  | 官网各页面         | 公开  |
| `/sitemap.xml`               | SEO 站点地图      | 公开  |
| `/admin/login`               | 后台登录页         | 公开  |
| `/admin` `/admin/content`... | 后台管理页面        | 需登录 |
| `/admin/api/*`               | 后台数据 API      | 需登录 |


# 使用mcp 配合cursor开发项目
- Framelink MCP for Figma
- chrome-devtools-mcp
- MySQL MCP
- GitHub MCP
- context7


后台管理页面：
登录页：用户名密码登录，默认给出一个用户名和密码，只要对了就能进入后台管理系统了
仪表盘页面：统计产品数量，新闻数量，访客数量，留言数量，产品数量等
导航菜单管理：多语言文字，菜单图片图标，可以无限极分类
产品分类管理
产品详情管理：可以通过产品参数，产品名称筛选，产品参数可以通过excel表格在后台编辑，使用docs.univer.ai，包含seo字段，浏览次数字段，
文件下载管理：文件分类
文件素材管理：文件上传，图片压缩，视频转码m3u8,支持统计下载次数
区块管理：仅仅是文字文本框，图片文字，多图片文字，图片文字链接，多文本图片，多文字多语言，有key作为标识
自定义区块分类：比如首页，关于页，底部页面等
新闻分类管理，
新闻管理:包含seo字段，浏览次数字段
系统设置：邮箱配置，百度普通收录token，google 收录
页面访问量查看：通过页面来查看，每个多语言页面都有对应的次数
订单数据管理：
客户留言管理：
供应商入口管理：
活动日历管理：：
解决方案管理：标题，图片，全文，分类，包含seo字段，浏览次数字段
系统配置表：比如ai key

数据库备份和恢复功能

管理布局头部，右侧有退出登录和清除缓存功能，清除缓存用于清除redis数据，redis数据过期时间默认7天


前台有页面访问次数接口埋点，通过用户的ip，如果短时间内多次刷新视为访问次数加1


多语言使用ai进行自动翻译填充





前台官网：图片懒加载




通用的多语言：多语言表，比如zh/jp,en等配置
然后比如新闻多语言，先填好中文的，然后点击复制，选择语言，使用ai进行数据翻译，形成其他的语言版本
有字段，newsId,一个表里可以有多个相同的，然后langType不同，使用多语言表的langId



配置表格，操作添加一个叫一键翻译多语言功能
点击一键翻译，则弹窗，选择英文翻译，日文翻译，西班牙翻译等等
具体出现几种语言，可以通过lang表里的id和config表里的configId来判断，缺几种语言就补几种语言
还可以一键补充缺失的所有语言

我发现缺失了configId的字段，表字段进行添加下
configId不是唯一的，比如key为xxx的配置，id可能为1,2,3,4，但configId都是1，对应的langId为1,2,3,4等，这只是一个例子让你明白这个字段的含义的，configId作用是通过这个id和langId确定某一个语言的的具体配置
根据中文的来翻译其他语言的
使用deepseek翻译，apikey从system_config表中的name为deepseek apikey的value字段里取

将content里的json文件，比如content字段里的：[{"url": "", "title": "测试文字1", "content": "你好，我看看内容", "pic1Url": "/uploads/202603/1772871899784-6eac567c5b079d81.jpg", "pic2Url": "", "description": "你好，我看看翻译功能"}, {"url": "", "title": "桌子太乱了", "content": "清理干净就好了", "pic1Url": "/uploads/202603/1772778637239-c9b8fea029890898.png", "pic2Url": "", "description": "可以清理一下"}]
可以翻译content字段里的json字段，title,content，description字段里的文字
可以翻译多种文字，还可以翻译config表里的title,description字段
如果deletable为true,则表格的右侧添加一个删除按钮
langId为对应的语言
langId对应lang表里的id



crm系统对接：表单使用api接口，通过apikey的方式来确定权限，
有个生成apikey的接口，外部接口通过这个apikey来获取表单数据





数据表设计：


所有表默认使用status字段，0为隐藏，1为正常；**业务删除为物理删除（从库中删行），无回收站**。枚举中可仍保留 `-1` 表示历史软删数据；新删除路径不再写入 `-1`。列表与前台查询仍按 `status` 过滤正常/隐藏。所有表都有创建时间、更新时间、`status` 字段。
如果出现seo参数：则补充seo参数字段，描述，关键词


多语言表：
id,
名称：比如中文/英文/意大利语/日语等
编码：zh/jp/en
是否默认：
状态：
创建时间
语言图标url:



菜单表：
id,
menuId,可以相同
名称：
status：
parentId,用作无限极分类
langId,
menuPicUrl,菜单对应图片链接
linkUrl:跳转链接
bannerUrl
banner标题
banner描述
seo参数


文件素材分类表：
id,
name,


文件素材表：
id,
文件名
文件路径
文件类型
文件大小
文件上传时间
文件分类id：比如首页文件，图标文件，视频文件等




区块分类表：
id,
name：比如常规文字语言，网站的seo文字，更多，查看更多等文字，比如轮播图，合作伙伴，优势价值

配置表：
id,
name:配置文字说明
title:大标题
description:描述，不是必填
key：使用这个key来获取内容，在表里不唯一，和langId配合
背景图：不是必填
isArray:是否是数组形式,content的json是否是数组格式，如果为true,代表有新增按钮，对content新增
type:
1-单条文字文本框，比如网站标题，电话，地址，邮箱等，选择这个，代表有个文本域
2- 单个图片1，代表有个文件上传
3- 图片1+标题：代表有个输入框和文件上传
4- 图片1+链接：代表有文件上传和可以输入链接的输入框
5- 标题+内容+图片1：代表有个输入框+文本域+文件上传
6- 图片1+标题+链接：比如合作伙伴，代表有输入框+文件上传+可以输入链接的输入框
7- 图片1+图片2+标题+链接，代表有输入框+可以输入链接的输入框+文件上传+文件上传表单
8- 标题+内容+描述+图片1：代表有输入框+文本域+文本域+文件上传
9- 图片1+图片2+标题：代表有文件上传+文件上传+输入框
10- 标题+描述：代表有输入框+文本域
content:内容，json格式，有字段title,description,url,pic1Url,pic2Url,content，将上面的输入框或者文本域或者可以输入链接的输入框或者文件上传的上传链接放入title,description,url,pic1Url,pic2Url,content
langId:多语言
linkUrl:链接地址
是否可删除：开发阶段默认true，可以删除，生产阶段默认false，不可删除



解决方案分类表：
id,
解决方案分类id,可以有多个相同的id，配置langId
title
seo参数



langId

解决方案表：
id,
解决方案id，可以有多个相同的id，配置langId
title,
content,
langId
bannerBgUrl,
bannerTitle
bannerDesc,
kehuBannerUrl:客户价值banner图，图片文件上传
kehu:[{title1,content1},{title2,content2}],数组json格式，可以新增多个组，标题输入框和内容文本域
hangye:行业应用案例，数组，//行业功能暂时不做
seo参数
访问次数


行业应用案例表：
id,
行业应用案例id，可以有多个相同的id，配置langId
sort,
是否置顶
标题：
content:富文本
缩略图:
bannerUrl:banner图文件
标签：可以多个标签，比如行业，地区，产品线
关联的解决方案ids:可以多个解决方案
关联的行业应用的ids:
langId
seo参数
访问次数

产品分类表：
id,
产品分类id，不唯一，和langId配合
分类名
langId
banner
seo等参数
sort


产品参数表：
id,
产品参数id，不唯一，和langId配合
title: 参数名称/标题
content: 参数内容说明
type: 参数类型，如电容、电压等
langId
sort: 排序
status、created_at、updated_at（所有表默认）

产品表：
id,
产品id,可以多个
langid
所属产品的参数：可以选择多个
产品名称
产品详情标题（可选，`detail_title`：官网详情页主标题，留空则用产品名称；列表仍用产品名称）
产品缩略图
产品主图url:json数组形式，多个图片
产品型号
产品特点：多个文字，json数组格式
核心参数：2-3个核心参数，json数组形式
产品简要优势说明：文字
banner图片：
产品参数：json格式，后台管理系统使用excel编辑参数,对象数组格式：[{
    title:xx1参数
    data:具体参数
}]
产品优势一句话概述：
具体优势：可能有多个，具体限制多少个优势，json数组格式：[
    {
        title:'',
        description:描述，多句话，使用\n分割
        picUrl:图片
    }
]

seo参数
访问次数
产品认证：数组格式，[1,2,3]1代表UN38.3，2和3待定



资源下载类型表：
id
资源下载分类id,可以多个，
分类名称
langid
parentId,无限极分类
seo参数
sort

资源下载产品系列表：
id
系列名称



资源下载表：
id,
资源下载id
资源类型id
产品系列id
文件名
文件类型
产品类型
语言
下载地址
下载次数



新闻分类表：
id,
新闻分类id，不唯一，和langId配合
type:1为新闻类型，2为活动日历类型
langid
banner
seo等参数
sort

新闻表：
id,
新闻id，不唯一，和langId配合
langid
新闻标题
新闻内容
发布时间
阅读次数
缩略图
内容摘要


活动日历表：
id
活动日历id,
缩略图
日期
标题
地点
url,访问活动页面
访问次数
langId


联系我们表：
姓名
标题
公司名称
手机号
电子邮箱
留下的消息
所属国家：/cn,/ja,/en等


购物车表：用于询价表单
id
产品ids
email
phone
所属国家：比如/cn,/jp


海外招募表：
id
招募id,不唯一
公司名称
langId
产品资质文件：可以上传多个,json数组格式[{fileName:,fileUrl,}],限制200M
所属国家：比如/cn,/jp

系统配置表：用于配置发件人邮箱的smtp,deepseek的apikey等
id:
名称
提示
值
type:1数字，2字符串，3是否，4日期，
是否可删除，默认不可删除



页面访问次数统计：
id:
langId:
pageType:比如首页，关于我们页面，保修页面
访问次数
最新访问时间






后台管理页面风格：
- 不要有阴影
- 向ant design风格靠近

## 数据库增量脚本

- `sql/add_product_detail_title.sql`：为 `product` 表增加 `detail_title`（产品详情标题）字段，部署后请执行。
- `sql/2026-04-02-member-cart-inquiry.sql`：购物车询价订单（UUID）、行绑定 `inquiry_order_uuid`、`member_cart_inquiry` 表、`contact_message.inquiry_order_uuid`，并解除 `member_cart_item` 上原「同车同 product」唯一索引；部署后请执行。


docker login docker.cnb.cool -u cnb -p 

改逻辑，当前购物车，需要登录后才能添加购物车
并且每次添加一个产品，都需要在后台表里添加这个购物车数据
可以删除购物车的某个产品，删除使用接口删除
新增购物车产品用接口新增

表设计：
一个是购物车产品表，包含产品id,userid等
还有一个询价表单表，可以和购物车表单表进行关联

抽屉里的产品数据，通过cookie，每次打开，都需要请求接口数据来展示

购物车列表接口包含：用户id,产品id,产品缩略图，产品所属的分类名称，产品标题
产品的属性：包含属性分类，属性值

并且需要属性列表接口，可以从属性分类中select选择属性，进而通过产品表的产品属性和产品分类id，进行选择产品，选择后，通过接口获取这个产品，来替换当前的购物车的这个产品，同时更新购物车产品表


询价表单，用户id字段和所关联的订单

还需要有个购物车订单表，购物车id,是uuid，必须有userId，每次点击购物车的next按钮，则生成一个订单记录，然后对购物车产品表的一个字段叫购物车id进行更新