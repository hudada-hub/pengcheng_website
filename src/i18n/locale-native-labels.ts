/**
 * 语言代码 → 该语言自称（用于前台语言切换展示）
 */
const LOCALE_NATIVE_LABELS: Record<string, string> = {
  en: 'English',
  zh: '简体中文',
  cn: '简体中文',
  'zh-cn': '简体中文',
  'zh-hans': '简体中文',
  tw: '繁體中文',
  'zh-tw': '繁體中文',
  'zh-hant': '繁體中文',
  jp: '日本語',
  ja: '日本語',
  ko: '한국어',
  kr: '한국어',
  it: 'Italiano',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  ru: 'Русский',
  ar: 'العربية',
  vi: 'Tiếng Việt',
  th: 'ไทย',
};

export function getLocaleNativeLabel(code: string): string {
  if (code == null || typeof code !== 'string') return '';
  const c = code.trim().toLowerCase().replace(/_/g, '-');
  if (LOCALE_NATIVE_LABELS[c]) return LOCALE_NATIVE_LABELS[c];
  const primary = c.split('-')[0];
  if (primary && LOCALE_NATIVE_LABELS[primary])
    return LOCALE_NATIVE_LABELS[primary];
  return code.trim();
}
