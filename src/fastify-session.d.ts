import '@fastify/session';

declare module '@fastify/session' {
  interface FastifySessionObject {
    /** 后台管理员 */
    adminUserId?: number;
    adminUsername?: string;
    adminCaptchaText?: string;
    /** 前台用户（与后台可共存于同一会话） */
    memberId?: number;
    memberEmail?: string;
  }
}
