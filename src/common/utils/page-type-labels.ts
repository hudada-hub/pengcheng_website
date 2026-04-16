/** 与 `page_stats.page_type` / 前台 `pageViewPageType` 一致，用于后台展示中文名称 */

const PAGE_TYPE_LABEL_ZH: Record<string, string> = {
  home: '首页',
  'invalid-path-not-found': '无效路径（404）',
  'search-results': '站内搜索',
  products: '产品列表页',
  'product-not-found': '产品列表（未找到）',
  'product-detail': '产品详情页',
  solutions: '解决方案列表页',
  'solution-not-found': '解决方案（未找到）',
  'solution-detail': '解决方案详情页',
  'cases-list': '案例列表页',
  'case-not-found': '案例（未找到）',
  'case-detail': '案例详情页',
  news: '新闻列表页',
  'news-not-found': '新闻（未找到）',
  'news-detail': '新闻详情页',
  'activity-calendar': '活动日历列表页',
  'activity-calendar-not-found': '活动日历（未找到）',
  'activity-calendar-detail': '活动日历详情页',
  'about-us': '关于我们',
  service: '服务页',
  download: '资源下载页',
  warranty: '保修说明页',
  'member-center': '用户中心',
  'member-orders': '用户中心-我的订单',
  'member-security': '用户中心-账户安全',
  'join-us': '海外招募',
};

export function pageTypeLabelZh(pageType: string | null | undefined): string {
  const k = (pageType || '').trim();
  if (!k) return '-';
  return PAGE_TYPE_LABEL_ZH[k] ?? k;
}
