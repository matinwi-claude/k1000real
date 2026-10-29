/**
 * Cloudflare Worker entry.
 *
 * Static assets (the Vite build in ./dist) are served by Workers Static Assets;
 * this script only runs for /api/* (see run_worker_first in wrangler.toml).
 */
interface Env {
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
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
