// Читалка
import { h, ic, debounce, chTag } from '../ui.js';
import { state, go, onJobs } from '../state.js';
import { coverEl } from '../cover.js';
import { renderChapter } from '../markdown.js';
import { exportPdfFlow } from './book.js';

export async function render(root, params) {
  let book = await window.api.books.get(params.id);
  if (!book) { go('library'); return; }
  window.api.books.opened(book.id);
  const s = state.settings;
  let fs = s.readerFont || 18;
  let width = s.readerWidth || 720;
  let family = s.readerFamily || 'serif';
  let tocOpen = true;

  const firstWithText = Math.max(0, book.chapters.findIndex((c) => c.sections.some((x) => x.content)));
  let idx = book.chapters.findIndex((c) => c.id === (params.chapterId || book.progress?.chapterId));
  if (idx < 0) idx = firstWithText;
  const resumeRatio = !params.chapterId && book.progress?.chapterId === book.chapters[idx]?.id ? book.progress.ratio || 0 : 0;

  const toc = h('aside.reader-toc');
  const scroller = h('div.reader-scroll');
  const progressBar = h('i');
  const chapTitle = h('span.small.muted', { style: { whiteSpace: 'nowrap' } });
  const reader = h('div.reader', toc, h('div.reader-main',
    h('div.reader-bar',
      h('button.icon-btn', { title: 'Назад', onclick: () => go('book', { id: book.id }) }, ic('back', 18)),
      h('button.icon-btn', { title: 'Оглавление', onclick: () => { tocOpen = !tocOpen; toc.classList.toggle('closed', !tocOpen); } }, ic('sidebar', 18)),
      h('div.rb-title.grow', book.title, ' ', chapTitle),
      h('button.icon-btn', { title: 'Меньше шрифт', onclick: () => setFs(fs - 1) }, h('span', { style: { fontSize: '12px', fontWeight: 700 } }, 'A−')),
      h('button.icon-btn', { title: 'Больше шрифт', onclick: () => setFs(fs + 1) }, h('span', { style: { fontSize: '15px', fontWeight: 700 } }, 'A+')),
      h('button.icon-btn', { title: 'Шрифт: с засечками / без', onclick: () => { family = family === 'serif' ? 'sans' : 'serif'; apply(); persist(); } }, ic('type', 17)),
      h('button.icon-btn', { title: 'Ширина колонки', onclick: () => { width = width >= 860 ? 620 : width + 120; apply(); persist(); } }, ic('columns', 17)),
      h('button.icon-btn', { title: 'Редактировать', onclick: () => go('editor', { id: book.id, chapterId: book.chapters[idx]?.id }) }, ic('pen', 17)),
      h('button.icon-btn', { title: 'Экспорт PDF', onclick: () => exportPdfFlow(book.id) }, ic('download', 17))),
    h('div.reader-progress', progressBar),
    scroller));
  root.append(reader);

  const persist = debounce(() => window.api.settings.set({ readerFont: fs, readerWidth: width, readerFamily: family }).then((r) => { state.settings = r; }), 600);
  const setFs = (v) => { fs = Math.max(14, Math.min(26, v)); apply(); persist(); };
  const apply = () => {
    reader.style.setProperty('--fs', `${fs}px`);
    reader.style.setProperty('--rw', `${width}px`);
    scroller.querySelector('.md')?.classList.toggle('sans', family === 'sans');
  };

  const drawToc = () => {
    toc.replaceChildren(
      h('div.rt-book', coverEl(book, state.info.mediaUrl), h('div', { style: { minWidth: 0 } }, h('div', { style: { fontWeight: 650, lineHeight: 1.3 } }, book.title), h('div.small.muted', book.author || ''))),
      ...book.chapters.flatMap((c, i) => {
        const empty = !c.sections.some((x) => x.content);
        const items = [h(`div.rt-ch${i === idx ? '.active' : ''}${empty ? '.empty' : ''}`, { onclick: () => open(i) }, h('span.n', `${i + 1}`), h('span', c.title))];
        if (i === idx && c.sections.length > 1) items.push(...c.sections.filter((x) => x.title).map((x) => h('div.rt-sec', { onclick: () => scrollToSec(x.id) }, x.title)));
        return items;
      }));
  };

  const scrollToSec = (sid) => {
    const el = scroller.querySelector(`#sec-${CSS.escape(sid)}`);
    if (el) scroller.scrollTo({ top: el.offsetTop - 20, behavior: 'smooth' });
  };

  const drawChapter = (keepScroll = false, ratio = 0) => {
    const c = book.chapters[idx];
    if (!c) { scroller.replaceChildren(h('div.reader-page', h('div.chap-pending', 'В книге пока нет глав.'))); return; }
    const prevTop = scroller.scrollTop;
    chapTitle.textContent = `· ${c.title}`;
    const hasText = c.sections.some((x) => x.content);
    const md = h(`div.md${family === 'sans' ? '.sans' : ''}.selectable`);
    md.innerHTML = hasText ? renderChapter(c, state.info.mediaUrl) : '';
    const job = state.jobs.get(book.id);
    const pending = c.sections.filter((x) => x.status !== 'done').length;
    const prev = book.chapters[idx - 1], next = book.chapters[idx + 1];
    const pageEl = h(`div.reader-page${keepScroll ? '' : '.fade'}`,
      h('div.chap-head',
        h('div.eyebrow', `Глава ${idx + 1} из ${book.chapters.length}`),
        h('h1', c.title),
        c.summary ? h('div.chap-sum', c.summary) : null,
        c.tags?.length ? h('div.row', { style: { gap: '6px', marginTop: '12px' } }, c.tags.map(chTag)) : null),
      c.image ? h('img.chap-img', { src: `${state.info.mediaUrl}/${encodeURIComponent(c.image)}`, alt: '' }) : null,
      md,
      !hasText || (book.source === 'ai' && pending) ? h('div.chap-pending', { style: { marginTop: hasText ? '30px' : 0 } },
        job?.state === 'running' && job.current?.chapterId === c.id ? h('div.row', { style: { justifyContent: 'center' } }, h('div.spinner'), 'ИИ пишет эту главу прямо сейчас…')
          : h('div', `${hasText ? 'Часть разделов' : 'Эта глава'} ещё не сгенерирована.`, h('div', { style: { marginTop: '12px' } }, h('button.btn.btn-soft', { onclick: () => go('book', { id: book.id }) }, ic('sparkles', 15), 'К генерации')))) : null,
      h('div.chap-nav',
        prev ? h('button', { onclick: () => open(idx - 1) }, h('div.d', '← Предыдущая'), h('div', prev.title)) : h('span'),
        next ? h('button.next', { onclick: () => open(idx + 1) }, h('div.d', 'Следующая →'), h('div', next.title)) : null));
    scroller.replaceChildren(pageEl);
    apply();
    if (keepScroll) scroller.scrollTop = prevTop;
    else if (ratio) requestAnimationFrame(() => { scroller.scrollTop = ratio * (scroller.scrollHeight - scroller.clientHeight); });
    else scroller.scrollTop = 0;
    if (params.sectionId && !keepScroll) { const sid = params.sectionId; params.sectionId = null; requestAnimationFrame(() => scrollToSec(sid)); }
    onScroll();
  };

  const open = (i) => {
    if (i < 0 || i >= book.chapters.length) return;
    idx = i;
    drawToc();
    drawChapter();
    saveProgress();
  };

  const saveProgress = debounce(() => {
    const c = book.chapters[idx];
    if (!c) return;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const ratio = max > 0 ? scroller.scrollTop / max : 1;
    const bookRatio = (idx + ratio) / Math.max(1, book.chapters.length);
    window.api.books.progress(book.id, { chapterId: c.id, chapterTitle: c.title, ratio, book: Math.min(1, bookRatio) });
  }, 700);

  const onScroll = () => {
    const max = scroller.scrollHeight - scroller.clientHeight;
    const ratio = max > 0 ? scroller.scrollTop / max : 1;
    progressBar.style.width = `${Math.round(((idx + ratio) / Math.max(1, book.chapters.length)) * 100)}%`;
    saveProgress();
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });

  const onKey = (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight' && e.altKey === false && e.ctrlKey) open(idx + 1);
    else if (e.key === 'ArrowLeft' && e.ctrlKey) open(idx - 1);
    else if (e.key === 'Escape') go('book', { id: book.id });
  };
  document.addEventListener('keydown', onKey);

  drawToc();
  drawChapter(false, resumeRatio);

  // Живое обновление, если книга генерируется
  let t;
  const off = onJobs((p) => {
    if (p.bookId !== book.id || !(p.tick || p.finished)) return;
    clearTimeout(t);
    t = setTimeout(async () => {
      const fresh = await window.api.books.get(book.id);
      if (!fresh) return;
      const curId = book.chapters[idx]?.id;
      book = fresh;
      idx = Math.max(0, book.chapters.findIndex((c) => c.id === curId));
      drawToc();
      if (p.current?.chapterId === curId || p.finished) drawChapter(true);
    }, 300);
  });

  return () => { off(); clearTimeout(t); document.removeEventListener('keydown', onKey); saveProgress.flush(); };
}
