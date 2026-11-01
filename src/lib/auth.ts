/**
 * 会话鉴权
 * ------------------------------------------------------------
 * 取代原来的 HTTP Basic Auth。区别：
 *
 *   Basic Auth      浏览器原生弹框，凭据按 origin 缓存，没有"退出登录"，
 *                   一旦存错只能去浏览器设置里手删，且关浏览器通常要重输。
 *   Cookie 会话     自建登录页，签一个 HttpOnly cookie，默认 30 天免登录，
 *                   输错只是页面上一条红字，不污染浏览器状态，可主动退出。
 *
 * 采用无状态签名（HMAC-SHA256），不依赖任何存储：
 *   - dev 重启、serverless 换实例都不会掉登录
 *   - 改 AUTH_PASSWORD 后旧 cookie 自动失效（签名密钥由它派生）
 *
 * 运行在 middleware（Edge runtime）与 route handler（Node runtime）两端，
 * 因此只用 Web Crypto，不用 node:crypto。
 */

export const SESSION_COOKIE = 'lumenvia_session';

/** 默认免登录天数，可用 SESSION_DAYS 覆盖 */
export const DEFAULT_SESSION_DAYS = 30;

export function authEnabled(): boolean {
  return Boolean(process.env.AUTH_USER && process.env.AUTH_PASSWORD);
}

export function sessionDays(): number {
  const raw = Number(process.env.SESSION_DAYS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_SESSION_DAYS;
  return Math.min(raw, 365);
}

/**
 * 签名密钥。优先 AUTH_SECRET；未设置时由账号密码派生——
 * 这样不增加任何必填配置也能稳定工作，代价是改密码即全员重登（通常正是想要的）。
 */
function signingSecret(): string {
  const explicit = process.env.AUTH_SECRET;
  if (explicit) return explicit;
  return `lumenvia-session-v1|${process.env.AUTH_USER ?? ''}|${process.env.AUTH_PASSWORD ?? ''}`;
}

const enc = new TextEncoder();

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(signingSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** base64url 编解码（Edge 与 Node 都有 atob/btoa，不碰 Buffer） */
function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 签发会话 token：payload = `用户|过期时间戳`，后面接 HMAC 签名。
 * 形如 `YWRtaW58MTc5….<sig>`
 */
export async function createSessionToken(user: string, days = sessionDays()): Promise<string> {
  const expiresAt = Date.now() + days * 86_400_000;
  const payload = `${user}|${expiresAt}`;
  const key = await importKey();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return `${b64urlEncode(enc.encode(payload))}.${b64urlEncode(new Uint8Array(sig))}`;
}

/**
 * 校验会话 token。任一环节不通过即返回 null：
 * 格式不对 / 签名不匹配 / 已过期 / 用户名与当前配置不符。
 */
export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  let payload: string;
  try {
    payload = new TextDecoder().decode(b64urlDecode(token.slice(0, dot)));
  } catch {
    return null;
  }

  const sep = payload.lastIndexOf('|');
  if (sep <= 0) return null;
  const user = payload.slice(0, sep);
  const expiresAt = Number(payload.slice(sep + 1));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  if (user !== process.env.AUTH_USER) return null;

  try {
    const key = await importKey();
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(token.slice(dot + 1)),
      enc.encode(payload),
    );
    return ok ? user : null;
  } catch {
    return null;
  }
}

/** 登录接口用：恒定时间比较，避免按响应耗时猜密码 */
export function passwordMatches(input: string): boolean {
  const expected = process.env.AUTH_PASSWORD ?? '';
  if (!expected || input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ input.charCodeAt(i);
  return diff === 0;
}

/** 写 cookie 用的属性串（Secure 只在 https 下加，本地 http 照常生效） */
export function sessionCookieOptions(isHttps: boolean, days = sessionDays()) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isHttps,
    path: '/',
    maxAge: days * 86_400,
  };
}