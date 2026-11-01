import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 退出登录：清掉会话 cookie。
 * 这是 Basic Auth 做不到的事 —— 它没有"退出"这个动作。
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

/** 支持直接用链接退出（GET /api/auth/logout 后回到登录页） */
export async function GET(req: NextRequest) {
  const target = new URL('/login', req.url);
  const res = NextResponse.redirect(target);
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}