/**
 * 从表单提交的 returnUrl（完整 URL）解析出 pathname+search，仅允许 /admin 路径，否则返回 defaultPath。
 * 用于保存后按当前列表页 URL 刷新（reload），不跳转到其他页。
 */
export function getReturnPath(
  returnUrl: string | undefined,
  defaultPath: string,
): string {
  if (!returnUrl || typeof returnUrl !== 'string') return defaultPath;
  try {
    const u = new URL(returnUrl);
    if (u.pathname.startsWith('/admin')) return u.pathname + u.search;
  } catch {
    // ignore
  }
  return defaultPath;
}
