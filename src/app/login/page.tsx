'use client';

import { useEffect, useRef, useState } from 'react';
import '../globals.css';

/**
 * 登录页
 * ------------------------------------------------------------
 * 输一次即签发 30 天 Cookie 会话，下次打开直接进主界面。
 * 输错只在卡片内显示红字，不像浏览器原生弹框那样污染凭据缓存。
 */
export default function LoginPage() {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef('/');

  useEffect(() => {
    // 从 ?next= 取回跳目标；用 window 读取，避免 useSearchParams 触发 Suspense 边界
    const raw = new URLSearchParams(window.location.search).get('next');
    if (raw && raw.startsWith('/')) nextRef.current = raw;

    // 鉴权没开就别拦人（/api/session 会告诉前端）
    userRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErr('');
    setLoading(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user, password }),
      });
      const data = await r.json().catch(() => ({} as Record<string, unknown>));
      if (r.ok) {
        // 整页跳转，让中间件用新 cookie 重新判定
        window.location.replace(nextRef.current);
        return;
      }
      setErr(String(data.message ?? '账号或密码不对'));
    } catch {
      setErr('连不上服务，确认 npm run dev 还在跑');
    }
    setLoading(false);
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="login-mark">L</div>
          <div>
            <div className="login-title">Lumenvia Content Agent</div>
            <div className="login-sub">跨语言内容生产 · AI 搜索可见性</div>
          </div>
        </div>

        <div className="login-field">
          <label htmlFor="login-user">账号</label>
          <input
            id="login-user"
            ref={userRef}
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="username"
            placeholder="admin"
            spellCheck={false}
          />
        </div>

        <div className="login-field">
          <label htmlFor="login-pass">密码</label>
          <input
            id="login-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="请输入密码"
          />
        </div>

        {err ? <div className="login-err" role="alert">{err}</div> : null}

        <button className="login-btn" type="submit" disabled={loading || !user || !password}>
          {loading ? '登录中…' : '登录'}
        </button>

        <div className="login-hint">登录一次后，这台设备 30 天内无需再输入</div>
      </form>
    </div>
  );
}