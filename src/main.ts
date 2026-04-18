import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  NestFastifyApplication,
  FastifyAdapter,
} from '@nestjs/platform-fastify';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './modules/redis/redis.service';
import { getLocaleNativeLabel } from './i18n/locale-native-labels';

async function bootstrap() {
  const trustProxy =
    process.env.TRUST_PROXY === '1' ||
    process.env.TRUST_PROXY === 'true' ||
    process.env.TRUST_PROXY === 'yes';
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy,
      // 与无尾斜杠路径等价，避免 /admin/、/products/ 等 404
      ignoreTrailingSlash: true,
    }),
  );

  const configService = app.get(ConfigService);
  const sessionSecret =
    configService.get<string>('session.secret') ||
    process.env.SESSION_SECRET ||
    'pengcheng-session-secret';
  const sessionMaxAge =
    configService.get<number>('session.maxAge') ?? 24 * 60 * 60 * 1000;
  const sessionCookieSecure =
    configService.get<boolean>('session.cookieSecure') ??
    process.env.NODE_ENV === 'production';

  // 静态资源与视图：以项目根目录为基准（兼容从 dist 启动时 __dirname 在 dist 下的行为）
  const projectRoot = process.cwd();
  await app.register(require('@fastify/static'), {
    root: join(projectRoot, 'public'),
    prefix: '/',
  });

  // Cookie（Session 与 CSRF 依赖）
  await app.register(require('@fastify/cookie'), {
    secret: sessionSecret,
  });

  // Session（后台登录态）：使用 Redis 持久化，进程重启后登录态不丢失
  const RedisStore = require('fastify-session-redis-store').default;
  const redisService = app.get(RedisService);
  const sessionStore = new RedisStore({
    client: redisService.getClient(),
    prefix: 'pengcheng:session:',
    ttl: Math.floor(sessionMaxAge / 1000), // 秒
  });
  await app.register(require('@fastify/session'), {
    secret: sessionSecret,
    store: sessionStore,
    saveUninitialized: false,
    cookie: {
      secure: sessionCookieSecure,
      maxAge: sessionMaxAge,
      httpOnly: true,
      sameSite: 'lax',
    },
  });

  // CSRF 保护（与 Session 配合，token 存 session）
  await app.register(require('@fastify/csrf-protection'), {
    sessionPlugin: '@fastify/session',
  });

  // application/x-www-form-urlencoded 由 @nestjs/platform-fastify 在 init 时注册，勿再 register @fastify/formbody，否则会 FST_ERR_CTP_ALREADY_PRESENT

  // 文件上传（本地上传，供后台使用）
  await app.register(require('@fastify/multipart'), {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB（富文本上传视频/文件等）
      files: 5,
    },
  });

  // Handlebars 视图 + 后台公共 partial（header / sidebar）+ 助手
  const handlebars = require('handlebars');
  const fs = require('fs');
  handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  handlebars.registerHelper('ne', (a: unknown, b: unknown) => a !== b);
  /** 产品侧栏：是否存在非产品的子级（即子分类） */
  handlebars.registerHelper('hasCategoryChildren', (ctx: unknown) => {
    const ch = (ctx as { children?: Array<{ isProduct?: boolean }> })?.children;
    if (!Array.isArray(ch)) return false;
    return ch.some((c) => c.isProduct !== true);
  });
  handlebars.registerHelper('json', (v: unknown) => {
    if (v == null) return '';
    // Escape HTML-significant characters to keep JSON safe inside <script>.
    return JSON.stringify(v)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  });
  handlebars.registerHelper('log', (v: unknown) => {
    console.log('[Handlebars log]', JSON.stringify(v, null, 2));
    return '';
  });
  handlebars.registerHelper('localeNativeLabel', (code: unknown) =>
    typeof code === 'string' ? getLocaleNativeLabel(code) : '',
  );

  /** 顶部语言切换：pathLocale 与 lang.code 是否视为当前语言（en 对应无前缀） */
  handlebars.registerHelper(
    'langSwitchActive',
    (pathLocale: unknown, code: unknown) => {
      const pl = String(pathLocale ?? '')
        .trim()
        .toLowerCase();
      const c = String(code ?? '')
        .trim()
        .toLowerCase();
      if (c === 'en') return pl === '' || pl === 'en';
      return pl === c;
    },
  );

  /** 当前语言行（用于触发器展示），无匹配时取第一项 */
  handlebars.registerHelper(
    'langNavCurrent',
    (navLangs: unknown, pathLocale: unknown) => {
      const list = Array.isArray(navLangs)
        ? (navLangs as Array<{
            code: string;
            langFullName?: string;
            langIconUrl?: string | null;
          }>)
        : [];
      if (!list.length)
        return { code: 'en', langFullName: 'English', langIconUrl: null };
      const pl = String(pathLocale ?? '')
        .trim()
        .toLowerCase();
      const found = list.find((n) => {
        const c = (n.code || '').toLowerCase();
        return c === 'en' ? pl === '' || pl === 'en' : pl === c;
      });
      return found || list[0];
    },
  );

  // 日期格式化 helper
  handlebars.registerHelper(
    'formatDate',
    (date: Date | string | null, format: string, locale?: string) => {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';

      const days = ['SUN', 'MON', 'TUES', 'WED', 'THUR', 'FRI', 'SAT'];
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];

      const day = days[d.getDay()];
      const dateNum = d.getDate();
      const month = months[d.getMonth()];
      const year = d.getFullYear();

      switch (format) {
        case 'ddd':
          return day;
        case 'DD':
          return String(dateNum).padStart(2, '0');
        case 'MMM DD':
          return `${month} ${String(dateNum).padStart(2, '0')}`;
        case 'MMM.DD-YYYY':
          return `${month}.${String(dateNum).padStart(2, '0')}-${year}`;
        default:
          return d.toLocaleDateString(locale || 'en-US');
      }
    },
  );

  // 文本截断 helper
  handlebars.registerHelper('truncate', (str: string, length: number) => {
    if (!str || str.length <= length) return str;
    return str.substring(0, length) + '..';
  });

  // 大于比较 helper
  handlebars.registerHelper(
    'gt',
    (a: number, b: number) => Number(a) > Number(b),
  );

  // 或运算 helper
  handlebars.registerHelper('or', (...args) => {
    // 移除最后一个参数（Handlebars的options对象）
    args.pop();
    return args.some(Boolean);
  });

  // 小于比较 helper
  handlebars.registerHelper(
    'lt',
    (a: number, b: number) => Number(a) < Number(b),
  );

  // 数组长度 helper
  handlebars.registerHelper('length', (arr: unknown[] | string) => {
    if (Array.isArray(arr)) return arr.length;
    if (typeof arr === 'string') return arr.length;
    return 0;
  });

  // 加法 helper
  handlebars.registerHelper(
    'add',
    (a: number, b: number) => Number(a) + Number(b),
  );

  // 减法 helper
  handlebars.registerHelper(
    'subtract',
    (a: number, b: number) => Number(a) - Number(b),
  );

  // 最大值 helper
  handlebars.registerHelper('max', (a: number, b: number) =>
    Math.max(Number(a), Number(b)),
  );

  // 最小值 helper
  handlebars.registerHelper('min', (a: number, b: number) =>
    Math.min(Number(a), Number(b)),
  );

  // 范围生成 helper（用于数字分页）
  handlebars.registerHelper('range', (start: number, end: number) => {
    const result: number[] = [];
    for (let i = Number(start); i <= Number(end); i++) {
      result.push(i);
    }
    return result;
  });

  // 乘法 helper
  handlebars.registerHelper(
    'multiply',
    (a: number, b: number) => Number(a) * Number(b),
  );

  // 检查日期是否过期 helper
  handlebars.registerHelper('isExpired', (date: Date | string | null) => {
    if (!date) return false;
    const d = new Date(date);
    return !isNaN(d.getTime()) && d < new Date();
  });

  // 检查字符串是否包含指定值 helper
  handlebars.registerHelper(
    'contains',
    (str: string, value: string | number) => {
      if (!str) return false;
      return String(str).includes(String(value));
    },
  );

  // 连接数组元素为字符串 helper
  handlebars.registerHelper('join', (arr: any[], separator: string) => {
    if (!Array.isArray(arr)) return '';
    return arr.join(separator);
  });

  const registerPartials = (opts: { dir: string; prefix: string }) => {
    const dir = opts.dir;
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach((f: string) => {
      if (!f.endsWith('.hbs')) return;
      const name = f.replace(/\.hbs$/, '');
      handlebars.registerPartial(
        opts.prefix + name,
        fs.readFileSync(join(dir, f), 'utf8'),
      );
    });
  };

  const viewsRoot = join(projectRoot, 'views');
  const adminPartialsDir = join(viewsRoot, 'admin', 'partials');
  const websitePartialsDir = join(viewsRoot, 'website', 'partials');
  const registerAllPartials = () => {
    registerPartials({ dir: adminPartialsDir, prefix: 'admin/' });
    registerPartials({ dir: websitePartialsDir, prefix: 'website/' });
    // website/partials 目录下的子目录（common、home、products 等）
    if (fs.existsSync(websitePartialsDir)) {
      fs.readdirSync(websitePartialsDir, { withFileTypes: true }).forEach(
        (ent: { name: string; isDirectory: () => boolean }) => {
          if (ent.isDirectory()) {
            registerPartials({
              dir: join(websitePartialsDir, ent.name),
              prefix: 'website/' + ent.name + '/',
            });
          }
        },
      );
    }
  };
  // 启动时注册一次
  registerAllPartials();
  // 开发环境下：每次请求刷新 partial，避免新增 .hbs 需要重启
  if (process.env.NODE_ENV !== 'production') {
    const fastify = app.getHttpAdapter().getInstance();
    fastify.addHook('onRequest', async () => {
      registerAllPartials();
    });
  }
  await app.register(require('@fastify/view'), {
    engine: { handlebars },
    root: viewsRoot,
    viewExt: 'hbs',
    includeViewExtension: true,
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
