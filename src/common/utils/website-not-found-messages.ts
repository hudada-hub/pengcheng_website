/** 通用 404（无匹配路由、无效单段路径等） */
export type GenericNotFoundCopy = {
  title: string;
  notFoundHint: string;
  notFoundBackLabel: string;
};

const GENERIC: Record<string, GenericNotFoundCopy> = {
  cn: {
    title: '页面未找到',
    notFoundHint: '您访问的页面不存在。',
    notFoundBackLabel: '返回首页',
  },
  zh: {
    title: '页面未找到',
    notFoundHint: '您访问的页面不存在。',
    notFoundBackLabel: '返回首页',
  },
  en: {
    title: 'Page not found',
    notFoundHint: 'The page you are looking for does not exist.',
    notFoundBackLabel: 'Back to home',
  },
  jp: {
    title: 'ページが見つかりません',
    notFoundHint: 'お探しのページは存在しません。',
    notFoundBackLabel: 'ホームに戻る',
  },
  ja: {
    title: 'ページが見つかりません',
    notFoundHint: 'お探しのページは存在しません。',
    notFoundBackLabel: 'ホームに戻る',
  },
  kr: {
    title: '페이지를 찾을 수 없습니다',
    notFoundHint: '요청하신 페이지가 존재하지 않습니다.',
    notFoundBackLabel: '홈으로',
  },
  ko: {
    title: '페이지를 찾을 수 없습니다',
    notFoundHint: '요청하신 페이지가 존재하지 않습니다.',
    notFoundBackLabel: '홈으로',
  },
  es: {
    title: 'Página no encontrada',
    notFoundHint: 'La página que busca no existe.',
    notFoundBackLabel: 'Volver al inicio',
  },
  it: {
    title: 'Pagina non trovata',
    notFoundHint: 'La pagina che stai cercando non esiste.',
    notFoundBackLabel: 'Torna alla home',
  },
  fr: {
    title: 'Page introuvable',
    notFoundHint: "La page que vous recherchez n'existe pas.",
    notFoundBackLabel: "Retour à l'accueil",
  },
  de: {
    title: 'Seite nicht gefunden',
    notFoundHint: 'Die angeforderte Seite existiert nicht.',
    notFoundBackLabel: 'Zur Startseite',
  },
  pt: {
    title: 'Página não encontrada',
    notFoundHint: 'A página que você procura não existe.',
    notFoundBackLabel: 'Voltar ao início',
  },
  ru: {
    title: 'Страница не найдена',
    notFoundHint: 'Запрашиваемая страница не существует.',
    notFoundBackLabel: 'На главную',
  },
};

export function getGenericNotFoundMessages(
  langCode: string,
): GenericNotFoundCopy {
  const c = (langCode || 'en').toLowerCase();
  return GENERIC[c] ?? GENERIC.en;
}

export type ResourceNotFoundCopy = {
  title: string;
  hint: string;
  back: string;
};

type ResourceKind = 'product' | 'news' | 'solution' | 'case' | 'activity';

const RESOURCE: Record<ResourceKind, Record<string, ResourceNotFoundCopy>> = {
  product: {
    cn: {
      title: '产品未找到',
      hint: '该产品不存在或已下架。',
      back: '返回产品列表',
    },
    zh: {
      title: '产品未找到',
      hint: '该产品不存在或已下架。',
      back: '返回产品列表',
    },
    en: {
      title: 'Product not found',
      hint: 'This product is not available.',
      back: 'Back to products',
    },
    jp: {
      title: '製品が見つかりません',
      hint: 'この製品は存在しないか、販売終了しています。',
      back: '製品一覧へ',
    },
    ja: {
      title: '製品が見つかりません',
      hint: 'この製品は存在しないか、販売終了しています。',
      back: '製品一覧へ',
    },
    kr: {
      title: '제품을 찾을 수 없습니다',
      hint: '해당 제품을 사용할 수 없습니다.',
      back: '제품 목록으로',
    },
    ko: {
      title: '제품을 찾을 수 없습니다',
      hint: '해당 제품을 사용할 수 없습니다.',
      back: '제품 목록으로',
    },
    es: {
      title: 'Producto no encontrado',
      hint: 'Este producto no está disponible.',
      back: 'Volver a productos',
    },
    it: {
      title: 'Prodotto non trovato',
      hint: 'Questo prodotto non è disponibile.',
      back: 'Torna ai prodotti',
    },
    fr: {
      title: 'Produit introuvable',
      hint: "Ce produit n'est pas disponible.",
      back: 'Retour aux produits',
    },
    de: {
      title: 'Produkt nicht gefunden',
      hint: 'Dieses Produkt ist nicht verfügbar.',
      back: 'Zurück zu den Produkten',
    },
    pt: {
      title: 'Produto não encontrado',
      hint: 'Este produto não está disponível.',
      back: 'Voltar aos produtos',
    },
    ru: {
      title: 'Продукт не найден',
      hint: 'Этот продукт недоступен.',
      back: 'К списку продуктов',
    },
  },
  news: {
    cn: {
      title: '新闻未找到',
      hint: '该新闻不存在或已下架。',
      back: '返回新闻列表',
    },
    zh: {
      title: '新闻未找到',
      hint: '该新闻不存在或已下架。',
      back: '返回新闻列表',
    },
    en: {
      title: 'News not found',
      hint: 'This article is not available.',
      back: 'Back to news',
    },
    jp: {
      title: 'ニュースが見つかりません',
      hint: 'この記事は存在しないか、公開終了しています。',
      back: 'ニュース一覧へ',
    },
    ja: {
      title: 'ニュースが見つかりません',
      hint: 'この記事は存在しないか、公開終了しています。',
      back: 'ニュース一覧へ',
    },
    kr: {
      title: '뉴스를 찾을 수 없습니다',
      hint: '해당 기사를 이용할 수 없습니다.',
      back: '뉴스 목록으로',
    },
    ko: {
      title: '뉴스를 찾을 수 없습니다',
      hint: '해당 기사를 이용할 수 없습니다.',
      back: '뉴스 목록으로',
    },
    es: {
      title: 'Noticia no encontrada',
      hint: 'Este artículo no está disponible.',
      back: 'Volver a noticias',
    },
    it: {
      title: 'Notizia non trovata',
      hint: 'Questo articolo non è disponibile.',
      back: 'Torna alle notizie',
    },
    fr: {
      title: 'Actualité introuvable',
      hint: "Cet article n'est pas disponible.",
      back: 'Retour aux actualités',
    },
    de: {
      title: 'News nicht gefunden',
      hint: 'Dieser Artikel ist nicht verfügbar.',
      back: 'Zurück zu den News',
    },
    pt: {
      title: 'Notícia não encontrada',
      hint: 'Este artigo não está disponível.',
      back: 'Voltar às notícias',
    },
    ru: {
      title: 'Новость не найдена',
      hint: 'Эта статья недоступна.',
      back: 'К списку новостей',
    },
  },
  solution: {
    cn: {
      title: '方案未找到',
      hint: '该方案不存在或已下架。',
      back: '返回方案列表',
    },
    zh: {
      title: '方案未找到',
      hint: '该方案不存在或已下架。',
      back: '返回方案列表',
    },
    en: {
      title: 'Solution not found',
      hint: 'This solution is not available.',
      back: 'Back to solutions',
    },
    jp: {
      title: 'ソリューションが見つかりません',
      hint: 'このソリューションは存在しないか、公開終了しています。',
      back: 'ソリューション一覧へ',
    },
    ja: {
      title: 'ソリューションが見つかりません',
      hint: 'このソリューションは存在しないか、公開終了しています。',
      back: 'ソリューション一覧へ',
    },
    kr: {
      title: '솔루션을 찾을 수 없습니다',
      hint: '해당 솔루션을 이용할 수 없습니다.',
      back: '솔루션 목록으로',
    },
    ko: {
      title: '솔루션을 찾을 수 없습니다',
      hint: '해당 솔루션을 이용할 수 없습니다.',
      back: '솔루션 목록으로',
    },
    es: {
      title: 'Solución no encontrada',
      hint: 'Esta solución no está disponible.',
      back: 'Volver a soluciones',
    },
    it: {
      title: 'Soluzione non trovata',
      hint: 'Questa soluzione non è disponibile.',
      back: 'Torna alle soluzioni',
    },
    fr: {
      title: 'Solution introuvable',
      hint: "Cette solution n'est pas disponible.",
      back: 'Retour aux solutions',
    },
    de: {
      title: 'Lösung nicht gefunden',
      hint: 'Diese Lösung ist nicht verfügbar.',
      back: 'Zurück zu den Lösungen',
    },
    pt: {
      title: 'Solução não encontrada',
      hint: 'Esta solução não está disponível.',
      back: 'Voltar às soluções',
    },
    ru: {
      title: 'Решение не найдено',
      hint: 'Это решение недоступно.',
      back: 'К списку решений',
    },
  },
  case: {
    cn: {
      title: '案例未找到',
      hint: '该案例不存在或已下架。',
      back: '返回案例列表',
    },
    zh: {
      title: '案例未找到',
      hint: '该案例不存在或已下架。',
      back: '返回案例列表',
    },
    en: {
      title: 'Case not found',
      hint: 'This case is not available.',
      back: 'Back to cases',
    },
    jp: {
      title: '事例が見つかりません',
      hint: 'この事例は存在しないか、公開終了しています。',
      back: '事例一覧へ',
    },
    ja: {
      title: '事例が見つかりません',
      hint: 'この事例は存在しないか、公開終了しています。',
      back: '事例一覧へ',
    },
    kr: {
      title: '사례를 찾을 수 없습니다',
      hint: '해당 사례를 이용할 수 없습니다.',
      back: '사례 목록으로',
    },
    ko: {
      title: '사례를 찾을 수 없습니다',
      hint: '해당 사례를 이용할 수 없습니다.',
      back: '사례 목록으로',
    },
    es: {
      title: 'Caso no encontrado',
      hint: 'Este caso no está disponible.',
      back: 'Volver a casos',
    },
    it: {
      title: 'Caso non trovato',
      hint: 'Questo caso non è disponibile.',
      back: 'Torna ai casi',
    },
    fr: {
      title: 'Cas introuvable',
      hint: "Ce cas n'est pas disponible.",
      back: 'Retour aux cas',
    },
    de: {
      title: 'Fallstudie nicht gefunden',
      hint: 'Dieser Fall ist nicht verfügbar.',
      back: 'Zurück zu den Fällen',
    },
    pt: {
      title: 'Caso não encontrado',
      hint: 'Este caso não está disponível.',
      back: 'Voltar aos casos',
    },
    ru: {
      title: 'Кейс не найден',
      hint: 'Этот кейс недоступен.',
      back: 'К списку кейсов',
    },
  },
  activity: {
    cn: {
      title: '活动未找到',
      hint: '该活动不存在或已下线。',
      back: '返回活动日历',
    },
    zh: {
      title: '活动未找到',
      hint: '该活动不存在或已下线。',
      back: '返回活动日历',
    },
    en: {
      title: 'Event not found',
      hint: 'This activity is not available or has ended.',
      back: 'Back to activity calendar',
    },
    jp: {
      title: 'イベントが見つかりません',
      hint: 'このイベントは存在しないか、終了しています。',
      back: 'イベント一覧へ',
    },
    ja: {
      title: 'イベントが見つかりません',
      hint: 'このイベントは存在しないか、終了しています。',
      back: 'イベント一覧へ',
    },
    kr: {
      title: '행사를 찾을 수 없습니다',
      hint: '해당 행사를 이용할 수 없거나 종료되었습니다.',
      back: '행사 캘린더로',
    },
    ko: {
      title: '행사를 찾을 수 없습니다',
      hint: '해당 행사를 이용할 수 없거나 종료되었습니다.',
      back: '행사 캘린더로',
    },
    es: {
      title: 'Evento no encontrado',
      hint: 'Este evento no está disponible o ha finalizado.',
      back: 'Volver al calendario',
    },
    it: {
      title: 'Evento non trovato',
      hint: 'Questo evento non è disponibile o è terminato.',
      back: 'Torna al calendario',
    },
    fr: {
      title: 'Événement introuvable',
      hint: "Cet événement n'est pas disponible ou est terminé.",
      back: 'Retour au calendrier',
    },
    de: {
      title: 'Veranstaltung nicht gefunden',
      hint: 'Diese Veranstaltung ist nicht verfügbar oder beendet.',
      back: 'Zum Kalender',
    },
    pt: {
      title: 'Evento não encontrado',
      hint: 'Este evento não está disponível ou terminou.',
      back: 'Voltar ao calendário',
    },
    ru: {
      title: 'Событие не найдено',
      hint: 'Событие недоступно или завершено.',
      back: 'К календарю',
    },
  },
};

export function getResourceNotFoundCopy(
  langCode: string,
  kind: ResourceKind,
): ResourceNotFoundCopy {
  const c = (langCode || 'en').toLowerCase();
  const table = RESOURCE[kind];
  return table[c] ?? table.en;
}
