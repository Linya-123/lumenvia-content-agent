import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  authEnabled,
  createSessionToken,
  passwordMatches,
  sessionCookieOptions,
  sessionDays,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 登录：校验账号密码 → 签发 Cookie 会话
 * 成功后浏览器持有 HttpOnly cookie，默认 30 天内不用再登录。
 */
export async function POST(req: NextRequest) {
  // 未配置凭据 → 全站免鉴权，直接放行
  if (!authEnabled()) {
    return NextResponse.json({ ok: true, authDisabled: true, message: '未开启鉴权' });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'bad_request', message: '请求格式不对' },
      { status: 400 },
    );
  }

  const user = String(body.user ?? '').trim();
  const password = String(body.password ?? '');

  if (user !== process.env.AUTH_USER || !passwordMatches(password)) {
    // 失败加一点延迟，抬高暴力尝试成本（尽力而为，不保证分布式场景）
    await new Promise((r) => setTimeout(r, 300));
    return NextResponse.json(
      { ok: false, error: 'invalid_credentials', message: '账号或密码不对' },
      { status: 401 },
    );
  }

  const days = sessionDays();
  const token = await createSessionToken(user, days);
  const isHttps =
    new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';

  const res = NextResponse.json({ ok: true, user, days });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(isHttps, days));
  return res;
}