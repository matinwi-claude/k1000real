/**
 * Cloudflare Worker entry.
 *
 * Every request runs through this script first (run_worker_first in wrangler.toml).
 * The 2D parts atlas and the shared static files are public; everything else — the 3D
 * viewer page and the CAD model it loads — sits behind a browser login prompt (HTTP Basic
 * auth). The password is a Worker secret: `npx wrangler secret put VIEWER_PASSWORD`.
 */
import { authorised, isPublic, loginPrompt, privateCopy, type AuthEnv } from './auth';

interface Env extends AuthEnv {
  ASSETS: Fetcher;
  BUILD_VERSION?: string;
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
    return privateCopy(await env.ASSETS.fetch(request), url.pathname);
  },
} satisfies ExportedHandler<Env>;
