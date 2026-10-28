// Страница книги: обложка, аннотация, генерация, оглавление
import { h, ic, menu, modal, confirmDialog, promptDialog, toast, toastErr, statusBadge, chTag, plural, debounce } from '../ui.js';
import { state, go, onJobs } from '../state.js';
import { coverEl } from '../cover.js';

export const COVER_STYLES = ['Минимализм', 'Акварель', 'Флэт-иллюстрация', 'Изометрия 3D', 'Ретро-постер', 'Геометрия', 'Фотореализм', 'Аниме'];

// ---------------- Экспорт PDF ----------------
export function exportPdfFlow(bookId) {
  let size = 'A4';
  let withCover = true;
  const seg = h('div.seg', ['A4', 'A5', 'Letter'].map((s) => h(`button${s === size ? '.active' : ''}`, {
    onclick: (e) => { size = s; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.currentTarget)); },
  }, s)));
  const cb = h('input', { type: 'checkbox', checked: true, onchange: (e) => { withCover = e.target.checked; } });
  modal({
    title: 'Экспорт в PDF',
    body: [
      h('div.field', h('label', 'Формат страницы'), seg),
      h('label.switch', cb, h('span.track'), 'Обложка и оглавление'),
      h('div.hint', 'Схемы, таблицы и иллюстрации сохраняются в векторе. Номера страниц и закладки по главам добавляются автоматически.'),
    ],
    actions: [{ label: 'Отмена' }, {
      label: 'Сохранить PDF', primary: true,
      onClick: async (close) => {
        close();
        toast('Готовлю PDF…');
        try {
          const file = await window.api.export.pdf(bookId, { pageSize: size, cover: withCover, toc: withCover });
          if (file) {
            toast('PDF сохранён');
            window.api.shell.showItem(file);
          }
        } catch (e) { toastErr(e); }
        return false;
      },
    }],
  });
}

// ---------------- Обложка ----------------
export function coverDialog(book, onDone) {
  let style = book.cover?.style || book.options?.coverStyle || COVER_STYLES[0];
  const hasKey = state.settings.hasOpenaiKey;
  let mode = hasKey && state.settings.provider === 'openai' ? 'image' : 'art';
  const custom = h('input.input', { placeholder: 'Или опишите свой стиль: «пастель, горы на рассвете»' });
  const chips = h('div.row.wrap', { style: { gap: '6px' } });
  const renderChips = () => chips.replaceChildren(...COVER_STYLES.map((s) => h(`button.chip${s === style ? '.active' : ''}`, { onclick: () => { style = s; renderChips(); } }, s)));
  renderChips();
  const modeSeg = h('div.seg',
    h(`button${mode === 'image' ? '.active' : ''}`, { disabled: !hasKey, title: hasKey ? '' : 'Нужен OpenAI API key', onclick: (e) => { mode = 'image'; sw(e); } }, 'Изображение (OpenAI)'),
    h(`button${mode === 'art' ? '.active' : ''}`, { onclick: (e) => { mode = 'art'; sw(e); } }, 'Векторный арт (SVG)'));
  const sw = (e) => modeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.currentTarget));
  modal({
    title: 'Обложка с ИИ', width: 560,
    body: [
      h('div.field', h('label', 'Способ'), modeSeg,
        h('div.hint', hasKey ? 'Изображение рисует OpenAI Images. Векторный арт рисует текстовая модель (Claude или GPT).' : 'Векторный арт рисует текстовая модель. Для фото-обложек добавьте OpenAI key в настройках.')),
      h('div.field', h('label', 'Стиль'), chips, custom),
    ],
    actions: [{ label: 'Отмена' }, {
      label: 'Сгенерировать', primary: true,
      onClick: (close) => { close(); onDone?.({ mode, style: custom.value.trim() || style }); return false; },
    }],
  });
}

export async function runCover(bookId, opts, setLoading) {
  setLoading?.(true);
  try {
    await window.api.ai.cover(bookId, opts);
    toast('Обложка готова');
  } catch (e) { toastErr(e); } finally { setLoading?.(false); }
}

// ---------------- Панель плана генерации ----------------
export function planPanel(book, { onStarted, compact = false } = {}) {
  const pending = book.chapters.filter((c) => c.sections.some((s) => s.status !== 'done'));
  const remaining = Math.round(book.chapters.flatMap((c) => c.sections).filter((s) => s.status !== 'done').reduce((a, s) => a + s.pages, 0));
  let mode = 'all';
  let pages = Math.min(20, Math.max(1, remaining));
  const selected = new Set(pending.slice(0, 1).map((c) => c.id));
  let regenerate = false;

  const info = h('div.small.muted');
  const pagesIn = h('input.input', { type: 'number', min: 1, max: Math.max(1, remaining), value: pages, style: { width: '84px', height: '32px' } });
  const slider = h('input.range', { type: 'range', min: 1, max: Math.max(1, remaining), value: pages });
  const sync = (v) => { pages = Math.max(1, Math.min(remaining || 1, Number(v) || 1)); pagesIn.value = pages; slider.value = pages; update(); };
  pagesIn.addEventListener('change', () => sync(pagesIn.value));
  slider.addEventListener('input', () => sync(slider.value));

  const chList = h('div.check-list', book.chapters.map((c, i) => {
    const done = c.sections.every((s) => s.status === 'done');
    const cb = h('input', { type: 'checkbox', checked: selected.has(c.id), onchange: (e) => { e.target.checked ? selected.add(c.id) : selected.delete(c.id); update(); } });
    return h('label.check-row', cb, h('span.grow', `${i + 1}. ${c.title}`), done ? h('span.done-mark', '✓ готова') : h('span.small.muted', `${Math.round(c.sections.reduce((a, s) => a + s.pages, 0))} стр.`));
  }));
  const regenCb = h('label.switch', { style: { marginTop: '8px', fontSize: '13px' } },
    h('input', { type: 'checkbox', onchange: (e) => { regenerate = e.target.checked; update(); } }), h('span.track'), 'Перегенерировать уже готовые разделы');

  const opt = (key, title, desc, extra) => {
    const el = h(`div.radio-card${mode === key ? '.active' : ''}`, { dataset: { k: key }, onclick: () => { mode = key; cards.forEach((c) => c.classList.toggle('active', c.dataset.k === key)); extras(); update(); } },
      h('div.rc-dot'), h('div.grow', h('div.rc-t', title), h('div.rc-d', desc), extra ? h('div', { class: 'rc-extra', onclick: (e) => e.stopPropagation() }, extra) : null));
    return el;
  };
  const pagesBox = h('div.row', { style: { marginTop: '10px', gap: '12px' } }, slider, pagesIn, h('span.small.muted', 'стр.'));
  const chBox = h('div', chList, regenCb);
  const cards = [
    opt('all', 'Вся книга', `Программа сама поделит ≈${remaining} стр. на небольшие куски и сгенерирует всё по порядку.`),
    opt('pages', 'Только часть', 'Выпустить определённое количество страниц сейчас, остальное — позже.', pagesBox),
    opt('chapters', 'Выбранные главы', 'Сгенерировать или перегенерировать конкретные главы.', chBox),
  ];
  const extras = () => { pagesBox.classList.toggle('hidden', mode !== 'pages'); chBox.classList.toggle('hidden', mode !== 'chapters'); };
  extras();

  const plan = () => ({ mode, pages, chapterIds: [...selected], regenerate });
  const update = debounce(async () => {
    try {
      const q = await window.api.gen.plan(book.id, plan());
      const req = Math.ceil(q.pages * (book.options?.visual ? 230 : 280) / (state.settings.chunkWords || 1000)) + q.count * 0;
      info.textContent = q.count ? `К генерации: ${q.count} ${plural(q.count, 'раздел', 'раздела', 'разделов')} · ≈${Math.round(q.pages)} стр. · ≈${Math.max(q.count, req)} ${plural(Math.max(q.count, req), 'запрос', 'запроса', 'запросов')} к ИИ` : 'Нечего генерировать — выберите главы или включите перегенерацию.';
      startBtn.disabled = !q.count;
    } catch (e) { info.textContent = e.message; }
  }, 120);

  const startBtn = h('button.btn.btn-primary.btn-lg', { onclick: async () => {
    startBtn.disabled = true;
    try {
      await window.api.gen.start(book.id, plan());
      onStarted?.();
    } catch (e) { toastErr(e); startBtn.disabled = false; }
  } }, ic('play', 16), 'Начать генерацию');

  update();
  return h('div.col', { style: { gap: '10px' } }, ...cards, h('div.row', { style: { marginTop: compact ? '4px' : '8px' } }, info, h('div.spacer'), startBtn));
}

// ---------------- Страница книги ----------------
export async function render(root, { id }) {
  let book = await window.api.books.get(id);
  if (!book) { go('library'); return; }
  const page = h('div.page');
  root.append(page);
  let coverLoading = false;

  const draw = () => {
    const job = state.jobs.get(book.id);
    const live = job && ['running', 'stopping'].includes(job.state);
    const allDone = book.chapters.length && book.chapters.every((c) => c.sections.every((s) => s.status === 'done'));
    const hasContent = book.stats.words > 0;
    const coverBox = h('div', coverEl(book, state.info.mediaUrl, { loading: coverLoading }),
      h('div.cover-actions',
        h('button.btn.btn-sm.btn-soft', { onclick: () => coverDialog(book, (o) => runCover(book.id, o, (v) => { coverLoading = v; reload(); })) }, ic('sparkles', 15), 'Обложка ИИ'),
        h('button.icon-btn', { title: 'Своё изображение', onclick: async () => {
          const f = await window.api.media.import();
          if (f) { await window.api.books.update(book.id, { cover: { type: 'image', file: f } }); reload(); }
        } }, ic('upload', 17)),
        book.cover?.file ? h('button.icon-btn', { title: 'Убрать (узор)', onclick: async () => { await window.api.books.update(book.id, { cover: {} }); reload(); } }, ic('x', 17)) : null));

    const stats = h('div.stats',
      stat(book.stats.chapters, plural(book.stats.chapters, 'глава', 'главы', 'глав')),
      book.source === 'ai' ? stat(`${book.stats.pagesDone}/${book.stats.plannedPages}`, 'страниц готово') : stat(`≈${book.stats.estPages}`, 'страниц'),
      stat(book.stats.words.toLocaleString('ru-RU'), 'слов'),
      book.progress?.book ? stat(`${Math.round(book.progress.book * 100)}%`, 'прочитано') : null);

    const actions = h('div.row.wrap',
      h('button.btn.btn-primary', { disabled: !hasContent, onclick: () => go('reader', { id: book.id }) }, ic('book', 16), book.progress?.chapterId ? 'Продолжить чтение' : 'Читать'),
      h('button.btn', { onclick: () => go('editor', { id: book.id }) }, ic('pen', 16), 'Редактор'),
      book.source === 'ai' && !allDone ? h('button.btn', { onclick: () => go('wizard', { bookId: book.id, step: 2 }) }, ic('list', 16), 'Содержание') : null,
      h('button.btn', { disabled: !hasContent, onclick: () => exportPdfFlow(book.id) }, ic('download', 16), 'PDF'),
      h('button.icon-btn', { onclick: (e) => menu(e.currentTarget, [
        { icon: 'file', label: 'Экспорт в Markdown', onClick: async () => { try { const f = await window.api.export.md(book.id); if (f) toast('Markdown сохранён'); } catch (e2) { toastErr(e2); } } },
        { icon: 'pen', label: 'Переименовать', onClick: async () => { const t = await promptDialog('Название книги', { value: book.title }); if (t) { await window.api.books.update(book.id, { title: t }); reload(); } } },
        '-',
        { icon: 'trash', label: 'Удалить книгу', danger: true, onClick: async () => {
          if (await confirmDialog('Удалить книгу?', `«${book.title}» будет удалена без возможности восстановления.`)) { await window.api.books.delete(book.id); toast('Книга удалена'); go('library'); }
        } },
      ]) }, ic('more', 18)));

    const info = h('div.book-info',
      h('div.row', statusBadge(live ? 'generating' : book.status, live), book.source === 'ai' ? h('span.small.muted', 'Создана с ИИ') : null),
      h('div.h1', book.title),
      book.subtitle ? h('div.h3.muted', { style: { fontWeight: 500 } }, book.subtitle) : null,
      book.author ? h('div.small.muted', book.author) : null,
      book.annotation ? h('div.annotation.selectable', book.annotation) : null,
      book.tags.length ? h('div.row.wrap', { style: { gap: '6px' } }, book.tags.map((t) => h('span.tag', `#${t}`))) : null,
      stats, actions);

    // Генерация
    let genCard = null;
    if (book.source === 'ai' && (live || !allDone || (job && job.state !== 'done'))) genCard = generationCard(book, job);

    const toc = h('div.card', h('div.card-head', h('div.h3.grow', 'Оглавление'), h('span.small.muted', `${book.stats.sectionsDone}/${book.stats.sections} разделов`)),
      h('div.toc-list', book.chapters.map((c, i) => tocChapter(book, c, i, job))));

    page.replaceChildren(
      h('div.book-hero', coverBox, info),
      genCard ? h('div.two-col', toc, genCard) : toc);
  };

  const stat = (v, l) => h('div.stat', h('div.v', v), h('div.l', l));

  const tocChapter = (b, c, i, job) => {
    const pages = Math.round(c.sections.reduce((a, s) => a + s.pages, 0) * 10) / 10;
    const hasText = c.sections.some((s) => s.content);
    return h('div.toc-ch',
      h('div.toc-ch-head', { onclick: () => hasText && go('reader', { id: b.id, chapterId: c.id }) },
        h('div.toc-num', i + 1),
        h('div.grow', h('div', { style: { fontWeight: 600 } }, c.title), c.summary ? h('div.small.muted', c.summary) : null),
        h('div.row', { style: { gap: '4px' } }, (c.tags || []).map(chTag)),
        b.source === 'ai' ? h('span.small.muted', { style: { minWidth: '52px', textAlign: 'right' } }, `${pages} стр.`) : null),
      b.source === 'ai' || c.sections.length > 1 ? h('div.toc-secs', c.sections.map((s, j) => {
        const isCur = job?.current?.sectionId === s.id && job.state === 'running';
        const st = isCur || s.status === 'generating' ? h('div.st-icon', h('div.spinner', { style: { width: '13px', height: '13px' } }))
          : h(`div.st-icon.${s.status === 'done' ? 'done' : s.status === 'error' ? 'error' : 'pending'}`, ic(s.status === 'done' ? 'check' : s.status === 'error' ? 'alert' : 'clock', 14, 2.2));
        return h('div.toc-sec', { title: s.error || s.brief || '' }, st,
          h('span.grow', `${i + 1}.${j + 1} ${s.title || 'Без названия'}`),
          isCur ? h('span.small', { style: { color: 'var(--primary-700)' } }, `часть ${job.current.part}/${job.current.parts}`) : null,
          h('div.actions',
            s.content ? h('button.icon-btn.sm', { title: 'Читать', onclick: () => go('reader', { id: b.id, chapterId: c.id, sectionId: s.id }) }, ic('eye', 15)) : null,
            b.source === 'ai' && s.status === 'done' ? h('button.icon-btn.sm', { title: 'Переписать с ИИ', onclick: () => rewriteFlow(s) }, ic('sparkles', 15)) : null));
      })) : null);
  };

  const rewriteFlow = async (s) => {
    const instr = await promptDialog(`Переписать «${s.title}»`, { label: 'Что изменить?', placeholder: 'Например: проще, больше примеров, добавь схему', multiline: true, okLabel: 'Переписать', hint: 'Ctrl+Enter — отправить' });
    if (!instr) return;
    toast('ИИ переписывает раздел…');
    try { await window.api.ai.rewriteSection(s.id, instr); toast('Раздел обновлён'); reload(); } catch (e) { toastErr(e); }
  };

  const generationCard = (b, job) => {
    const card = h('div.card.card-pad.gen-card');
    const add = (...xs) => card.append(...xs.filter(Boolean));
    const running = job && ['running', 'stopping'].includes(job.state);
    if (running || job?.state === 'paused' || job?.state === 'error') {
      const pct = b.stats.plannedPages ? Math.round((b.stats.pagesDone / b.stats.plannedPages) * 100) : 0;
      add(
        h('div.row', h('div.h3.grow', running ? 'Идёт генерация' : job.state === 'error' ? 'Генерация остановлена' : 'Пауза'),
          running ? h('button.btn.btn-sm', { disabled: job.state === 'stopping', onclick: () => window.api.gen.pause(b.id) }, ic('pause', 14), job.state === 'stopping' ? 'Останавливаю…' : 'Пауза') : null),
        h(`div.progress.lg${running ? '.running' : ''}`, h('i', { style: { width: `${pct}%` } })),
        h('div.row.small.muted', h('span.grow', `${b.stats.pagesDone} из ${b.stats.plannedPages} стр.`), h('span', `${pct}%`)),
        job.current ? h('div.small', { style: { margin: '8px 0' } }, h('div', { style: { fontWeight: 600 } }, job.current.section), h('div.muted', `${job.current.chapter} · часть ${job.current.part} из ${job.current.parts} · раздел ${job.index + 1} из ${job.total}`)) : null,
        job.error ? h('div.test-out.err', job.error) : null,
        job.log?.length ? h('details', { style: { marginTop: '10px' } }, h('summary.small.muted', { style: { cursor: 'pointer' } }, 'Журнал'),
          h('div.gen-log', { style: { marginTop: '8px' } }, job.log.slice().reverse().map((l) => h('div', `${new Date(l.t).toLocaleTimeString('ru-RU')}  ${l.msg}`)))) : null);
      if (!running) {
        add(h('div', { style: { marginTop: '16px' } }, h('div.label', { style: { marginBottom: '8px' } }, 'Продолжить'), planPanel(b, { compact: true, onStarted: reload })));
      }
    } else {
      add(h('div.h3', { style: { marginBottom: '4px' } }, 'Генерация книги'),
        h('div.small.muted', { style: { marginBottom: '14px' } }, `Готово ${b.stats.pagesDone} из ${b.stats.plannedPages} стр. Выберите, сколько выпустить сейчас.`),
        planPanel(b, { compact: true, onStarted: reload }));
    }
    return card;
  };

  const reload = async () => { book = await window.api.books.get(id); if (book) draw(); };
  draw();

  let t;
  const off = onJobs((p) => {
    if (p.bookId !== id) return;
    clearTimeout(t);
    t = setTimeout(reload, p.finished ? 0 : 250);
  });
  return () => { off(); clearTimeout(t); };
}
