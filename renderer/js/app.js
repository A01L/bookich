// Точка входа интерфейса Bookich
import { h, ic } from './ui.js';
import { state, setRouter, emitJobs, go } from './state.js';
import * as library from './views/library.js';
import * as book from './views/book.js';
import * as reader from './views/reader.js';
import * as editor from './views/editor.js';
import * as wizard from './views/wizard.js';
import * as settings from './views/settings.js';

const VIEWS = { library, book, reader, editor, wizard, settings };
const IMMERSIVE = new Set(['reader', 'editor']);
const viewEl = document.getElementById('view');
const titleEl = document.getElementById('titlebar');
let cleanup = null;
let navToken = 0;

function renderSidebar() {
  const sb = document.getElementById('sidebar');
  const r = state.route.name;
  const item = (name, label, iconName, extra = '') =>
    h(`button.nav-item${extra}${r === name ? '.active' : ''}`, { onclick: () => go(name) }, ic(iconName, 18), label);
  sb.replaceChildren(
    h('div.brand', h('div.brand-mark', { html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h9.5A3.5 3.5 0 0 1 19 7v12.5a1 1 0 0 1-1 1H7.5A2.5 2.5 0 0 1 5 18V4.5a1 1 0 0 1 1-1z" fill="rgba(255,255,255,.16)"/><path d="M5 17.5A2.5 2.5 0 0 1 7.5 15H19"/><path d="M9 7.5h6M9 10.5h4"/></svg>' }),
      h('div.brand-name', 'Book', h('span', 'ich'))),
    h('nav.nav',
      item('wizard', 'Создать с ИИ', 'sparkles', '.nav-cta'),
      item('library', 'Библиотека', 'library'),
      h('button.nav-item', { onclick: () => library.createManual() }, ic('pen', 18), 'Новая книга'),
      h('div.nav-sep'),
      item('settings', 'Настройки', 'sliders'),
    ),
    h('div.jobs', { id: 'jobs' }),
  );
  renderJobs();
}

function renderJobs() {
  const box = document.getElementById('jobs');
  if (!box) return;
  const items = [...state.jobs.values()].filter((j) => ['running', 'stopping', 'paused', 'error'].includes(j.state) || j.recentDone);
  box.replaceChildren(...items.map((j) => {
    const pct = j.total ? Math.round(((j.index + (j.current ? (j.current.part - 1) / j.current.parts : 0)) / j.total) * 100) : 0;
    const status = j.state === 'running' ? (j.current ? `${j.current.section} · ${j.current.part}/${j.current.parts}` : 'Подготовка…')
      : j.state === 'paused' ? 'На паузе' : j.state === 'error' ? 'Ошибка — нажмите' : j.state === 'stopping' ? 'Останавливаю…' : 'Готово';
    return h('div.job-mini', { onclick: () => go('book', { id: j.bookId }) },
      h('div.row', { style: { gap: '8px' } }, j.state === 'running' ? h('div.spinner') : ic(j.state === 'error' ? 'alert' : j.state === 'done' ? 'check' : 'pause', 15),
        h('div.t.grow', j.title)),
      h('div.s', status),
      h(`div.progress${j.state === 'running' ? '.running' : ''}`, h('i', { style: { width: `${j.state === 'done' ? 100 : pct}%` } })));
  }));
}

async function navigate(name, params = {}) {
  const View = VIEWS[name] || library;
  const token = ++navToken;
  try { cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null;
  state.route = { name, params };
  document.getElementById('app').classList.toggle('immersive', IMMERSIVE.has(name));
  titleEl.classList.toggle('hidden', IMMERSIVE.has(name));
  renderSidebar();
  const container = h('div.view-enter', { style: IMMERSIVE.has(name) ? { position: 'absolute', inset: '0' } : null });
  viewEl.replaceChildren(container);
  viewEl.scrollTop = 0;
  titleEl.textContent = '';
  try {
    const c = await View.render(container, params, { setTitle: (t) => { titleEl.textContent = t || ''; } });
    if (token === navToken) cleanup = c || null;
    else c?.();
  } catch (e) {
    console.error(e);
    container.replaceChildren(h('div.page', h('div.empty', h('div.h2', 'Что-то пошло не так'), h('p', e.message),
      h('button.btn', { onclick: () => go('library') }, 'В библиотеку'))));
  }
}

async function boot() {
  setRouter(navigate);
  window.__bookich = { go, state };
  state.info = await window.api.app.info();
  state.settings = await window.api.settings.get();
  for (const j of await window.api.gen.status()) state.jobs.set(j.bookId, j);
  window.api.onProgress((p) => {
    const prev = state.jobs.get(p.bookId);
    if (p.state === 'done' && prev?.state !== 'done') p.recentDone = true;
    state.jobs.set(p.bookId, p);
    renderJobs();
    emitJobs(p);
    if (p.state === 'done' && p.finished) {
      setTimeout(() => { const j = state.jobs.get(p.bookId); if (j?.state === 'done') { state.jobs.delete(p.bookId); window.api.gen.dismiss(p.bookId); renderJobs(); } }, 15000);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); go('wizard'); }
  });
  navigate('library');
}

boot();
