/**
 * Cloudflare Pages middleware: the same 3D-viewer password gate as the Worker
 * (worker/auth.ts), for when the site is deployed as a Pages project, which runs
 * this file instead of worker/index.ts. Set VIEWER_PASSWORD as an encrypted variable.
 */
import { authorised, isPublic, loginPrompt, privateCopy, type AuthEnv } from '../worker/auth';

export const onRequest: PagesFunction<AuthEnv> = async ({ request, env, next }) => {
  const path = new URL(request.url).pathname;
  if (isPublic(path)) return next();
  if (!(await authorised(request, env))) return loginPrompt(!!env.VIEWER_PASSWORD);
  return privateCopy(await next(), path);
};
