import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, authEnabled, verifySessionToken } from '@/lib/auth';

/**
 * 会话鉴权（Cookie）
 * ------------------------------------------------------------
 * 评审账号通过环境变量配置：AUTH_USER / AUTH_PASSWORD
 * 任一未设置时鉴权自动关闭（本地开发零摩擦）。
 *
 * 放行名单：
 *   /login             登录页本身，否则死循环
 *   /api/auth/login    提交账号密码
 *   /api/auth/logout   退出（无 cookie 时也让它正常清一下）
 *
 * 未登录时：
 *   页面请求 → 302 到 /login?next=<原路径>，登录后自动回跳
 *   API 请求 → 401 JSON，避免前端拿到一张 HTML 还在那解析
 *
 * 为什么不用 Basic Auth：
 *   它没有退出登录、凭据按 origin 缓存且关浏览器常要重输，
 *   输错一次还会被浏览器反复自动重试，体验和可维护性都差。
 */
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout'];

export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const user = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();

  // API / SSE 一律返回 JSON 401，前端按接口失败处理
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', message: '登录已过期，请重新登录' },
      { status: 401 },
    );
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  loginUrl.searchParams.set('next', pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // 排除 Next.js 静态资源，其余路由（页面 + API + 预览）全部鉴权
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};