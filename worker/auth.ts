/**
 * Password gate for the 3D viewer, shared by the Worker (worker/index.ts) and the
 * Cloudflare Pages middleware (functions/_middleware.ts), so it works however the site
 * is deployed. The 2D parts atlas and shared static files stay public.
 */
export interface AuthEnv {
  /** password for the 3D viewer (secret) */
  VIEWER_PASSWORD?: string;
  /** optional user name; if unset, any user name is accepted */
  VIEWER_USER?: string;
  /**
   * Websites allowed to embed the viewer / parts atlas in an iframe, comma or space separated
   * (e.g. "https://www.khaero.com, https://khaero.com"). Every other site is refused by the browser.
   */
  EMBED_ORIGINS?: string;
}

/** Used when EMBED_ORIGINS is not set: only Kraus Hamdani's own website (and this site) may embed. */
const DEFAULT_EMBED_ORIGINS = 'https://www.khaero.com https://khaero.com';

/** Copy of a response with a frame-ancestors policy: only the allowed websites may embed it. */
export function embedPolicy(res: Response, env: AuthEnv) {
  const origins = (env.EMBED_ORIGINS ?? DEFAULT_EMBED_ORIGINS)
    .split(/[\s,]+/)
    .filter((o) => /^https?:\/\/[a-z0-9.*-]+(:\d+)?$/i.test(o));
  const out = new Response(res.body, res);
  out.headers.set('Content-Security-Policy', `frame-ancestors 'self' ${origins.join(' ')}`.trim());
  return out;
}

/** Served without a login: the 2D atlas, its scripts/styles/fonts and the brand images. */
export function isPublic(path: string) {
  return (
    path === '/parts' ||
    path.startsWith('/parts/') ||
    path === '/parts.html' ||
    path.startsWith('/assets/') ||
    path.startsWith('/brand/') ||
    path.startsWith('/api/') ||
    path === '/favicon.svg' ||
    path === '/og.png' ||
    path === '/embed.js' ||
    path === '/embed-demo.html'
  );
}

const encoder = new TextEncoder();

/** Constant-time string comparison (hash both, then compare the digests). */
async function same(a: string, b: string) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(a)), crypto.subtle.digest('SHA-256', encoder.encode(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}

export async function authorised(request: Request, env: AuthEnv) {
  if (!env.VIEWER_PASSWORD) return false; // fail closed until a password is set
  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme?.toLowerCase() !== 'basic' || !encoded) return false;
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const user = decoded.slice(0, i);
  const pass = decoded.slice(i + 1);
  const passOk = await same(pass, env.VIEWER_PASSWORD);
  const userOk = env.VIEWER_USER ? await same(user, env.VIEWER_USER) : true;
  return passOk && userOk;
}

export function loginPrompt(configured: boolean) {
  return new Response(configured ? 'Login required for the K1000ULE 3D viewer.' : 'The 3D viewer password has not been set yet.', {
    status: configured ? 401 : 503,
    headers: {
      ...(configured ? { 'WWW-Authenticate': 'Basic realm="K1000ULE 3D viewer", charset="UTF-8"' } : {}),
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/** Copy of a protected response that shared caches must not store. */
export function privateCopy(res: Response, path: string) {
  const out = new Response(res.body, res);
  out.headers.set('cache-control', path.startsWith('/models/') ? 'private, max-age=3600' : 'private, no-cache');
  return out;
}
