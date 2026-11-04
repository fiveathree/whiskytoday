// Minimal native-SVG charts (PLAN §2: no chart library). Colours come from CSS custom properties
// (--s1..--s6 categorical, validated for light and dark), so the theme toggle restyles charts.
import { esc } from './common.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, parent) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.append(n);
  return n;
};

let tip;
function tooltip() {
  if (!tip) { tip = document.createElement('div'); tip.className = 'viz-tip'; tip.hidden = true; document.body.append(tip); }
  return tip;
}
function showTip(html, x, y) {
  const t = tooltip();
  t.innerHTML = html;
  t.hidden = false;
  const r = t.getBoundingClientRect();
  t.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 14))}px`;
  t.style.top = `${Math.max(8, y - r.height - 10)}px`;
}
const hideTip = () => { if (tip) tip.hidden = true; };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((m) => m >= v);
}

function frame(host, height) {
  host.innerHTML = '';
  const w = Math.max(280, host.clientWidth || 600);
  const h = height || Math.max(180, host.clientHeight || 260);
  // Without a fixed height the SVG fills its box absolutely, so it never pushes the layout taller.
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h, class: height ? 'viz' : 'viz viz-fill', role: 'img' }, host);
  return { svg, w, h };
}

function yAxis(svg, x0, x1, y, max, ticks, fmt) {
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    const yy = y(v);
    el('line', { x1: x0, x2: x1, y1: yy, y2: yy, class: i ? 'viz-grid' : 'viz-base' }, svg);
    el('text', { x: x0 - 6, y: yy + 4, 'text-anchor': 'end', class: 'viz-tick' }, svg).textContent = fmt(v);
  }
}

// series: [{ name, color, points: [{ x: label, y: number }] }] sharing the same x labels.
export function lineChart(host, series, { fmt = (v) => v, xFmt = (v) => v, height, ariaLabel = '' } = {}) {
  const { svg, w, h } = frame(host, height);
  svg.setAttribute('aria-label', ariaLabel);
  const labels = series[0]?.points.map((p) => p.x) || [];
  if (!labels.length) return;
  const m = { l: 52, r: 12, t: 10, b: 24 };
  const max = niceMax(Math.max(...series.flatMap((s) => s.points.map((p) => p.y || 0))));
  const x = (i) => m.l + (labels.length === 1 ? 0 : (i / (labels.length - 1)) * (w - m.l - m.r));
  const y = (v) => h - m.b - (v / max) * (h - m.t - m.b);
  yAxis(svg, m.l, w - m.r, y, max, 4, fmt);
  const step = Math.ceil(labels.length / Math.max(2, Math.floor((w - m.l) / 70)));
  labels.forEach((lb, i) => {
    if (i % step === 0) el('text', { x: x(i), y: h - 6, 'text-anchor': 'middle', class: 'viz-tick' }, svg).textContent = xFmt(lb);
  });
  for (const s of series) {
    const d = s.points.map((p, i) => (p.y == null ? null : `${x(i)},${y(p.y)}`)).filter(Boolean);
    el('polyline', { points: d.join(' '), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  }
  // Crosshair + tooltip
  const cross = el('line', { y1: m.t, y2: h - m.b, class: 'viz-cross', visibility: 'hidden' }, svg);
  const dots = series.map((s) => el('circle', { r: 4, fill: s.color, stroke: 'var(--bg-raise)', 'stroke-width': 2, visibility: 'hidden' }, svg));
  const hit = el('rect', { x: m.l, y: m.t, width: w - m.l - m.r, height: h - m.t - m.b, fill: 'transparent' }, svg);
  const move = (ev) => {
    const pt = svg.getBoundingClientRect();
    const sx = ((ev.clientX - pt.left) / pt.width) * w;
    const i = Math.max(0, Math.min(labels.length - 1, Math.round(((sx - m.l) / (w - m.l - m.r)) * (labels.length - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    series.forEach((s, k) => {
      const v = s.points[i]?.y;
      dots[k].setAttribute('visibility', v == null ? 'hidden' : 'visible');
      if (v != null) { dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(v)); }
    });
    const rows = series.map((s) => `<div><i style="background:${s.color}"></i>${esc(s.name)}<b>${s.points[i]?.y == null ? '—' : fmt(s.points[i].y)}</b></div>`).join('');
    showTip(`<div class="viz-tip-h">${esc(xFmt(labels[i], true))}</div>${rows}`, ev.clientX, ev.clientY);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => { hideTip(); cross.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); });
}

// rows: [{ label, value, note }] horizontal bars, one hue.
export function barChart(host, rows, { fmt = (v) => v, color = 'var(--s1)', height, ariaLabel = '' } = {}) {
  const rowH = 22;
  const { svg, w, h } = frame(host, height || rows.length * rowH + 12);
  svg.setAttribute('aria-label', ariaLabel);
  const m = { l: 96, r: 110, t: 4 };
  const max = Math.max(...rows.map((r) => r.value), 1);
  const bh = Math.min(14, (h - m.t) / rows.length - 6);
  rows.forEach((r, i) => {
    const y0 = m.t + i * ((h - m.t) / rows.length);
    const bw = Math.max(2, (r.value / max) * (w - m.l - m.r));
    el('text', { x: m.l - 8, y: y0 + bh - 2, 'text-anchor': 'end', class: 'viz-label' }, svg).textContent = r.label;
    const bar = el('rect', { x: m.l, y: y0, width: bw, height: bh, rx: 3, fill: color }, svg);
    el('text', { x: m.l + bw + 6, y: y0 + bh - 2, class: 'viz-value' }, svg).textContent = `${fmt(r.value)}${r.note ? `  ${r.note}` : ''}`;
    const hit = el('rect', { x: 0, y: y0 - 3, width: w, height: bh + 6, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', (ev) => showTip(`<div class="viz-tip-h">${esc(r.label)}</div><div>${esc(fmt(r.value))}${r.note ? ` · ${esc(r.note)}` : ''}</div>`, ev.clientX, ev.clientY));
    hit.addEventListener('pointerleave', hideTip);
    bar.setAttribute('pointer-events', 'none');
  });
}

// Stacked columns. labels: x labels; series: [{ name, color, values: [n per label] }]
export function stackedChart(host, labels, series, { fmt = (v) => v, xFmt = (v) => v, height, ariaLabel = '', diverging = false } = {}) {
  const { svg, w, h } = frame(host, height);
  svg.setAttribute('aria-label', ariaLabel);
  if (!labels.length) return;
  const m = { l: 36, r: 8, t: 10, b: 24 };
  const pos = labels.map((_, i) => series.filter((s) => !s.negative).reduce((a, s) => a + (s.values[i] || 0), 0));
  const neg = labels.map((_, i) => series.filter((s) => s.negative).reduce((a, s) => a + (s.values[i] || 0), 0));
  const maxP = niceMax(Math.max(...pos, 1));
  const maxN = diverging ? niceMax(Math.max(...neg, 1)) : 0;
  const total = maxP + maxN;
  const y = (v) => m.t + ((maxP - v) / total) * (h - m.t - m.b);
  el('line', { x1: m.l, x2: w - m.r, y1: y(0), y2: y(0), class: 'viz-base' }, svg);
  el('text', { x: m.l - 6, y: y(maxP) + 4, 'text-anchor': 'end', class: 'viz-tick' }, svg).textContent = fmt(maxP);
  if (diverging) el('text', { x: m.l - 6, y: y(-maxN) + 4, 'text-anchor': 'end', class: 'viz-tick' }, svg).textContent = fmt(maxN);
  const slot = (w - m.l - m.r) / labels.length;
  const bw = Math.min(28, slot * 0.6);
  labels.forEach((lb, i) => {
    const cx = m.l + slot * i + slot / 2;
    let up = 0;
    let down = 0;
    for (const s of series) {
      const v = s.values[i] || 0;
      if (!v) continue;
      const top = s.negative ? y(-down) : y(up + v);
      const bottom = s.negative ? y(-(down + v)) : y(up);
      el('rect', { x: cx - bw / 2, y: top + 1, width: bw, height: Math.max(1, bottom - top - 2), rx: 2, fill: s.color }, svg);
      if (s.negative) down += v; else up += v;
    }
    el('text', { x: cx, y: h - 6, 'text-anchor': 'middle', class: 'viz-tick' }, svg).textContent = xFmt(lb);
    const hit = el('rect', { x: cx - slot / 2, y: m.t, width: slot, height: h - m.t - m.b, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', (ev) => {
      const rows = series.map((s) => `<div><i style="background:${s.color}"></i>${esc(s.name)}<b>${fmt(s.values[i] || 0)}</b></div>`).join('');
      showTip(`<div class="viz-tip-h">${esc(xFmt(lb, true))}</div>${rows}`, ev.clientX, ev.clientY);
    });
    hit.addEventListener('pointerleave', hideTip);
  });
}

export function legend(host, series) {
  host.innerHTML = series.map((s) => `<span class="viz-key"><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');
}
