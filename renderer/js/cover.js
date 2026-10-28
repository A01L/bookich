// Обложка книги: изображение (ИИ/своё) или сгенерированный узор + типографика
import { escapeHtml } from './markdown.js';

const PALETTES = [
  ['#2479f2', '#7cc0ff', '#0b3c8c'],
  ['#0e88a8', '#5fd3e8', '#06405a'],
  ['#4f5bd5', '#9aa6ff', '#252a7a'],
  ['#1769aa', '#56b4f5', '#0b2d4a'],
  ['#1e4fbf', '#6aa3ff', '#0c1f52'],
  ['#118a7e', '#5edcc8', '#063f3a'],
  ['#3b6fd8', '#ffb35c', '#142e66'],
];

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let s = seed || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296;
}

export function patternSvg(seedStr) {
  const seed = hash(seedStr);
  const r = rng(seed);
  const [a, b, c] = PALETTES[seed % PALETTES.length];
  const kind = (seed >> 4) % 4;
  let shapes = '';
  if (kind === 0) {
    for (let i = 0; i < 7; i++) shapes += `<circle cx="${(r() * 200).toFixed(1)}" cy="${(140 + r() * 180).toFixed(1)}" r="${(20 + r() * 70).toFixed(1)}" fill="${i % 2 ? b : '#fff'}" opacity="${(0.08 + r() * 0.22).toFixed(2)}"/>`;
  } else if (kind === 1) {
    for (let i = 0; i < 9; i++) shapes += `<circle cx="160" cy="250" r="${18 + i * 16}" fill="none" stroke="${i % 3 ? '#fff' : b}" stroke-width="${(1 + r() * 4).toFixed(1)}" opacity="${(0.15 + r() * 0.3).toFixed(2)}"/>`;
  } else if (kind === 2) {
    for (let i = 0; i < 6; i++) {
      const y = 170 + i * 24;
      shapes += `<path d="M-10 ${y} Q 50 ${y - 30 - r() * 20} 100 ${y} T 210 ${y}" fill="none" stroke="${i % 2 ? b : '#fff'}" stroke-width="${(2 + r() * 6).toFixed(1)}" opacity="${(0.2 + r() * 0.35).toFixed(2)}"/>`;
    }
  } else {
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(r() * 6) * 34, y = 140 + Math.floor(r() * 5) * 34;
      shapes += `<rect x="${x}" y="${y}" width="30" height="30" rx="7" fill="${i % 3 ? '#fff' : b}" opacity="${(0.1 + r() * 0.3).toFixed(2)}"/>`;
    }
  }
  return `<svg viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="cg${seed}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${c}"/></linearGradient>
    <radialGradient id="cr${seed}" cx=".85" cy=".1" r=".8"><stop offset="0" stop-color="${b}" stop-opacity=".55"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient></defs>
    <rect width="200" height="300" fill="url(#cg${seed})"/><rect width="200" height="300" fill="url(#cr${seed})"/>${shapes}</svg>`;
}

/** Возвращает DOM-элемент обложки */
export function coverEl(book, mediaUrl, { loading = false, cls = '' } = {}) {
  const el = document.createElement('div');
  const hasImg = book.cover && book.cover.file;
  el.className = `cover ${hasImg ? 'img' : 'gen'} ${loading ? 'loading' : ''} ${cls}`;
  const bg = hasImg
    ? `<img src="${mediaUrl}/${encodeURIComponent(book.cover.file)}" alt="" draggable="false" loading="lazy">`
    : patternSvg(book.id || book.title);
  el.innerHTML = `<div class="cover-bg">${bg}</div>
    <div class="cover-text">
      <div class="cover-title">${escapeHtml(book.title || 'Без названия')}</div>
      ${book.subtitle ? `<div class="cover-sub">${escapeHtml(book.subtitle)}</div>` : ''}
      ${book.author ? `<div class="cover-author">${escapeHtml(book.author)}</div>` : ''}
    </div><div class="cover-shine"></div>
    ${loading ? '<div class="cover-loader"><div class="spinner lg"></div></div>' : ''}`;
  return el;
}
