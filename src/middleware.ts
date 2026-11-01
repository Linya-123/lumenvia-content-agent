import { NextRequest, NextResponse } from 'next/server';

/**
 * 全站 HTTP Basic Auth
 * ------------------------------------------------------------
 * 评审账号通过环境变量配置：AUTH_USER / AUTH_PASSWORD
 * 两者任一未设置时鉴权自动关闭（本地开发零摩擦）。
 *
 * 选 Basic Auth 而非登录页的理由：
 *   1. 浏览器原生凭据弹窗，零 UI 代码、零会话管理
 *   2. 凭据按 origin 缓存，同源 iframe（落地页预览）与 SSE 自动带上
 *   3. 中间件层统一拦截，所有页面 + API 全覆盖，无需逐路由加守卫
 */
export function middleware(req: NextRequest) {
  const expectUser = process.env.AUTH_USER;
  const expectPass = process.env.AUTH_PASSWORD;

  // 未配置凭据 → 鉴权关闭
  if (!expectUser || !expectPass) return NextResponse.next();

  const header = req.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const idx = decoded.indexOf(':');
      if (idx > 0) {
        const u = decoded.slice(0, idx);
        const p = decoded.slice(idx + 1);
        if (u === expectUser && p === expectPass) return NextResponse.next();
      }
    } catch {
      // base64 解码失败 → 走 401
    }
  }

  return new NextResponse('需要登录后访问', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Lumenvia", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export const config = {
  // 排除 Next.js 静态资源，其余路由（页面 + API + 预览）全部鉴权
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};