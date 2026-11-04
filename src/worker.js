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

    // Everything else needs a valid Access identity (PLAN §8).
    const user = await authenticate(request, env);
    if (!user) return new Response('Forbidden', { status: 403 });

    if (path.startsWith('/api/')) return handleApi(request, env, ctx, user, url);

    if (path === '/admin' || path === '/admin/') {
      if (user.role !== 'admin') return new Response('Forbidden', { status: 403 });
      return page(env, request, '/admin');
    }
    if (path === '/') return page(env, request, '/');
    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env) {
    // 23:00 UTC = 07:00 HK/Taipei: collect, then send the daily briefing.
    await runCollection(env);
    if (event.cron === '0 23 * * *') await sendDigest(env);
  },
};
