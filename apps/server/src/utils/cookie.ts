/**
 * Centralized cookie utilities — extracted from duplicated logic
 * across auth.ts, index.ts, and other handlers.
 */

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const c of cookieHeader.split(';')) {
    const [key, ...val] = c.trim().split('=');
    if (key) {
      cookies[key.trim()] = val.join('=');
    }
  }
  return cookies;
}

export function setCookie(
  headers: Headers,
  name: string,
  value: string,
  options: {
    maxAge?: number;
    path?: string;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    secure?: boolean;
  } = {}
): void {
  const {
    maxAge = 7 * 24 * 60 * 60, // 7 days default
    path = '/',
    httpOnly = true,
    sameSite = 'Lax',
    secure = process.env.NODE_ENV === 'production',
  } = options;

  const flags = [
    `Path=${path}`,
    httpOnly ? 'HttpOnly' : '',
    `SameSite=${sameSite}`,
    secure ? 'Secure' : '',
    `Max-Age=${maxAge}`,
  ].filter(Boolean).join('; ');

  headers.append('Set-Cookie', `${name}=${value}; ${flags}`);
}

export function clearCookie(
  headers: Headers,
  name: string,
  options: { path?: string } = {}
): void {
  headers.append('Set-Cookie', `${name}=; Path=${options.path || '/'}; HttpOnly; SameSite=Lax; Max-Age=0`);
}
