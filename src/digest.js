// Daily briefing email to the admin (PLAN.md §4.2 step 7). Sent after the 07:00 run.
import { uid, nowIso } from './db.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function buildDigest(env, sinceIso) {
  const base = `SELECT a.id, a.title_zh, a.summary_zh, a.canonical_url, a.importance, a.investor_focus,
      EXISTS (SELECT 1 FROM article_entities ae JOIN entities e ON e.id = ae.entity_id
              WHERE ae.article_id = a.id AND e.is_tracked = 1) AS mine
    FROM articles a WHERE a.status = 'published' AND a.fetched_at >= ?
    ORDER BY a.importance DESC, a.published_at DESC`;
  const { results } = await env.DB.prepare(base).bind(sinceIso).all();
  const used = new Set();
  const take = (pred) => results.filter((r) => !used.has(r.id) && pred(r)).slice(0, 15).map((r) => { used.add(r.id); return r; });
  return [
    { title: '影響你追蹤酒款的新聞', items: take((r) => r.mine) },
    { title: '投資者焦點', items: take((r) => r.investor_focus) },
    { title: '其他重要消息', items: take((r) => r.importance >= 3) },
  ];
}

export function renderDigest(sections, dateLabel, siteUrl) {
  const text = [`Whisky Today 每日簡報 ${dateLabel}`, ''];
  let html = `<div style="font-family:Georgia,'Noto Serif TC',serif;background:#0E0D0C;color:#F3EDE2;padding:24px;max-width:640px">
<div style="letter-spacing:.3em;color:#C9A96E;font-size:14px">WHISKY TODAY</div>
<div style="border-top:1px solid rgba(201,169,110,.4);margin:8px 0 16px"></div>
<div style="font-size:13px;color:#b8b0a3">每日簡報 · ${esc(dateLabel)}</div>`;
  for (const s of sections) {
    html += `<h2 style="font-size:17px;color:#C9A96E;font-weight:normal;margin:24px 0 8px">${esc(s.title)}（${s.items.length}）</h2>`;
    text.push(`【${s.title}】`);
    if (!s.items.length) {
      html += '<p style="color:#8a8378;font-size:13px">今日冇相關消息。</p>';
      text.push('今日冇相關消息。');
    }
    for (const it of s.items) {
      html += `<p style="margin:0 0 12px;font-family:Arial,'Noto Sans TC',sans-serif;font-size:14px;line-height:1.5">
<a href="${esc(it.canonical_url)}" style="color:#F3EDE2;text-decoration:none;font-weight:bold">${esc(it.title_zh)}</a><br>
<span style="color:#b8b0a3">${esc(it.summary_zh)}</span></p>`;
      text.push(`- ${it.title_zh}`, `  ${it.summary_zh}`, `  ${it.canonical_url}`);
    }
    text.push('');
  }
  if (siteUrl) {
    html += `<p style="margin-top:24px"><a href="${esc(siteUrl)}" style="color:#C9A96E">打開 Whisky Today</a></p>`;
    text.push(siteUrl);
  }
  html += '<p style="color:#6f695f;font-size:11px;margin-top:24px">內容由 AI 整理，僅供市場參考，並非投資建議。</p></div>';
  text.push('內容由 AI 整理，僅供市場參考，並非投資建議。');
  return { html, text: text.join('\n') };
}

export async function sendDigest(env) {
  const jobId = uid();
  await env.DB.prepare('INSERT INTO job_logs (id, job, started_at, status) VALUES (?, ?, ?, ?)')
    .bind(jobId, 'digest', nowIso(), 'running').run();
  try {
    if (!env.DIGEST_TO || !env.DIGEST_FROM) throw new Error('DIGEST_TO / DIGEST_FROM not set');
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const sections = await buildDigest(env, since);
    const dateLabel = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    const { html, text } = renderDigest(sections, dateLabel, env.SITE_URL);
    const count = sections.reduce((n, s) => n + s.items.length, 0);
    await env.EMAIL.send({
      from: { email: env.DIGEST_FROM, name: 'Whisky Today' },
      to: env.DIGEST_TO,
      subject: `Whisky Today 每日簡報 ${dateLabel}（${count} 則）`,
      html,
      text,
    });
    await env.DB.prepare('UPDATE job_logs SET finished_at = ?, status = ?, items_processed = ? WHERE id = ?')
      .bind(nowIso(), 'ok', count, jobId).run();
  } catch (e) {
    await env.DB.prepare('UPDATE job_logs SET finished_at = ?, status = ?, error = ? WHERE id = ?')
      .bind(nowIso(), 'error', String(e?.message || e).slice(0, 1000), jobId).run();
  }
}
