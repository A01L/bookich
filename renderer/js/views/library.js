// Библиотека
import { h, ic, menu, confirmDialog, toast, toastErr, modal, statusBadge, pagesStr } from '../ui.js';
import { state, go, onJobs } from '../state.js';
import { coverEl } from '../cover.js';
import { exportPdfFlow } from './book.js';

let filter = 'all';
let query = '';

export async function createManual() {
  const title = h('input.input', { placeholder: 'Например: Мои заметки о путешествиях' });
  const author = h('input.input', { placeholder: 'Ваше имя', value: state.settings.author || '' });
  modal({
    title: 'Новая книга',
    body: [h('div.field', h('label', 'Название'), title), h('div.field', h('label', 'Автор'), author)],
    actions: [{ label: 'Отмена' }, {
      label: 'Создать', primary: true,
      onClick: async () => {
        try {
          const b = await window.api.books.create({ title: title.value.trim() || 'Новая книга', author: author.value.trim() });
          setTimeout(() => go('editor', { id: b.id }), 50);
        } catch (e) { toastErr(e); return false; }
      },
    }],
  });
}

export async function render(root) {
  const books = await window.api.books.list();
  const page = h('div.page');
  root.append(page);

  const grid = h('div.grid');
  const counts = {
    all: books.length,
    reading: books.filter((b) => b.progress?.chapterId).length,
    ai: books.filter((b) => b.source === 'ai').length,
    manual: books.filter((b) => b.source === 'manual').length,
    drafts: books.filter((b) => ['outline', 'partial', 'generating'].includes(b.status)).length,
  };
  const FILTERS = [['all', 'Все'], ['reading', 'Читаю'], ['ai', 'ИИ-книги'], ['manual', 'Мои'], ['drafts', 'В работе']];

  const head = h('div.lib-head',
    h('div.grow', h('div.h1', 'Библиотека'), h('div.muted', books.length ? `${books.length} ${books.length % 10 === 1 && books.length % 100 !== 11 ? 'книга' : [2, 3, 4].includes(books.length % 10) && ![12, 13, 14].includes(books.length % 100) ? 'книги' : 'книг'}` : 'Здесь появятся ваши книги')),
    h('button.btn', { onclick: createManual }, ic('pen', 16), 'Новая книга'),
    h('button.btn.btn-primary', { onclick: () => go('wizard') }, ic('sparkles', 16), 'Создать с ИИ'));
  page.append(head);

  if (!books.length) {
    page.append(h('div.empty',
      h('div.art', ic('book', 54, 1.4)),
      h('div.h2', { style: { color: 'var(--text)' } }, 'Пока ни одной книги'),
      h('p', 'Опишите, что хотите изучить, — ИИ составит содержание, обложку и напишет книгу до 200 страниц.'),
      h('div.row', { style: { justifyContent: 'center', marginTop: '18px' } },
        h('button.btn.btn-primary.btn-lg', { onclick: () => go('wizard') }, ic('sparkles', 18), 'Создать книгу с ИИ'),
        h('button.btn.btn-lg', { onclick: createManual }, 'Написать самому'))));
    return;
  }

  // Продолжить чтение
  const last = books.filter((b) => b.progress?.chapterId && b.opened_at).sort((a, b) => b.opened_at - a.opened_at)[0];
  if (last) {
    const ch = last.progress;
    page.append(h('div.continue', { onclick: () => go('reader', { id: last.id }) },
      coverEl(last, state.info.mediaUrl),
      h('div.grow',
        h('div.eyebrow', 'Продолжить чтение'),
        h('div.h2', { style: { margin: '6px 0 4px' } }, last.title),
        h('div.muted', ch.chapterTitle ? `Глава: ${ch.chapterTitle}` : ''),
        h('div.progress', { style: { maxWidth: '360px', marginTop: '12px' } }, h('i', { style: { width: `${Math.round((ch.book || 0) * 100)}%` } }))),
      h('button.btn.btn-primary', ic('book', 16), 'Читать')));
  }

  const search = h('input.input', { placeholder: 'Поиск по названию, тегам…', value: query });
  const chips = h('div.row.wrap', { style: { gap: '6px' } });
  const tools = h('div.lib-tools', h('div.search', ic('search', 16), search), chips);
  page.append(tools, grid);

  const renderChips = () => chips.replaceChildren(...FILTERS.map(([k, l]) =>
    h(`button.chip${filter === k ? '.active' : ''}`, { onclick: () => { filter = k; renderChips(); renderGrid(); } }, l, counts[k] ? h('span.muted', counts[k]) : null)));

  const pct = (b) => {
    const job = state.jobs.get(b.id);
    if (b.source === 'ai' && b.status !== 'done') return b.stats.plannedPages ? b.stats.pagesDone / b.stats.plannedPages : 0;
    return b.progress?.book || 0;
  };

  const renderGrid = () => {
    const q = query.toLowerCase();
    const list = books.filter((b) => {
      if (filter === 'reading' && !b.progress?.chapterId) return false;
      if (filter === 'ai' && b.source !== 'ai') return false;
      if (filter === 'manual' && b.source !== 'manual') return false;
      if (filter === 'drafts' && !['outline', 'partial', 'generating'].includes(b.status)) return false;
      if (q && !`${b.title} ${b.subtitle} ${b.tags.join(' ')} ${b.annotation}`.toLowerCase().includes(q)) return false;
      return true;
    });
    grid.replaceChildren(...list.map((b, i) => {
      const job = state.jobs.get(b.id);
      const live = job && job.state === 'running';
      const menuBtn = h('button.icon-btn', { title: 'Действия', onclick: (e) => { e.stopPropagation(); openMenu(e.currentTarget, b); } }, ic('more', 18));
      const cover = coverEl(b, state.info.mediaUrl);
      cover.append(h('div.card-menu', menuBtn));
      const p = pct(b);
      return h('div.book-card', { style: { animationDelay: `${Math.min(i, 10) * 18}ms` }, onclick: () => go('book', { id: b.id }) },
        cover,
        h('div',
          h('div.bt', b.title),
          h('div.bm', { style: { marginTop: '6px' } }, statusBadge(live ? 'generating' : b.status, live),
            h('span', b.source === 'ai' ? `${b.stats.plannedPages} стр.` : `≈ ${b.stats.estPages} стр.`))),
        p > 0 ? h('div.progress', h('i', { style: { width: `${Math.round(p * 100)}%` } })) : null);
    }));
    if (!list.length) grid.append(h('div.muted', { style: { gridColumn: '1 / -1', padding: '30px 0' } }, 'Ничего не найдено'));
  };

  const openMenu = (anchor, b) => menu(anchor, [
    { icon: 'book', label: 'Читать', onClick: () => go('reader', { id: b.id }) },
    { icon: 'pen', label: 'Редактировать', onClick: () => go('editor', { id: b.id }) },
    { icon: 'download', label: 'Экспорт в PDF', onClick: () => exportPdfFlow(b.id) },
    '-',
    { icon: 'trash', label: 'Удалить', danger: true, onClick: async () => {
      if (await confirmDialog('Удалить книгу?', `«${b.title}» будет удалена без возможности восстановления.`)) {
        try { await window.api.books.delete(b.id); toast('Книга удалена'); go('library'); } catch (e) { toastErr(e); }
      }
    } },
  ]);

  search.addEventListener('input', () => { query = search.value; renderGrid(); });
  renderChips();
  renderGrid();

  // Живое обновление статусов генерации
  let t;
  const off = onJobs((p) => { if (p.finished || p.tick) { clearTimeout(t); t = setTimeout(async () => {
    const fresh = await window.api.books.list();
    books.splice(0, books.length, ...fresh);
    renderGrid();
  }, 400); } });
  return () => { off(); clearTimeout(t); };
}

export { pagesStr };
