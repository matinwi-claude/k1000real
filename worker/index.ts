/**
 * Cloudflare Worker entry.
 *
 * Every request runs through this script first (run_worker_first in wrangler.toml).
 * The 2D parts atlas and the shared static files are public; everything else — the 3D
 * viewer page and the CAD model it loads — sits behind a browser login prompt (HTTP Basic
 * auth). The password is a Worker secret: `npx wrangler secret put VIEWER_PASSWORD`.
 */
interface Env {
  ASSETS: Fetcher;
  BUILD_VERSION?: string;
  /** password for the 3D viewer (secret) */
  VIEWER_PASSWORD?: string;
  /** optional user name; if unset, any user name is accepted */
  VIEWER_USER?: string;
}

/** Served without a login: the 2D atlas, its scripts/styles/fonts and the brand images. */
function isPublic(path: string) {
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

async function authorised(request: Request, env: Env) {
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

function loginPrompt(configured: boolean) {
  return new Response(configured ? 'Login required for the K1000ULE 3D viewer.' : 'The 3D viewer password has not been set yet.', {
    status: configured ? 401 : 503,
    headers: {
      ...(configured ? { 'WWW-Authenticate': 'Basic realm="K1000ULE 3D viewer", charset="UTF-8"' } : {}),
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function status(request: Request, env: Env) {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  // All "telemetry" here is illustrative; nothing is read from a real aircraft.
  const body = {
    system: 'K1000 DIGITAL TWIN',
    status: 'online',
    version: env.BUILD_VERSION ?? '1.0.0',
    edge: cf?.colo ?? 'LOCAL',
    country: cf?.country ?? null,
    time: new Date().toISOString(),
    illustrative: true,
  };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/status') return status(request, env);
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    if (isPublic(url.pathname)) return env.ASSETS.fetch(request);
    if (!(await authorised(request, env))) return loginPrompt(!!env.VIEWER_PASSWORD);
    const res = await env.ASSETS.fetch(request);
    // protected content must never be stored by shared caches
    const out = new Response(res.body, res);
    out.headers.set('cache-control', url.pathname.startsWith('/models/') ? 'private, max-age=3600' : 'private, no-cache');
    return out;
  },
} satisfies ExportedHandler<Env>;
