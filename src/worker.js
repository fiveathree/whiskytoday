// Whisky Today Worker entry: routes fetch() and scheduled() (PLAN.md §2)
import { authenticate } from './access.js';
import { handleApi } from './api.js';
import { runCollection } from './news.js';
import { sendDigest } from './digest.js';

// Files anyone may load without Access: styles, scripts, icons, share image.
const PUBLIC_ASSET = /^\/(css|js|img)\/|^\/(favicon\.svg|favicon\.ico|og\.png|robots\.txt)$/;

function page(env, request, path) {
  // Asset paths without ".html" (html_handling resolves /admin -> admin.html).
  return env.ASSETS.fetch(new Request(new URL(path, request.url), { headers: request.headers }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (PUBLIC_ASSET.test(path)) return env.ASSETS.fetch(request);

    // Owner decision (2026-11-04): the news page and its read API are public, no login.
    // Admin pages and admin APIs stay behind Access and are re-checked here (PLAN §8).
    const isAdminPath = path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin');
    const user = isAdminPath ? await authenticate(request, env) : null;
    if (isAdminPath && user?.role !== 'admin') return new Response('Forbidden', { status: 403 });

    if (path.startsWith('/api/')) return handleApi(request, env, ctx, user, url);
    if (path === '/admin' || path === '/admin/') return page(env, request, '/admin');
    if (path === '/') return page(env, request, '/');
    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env) {
    // 23:00 UTC = 07:00 HK/Taipei: collect, then send the daily briefing.
    await runCollection(env);
    if (event.cron === '0 23 * * *') await sendDigest(env);
  },
};
