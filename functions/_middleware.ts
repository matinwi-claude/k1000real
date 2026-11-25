/**
 * Cloudflare Pages middleware: the same 3D-viewer password gate as the Worker
 * (worker/auth.ts), for when the site is deployed as a Pages project, which runs
 * this file instead of worker/index.ts. Set VIEWER_PASSWORD as an encrypted variable.
 */
import { authorised, embedPolicy, isPublic, loginPrompt, privateCopy, type AuthEnv } from '../worker/auth';

export const onRequest: PagesFunction<AuthEnv> = async ({ request, env, next }) => {
  const path = new URL(request.url).pathname;
  if (isPublic(path)) return embedPolicy(await next(), env);
  if (!(await authorised(request, env))) return loginPrompt(!!env.VIEWER_PASSWORD);
  return embedPolicy(privateCopy(await next(), path), env);
};
