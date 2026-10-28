// Мастер «Создать с ИИ»: идея → содержание → обложка и запуск
import { h, ic, toast, toastErr, debounce, autosize, uid, menu, promptDialog, CH_TAGS, plural } from '../ui.js';
import { state, go } from '../state.js';
import { coverEl } from '../cover.js';
import { planPanel, coverDialog, runCover, COVER_STYLES } from './book.js';

const IDEAS = [
  'Изучить Python с нуля до первых проектов',
  'Как устроены нейросети — простым языком',
  'История Древнего Рима для любознательных',
  'Личные финансы: бюджет, накопления, инвестиции',
  'Английский для путешествий за 30 дней',
  'Основы UX/UI-дизайна',
  'Фантастическая повесть о колонии на Марсе',
];
const KINDS = [
  ['study', 'Учебник', 'От простого к сложному, упражнения'],
  ['guide', 'Гайд', 'Шаги, чек-листы, советы'],
  ['nonfiction', 'Нон-фикшн', 'Увлекательно о фактах'],
  ['fiction', 'Художественная', 'Сюжет и персонажи'],
  ['reference', 'Справочник', 'Статьи и таблицы'],
];
const LEVELS = ['Новичок', 'Средний', 'Продвинутый', 'Любой'];
const LANGS = [['ru', 'Русский'], ['en', 'English'], ['kk', 'Қазақша'], ['uk', 'Українська'], ['de', 'Deutsch'], ['es', 'Español'], ['fr', 'Français']];
const WAIT_MSGS = ['Продумываю структуру книги…', 'Выстраиваю логику глав…', 'Расставляю метки «рекомендуется» и «интересно»…', 'Распределяю страницы по разделам…', 'Пишу мини-аннотацию…'];

let draft = { prompt: '', kind: 'study', pages: 60, level: 'Новичок', language: 'ru', visual: true, chapterImages: false, extra: '', coverStyle: COVER_STYLES[0] };

function stepsBar(step, bookId) {
  const items = [['Идея', 1], ['Содержание', 2], ['Обложка и запуск', 3]];
  const out = [];
  items.forEach(([label, n], i) => {
    if (i) out.push(h('div.step-line'));
    const done = n < step;
    out.push(h(`div.step${n === step ? '.active' : ''}${done ? '.done' : ''}`, {
      style: { cursor: done && bookId && n > 1 ? 'pointer' : 'default' },
      onclick: () => { if (done && bookId && n > 1) go('wizard', { bookId, step: n }); },
    }, h('div.n', done ? ic('check', 13, 2.6) : n), label));
  });
  return h('div.steps', out);
}

export async function render(root, params = {}) {
  const step = params.bookId ? params.step || 2 : 1;
  const wrap = h('div.wizard');
  root.append(wrap);
  if (step === 1) return stepIdea(wrap);
  if (step === 2) return stepOutline(wrap, params.bookId);
  return stepLaunch(wrap, params.bookId);
}

// ================= Шаг 1: идея =================
function stepIdea(wrap) {
  const s = state.settings;
  draft.language = draft.language || s.language || 'ru';
  const prompt = h('textarea.textarea', { placeholder: 'Что хотите изучить или прочитать? Например: «Хочу разобраться в машинном обучении: от основ статистики до первых моделей на Python»', value: draft.prompt });
  prompt.addEventListener('input', () => { draft.prompt = prompt.value; });
  const ideas = h('div.ideas', IDEAS.map((t) => h('button.chip', { onclick: () => { prompt.value = t; draft.prompt = t; prompt.focus(); } }, t)));

  const kinds = h('div.kind-grid');
  const drawKinds = () => kinds.replaceChildren(...KINDS.map(([k, t, d]) => h(`div.kind${draft.kind === k ? '.active' : ''}`, { onclick: () => { draft.kind = k; drawKinds(); } }, h('div.k-t', t), h('div.k-d', d))));
  drawKinds();

  const pagesVal = h('div.pages-val', draft.pages);
  const pagesHint = h('div.hint');
  const range = h('input.range', { type: 'range', min: 5, max: state.info.maxPages || 200, step: 5, value: draft.pages });
  const updPages = () => {
    draft.pages = Number(range.value);
    pagesVal.textContent = draft.pages;
    const reqs = Math.ceil(draft.pages * (draft.visual ? 230 : 280) / (s.chunkWords || 1000));
    pagesHint.textContent = `≈ ${(draft.pages * (draft.visual ? 230 : 280)).toLocaleString('ru-RU')} слов · ≈ ${reqs} ${plural(reqs, 'запрос', 'запроса', 'запросов')} к ИИ. Генерировать можно частями.`;
  };
  range.addEventListener('input', updPages);
  updPages();

  const sel = (opts, val, on) => {
    const el = h('select.select', opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
    el.addEventListener('change', () => on(el.value));
    return el;
  };
  const toggle = (key, title, desc, disabled) => {
    const cb = h('input', { type: 'checkbox', checked: draft[key] && !disabled, disabled, onchange: (e) => { draft[key] = e.target.checked; updPages(); } });
    return h('label.toggle-card', { style: { cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 } },
      h('span.switch', cb, h('span.track')), h('div.grow', h('div', { style: { fontWeight: 600 } }, title), h('div.small.muted', desc)));
  };
  const extra = h('textarea.textarea', { rows: 3, placeholder: 'Пожелания: стиль, примеры из какой-то сферы, что обязательно включить или исключить…', value: draft.extra });
  extra.addEventListener('input', () => { draft.extra = extra.value; });

  const provName = s.mock ? 'Демо-режим' : s.provider === 'openai' ? `OpenAI · ${s.openaiModel}` : `Claude CLI${s.claudeModel ? ` · ${s.claudeModel}` : ''}`;
  const btn = h('button.btn.btn-primary.btn-lg', { onclick: () => submit() }, ic('sparkles', 18), 'Сгенерировать содержание');

  const form = h('div.col', { style: { gap: '22px' } },
    h('div', h('div.h1', 'Создать книгу с ИИ'), h('div.muted', { style: { marginTop: '4px' } }, 'Сначала ИИ предложит содержание, теги и мини-аннотацию — их можно перегенерировать или поправить точечно.')),
    h('div.hero-prompt', prompt, ideas),
    h('div.field', h('label', 'Тип книги'), kinds),
    h('div.opt-grid',
      h('div.field', { style: { gridColumn: 'span 1' } }, h('label', 'Объём'), h('div.pages-ctl', pagesVal, h('span.muted', 'стр.')), range, pagesHint),
      h('div.field', h('label', 'Уровень читателя'), sel(LEVELS.map((l) => [l, l]), draft.level, (v) => { draft.level = v; })),
      h('div.field', h('label', 'Язык книги'), sel(LANGS, draft.language, (v) => { draft.language = v; }))),
    h('div.opt-grid', { style: { gridTemplateColumns: '1fr 1fr' } },
      toggle('visual', 'Больше визуала', 'Поясняющие схемы, диаграммы, таблицы и выноски в каждом разделе'),
      toggle('chapterImages', 'Иллюстрации к главам', s.hasOpenaiKey ? 'Картинка в начале каждой главы (OpenAI Images)' : 'Нужен OpenAI API key в настройках', !s.hasOpenaiKey)),
    h('details', h('summary.label', { style: { cursor: 'pointer' } }, 'Дополнительные пожелания'), h('div', { style: { marginTop: '10px' } }, extra)),
    h('div.sticky-foot', h('span.small.muted', ic('terminal', 14), ' ', provName), h('div.spacer'), btn));
  wrap.append(stepsBar(1), form);
  setTimeout(() => prompt.focus(), 50);

  async function submit() {
    if (draft.prompt.trim().length < 3) { toast('Опишите, о чём должна быть книга', 'err'); prompt.focus(); return; }
    // Экран ожидания со скелетоном
    let i = 0;
    const msg = h('span', WAIT_MSGS[0]);
    const waitEl = h('div.gen-wait',
      h('div.msg', h('div.spinner.lg'), h('div', msg, h('div.small.muted', { style: { fontWeight: 400 } }, `${provName} · обычно 20–90 секунд`))),
      h('div.card.card-pad', { style: { marginBottom: '14px' } }, h('div.skeleton', { style: { height: '28px', width: '55%' } }), h('div.skeleton', { style: { height: '14px', width: '85%', marginTop: '14px' } }), h('div.skeleton', { style: { height: '14px', width: '70%', marginTop: '8px' } })),
      [0, 1, 2, 3].map((k) => h('div.card.card-pad', { style: { marginBottom: '10px', opacity: 1 - k * 0.2 } },
        h('div.row', h('div.skeleton', { style: { width: '28px', height: '28px' } }), h('div.skeleton', { style: { height: '18px', width: `${40 + (k * 13) % 30}%` } })),
        h('div.skeleton', { style: { height: '12px', width: '60%', margin: '12px 0 0 38px' } }))));
    const timer = setInterval(() => { i = (i + 1) % WAIT_MSGS.length; msg.textContent = WAIT_MSGS[i]; }, 3500);
    wrap.replaceChildren(stepsBar(1), waitEl);
    try {
      const book = await window.api.ai.outline({ ...draft, prompt: draft.prompt.trim() });
      draft.prompt = '';
      go('wizard', { bookId: book.id, step: 2 });
    } catch (e) {
      toastErr(e);
      wrap.replaceChildren();
      stepIdea(wrap);
    } finally { clearInterval(timer); }
  }
}

// ================= Шаг 2: содержание =================
async function stepOutline(wrap, bookId) {
  let book = await window.api.books.get(bookId);
  let outline = await window.api.outline.get(bookId);
  const target = book.target_pages || 0;
  let busy = false;

  const saveNow = async () => { await window.api.outline.save(bookId, outline); };
  const save = debounce(() => saveNow().catch(toastErr), 500);

  const total = () => Math.round(outline.chapters.reduce((a, c) => a + c.sections.reduce((b, s) => b + (Number(s.pages) || 0), 0), 0) * 10) / 10;
  const totalEl = h('span');
  const updTotal = () => { totalEl.textContent = `≈ ${total()} стр.${target ? ` из ${target}` : ''}`; };

  const metaBox = h('div.card.outline-meta');
  const chaptersBox = h('div');
  const drawMeta = () => {
    const title = h('input.input.bare.title-in', { value: outline.title, placeholder: 'Название книги' });
    title.addEventListener('input', () => { outline.title = title.value; save(); });
    const sub = h('input.input.bare', { value: outline.subtitle || '', placeholder: 'Подзаголовок', style: { color: 'var(--text-2)' } });
    sub.addEventListener('input', () => { outline.subtitle = sub.value; save(); });
    const ann = autosize(h('textarea.textarea.bare', { rows: 2, value: outline.annotation || '', placeholder: 'Мини-аннотация', style: { fontSize: '15px', color: 'var(--text-2)' } }));
    ann.addEventListener('input', () => { outline.annotation = ann.value; save(); });
    const tags = h('div.row.wrap', { style: { gap: '6px', padding: '0 6px' } },
      (outline.tags || []).map((t, i) => h('span.tag', `#${t}`, h('span.x', { onclick: () => { outline.tags.splice(i, 1); save(); drawMeta(); } }, '×'))),
      h('button.btn.btn-ghost.btn-sm', { onclick: async () => { const t = await promptDialog('Новый тег', { placeholder: 'например: python' }); if (t) { outline.tags = [...(outline.tags || []), t.replace(/^#/, '')]; save(); drawMeta(); } } }, ic('plus', 14), 'тег'),
      h('div.spacer'),
      h('button.btn.btn-ghost.btn-sm', { onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true; b.querySelector('span').textContent = 'Пишу…';
        try { await save.flush(); const r = await window.api.ai.regenMeta(bookId); outline.annotation = r.annotation; outline.tags = r.tags; drawMeta(); toast('Аннотация обновлена'); } catch (err) { toastErr(err); b.disabled = false; }
      } }, ic('sparkles', 14), h('span', 'Новая аннотация и теги')));
    metaBox.replaceChildren(h('div.eyebrow', { style: { padding: '0 6px' } }, 'Мини-аннотация и теги'), title, sub, ann, tags);
  };

  const drawChapters = () => {
    chaptersBox.replaceChildren(...outline.chapters.map((c, ci) => chapterCard(c, ci)),
      h('button.btn.btn-ghost', { style: { marginTop: '4px' }, onclick: () => {
        outline.chapters.push({ id: uid(), title: 'Новая глава', summary: '', tags: [], sections: [{ id: uid(), title: 'Новый раздел', brief: '', pages: 2 }] });
        save(); drawChapters(); updTotal();
      } }, ic('plus', 16), 'Добавить главу'));
    updTotal();
  };

  const chapterCard = (c, ci) => {
    const locked = c.sections.some((s) => s.status === 'done');
    const card = h('div.card.ch-card', { style: { animationDelay: `${Math.min(ci, 12) * 15}ms` } });
    const title = h('input.input.bare', { value: c.title });
    title.addEventListener('input', () => { c.title = title.value; save(); });
    const summary = autosize(h('textarea.textarea.bare.small', { rows: 1, value: c.summary || '', placeholder: 'Краткое описание главы', style: { color: 'var(--muted)', fontSize: '13px', padding: '4px 6px' } }));
    summary.addEventListener('input', () => { c.summary = summary.value; save(); });
    const tags = h('div.ch-tags', Object.keys(CH_TAGS).map((t) => h(`span.tag.toggle.t-${t}${(c.tags || []).includes(t) ? '.on' : ''}`, {
      title: 'Нажмите, чтобы включить/выключить метку',
      onclick: (e) => {
        c.tags = (c.tags || []).includes(t) ? c.tags.filter((x) => x !== t) : [...(c.tags || []), t];
        e.currentTarget.classList.toggle('on'); save();
      },
    }, CH_TAGS[t])));
    const move = (d) => { const j = ci + d; if (j < 0 || j >= outline.chapters.length) return; [outline.chapters[ci], outline.chapters[j]] = [outline.chapters[j], outline.chapters[ci]]; save(); drawChapters(); };
    const refineBox = h('div.hidden');
    const openRefine = () => {
      const inp = h('input.input', { placeholder: 'Что изменить? Например: «добавь раздел про ошибки», «сделай проще», «больше практики»' });
      const go2 = async () => {
        const instr = inp.value.trim();
        if (!instr) return;
        card.classList.add('busy');
        try {
          await save.flush();
          const nc = await window.api.ai.refineChapter(bookId, outline, ci, instr);
          outline.chapters[ci] = { ...nc, id: c.id, sections: nc.sections.map((s) => ({ ...s, id: uid() })) };
          await saveNow();
          toast('Глава обновлена');
          drawChapters();
        } catch (e) { toastErr(e); card.classList.remove('busy'); }
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go2(); if (e.key === 'Escape') refineBox.classList.add('hidden'); });
      refineBox.className = 'refine-box';
      refineBox.replaceChildren(inp, h('button.btn.btn-primary', { onclick: go2 }, ic('sparkles', 15), 'Править'), h('button.icon-btn', { onclick: () => refineBox.classList.add('hidden') }, ic('x', 16)));
      setTimeout(() => inp.focus(), 20);
    };
    const secs = h('div', { style: { marginTop: '6px' } }, c.sections.map((s, si) => {
      const st = h('input.input.bare', { value: s.title });
      st.addEventListener('input', () => { s.title = st.value; save(); });
      const br = h('input.input.bare.brief', { value: s.brief || '', placeholder: 'что раскрыть' });
      br.addEventListener('input', () => { s.brief = br.value; save(); });
      const pg = h('input.input.bare.pages-in', { type: 'number', min: 0.5, max: 40, step: 0.5, value: s.pages, title: 'Страниц' });
      pg.addEventListener('input', () => { s.pages = Math.max(0.5, Number(pg.value) || 1); save(); updTotal(); });
      return h('div.sec-row', h('span.num', `${ci + 1}.${si + 1}`), st, br, h('div.row', { style: { gap: '2px' } }, pg, h('span.small.muted', 'стр')),
        s.status === 'done' ? h('span.done-mark', { title: 'Уже сгенерирован' }, '✓') : h('button.icon-btn.sm', { title: 'Удалить раздел', onclick: () => { c.sections.splice(si, 1); save(); drawChapters(); } }, ic('x', 14)));
    }), h('button.btn.btn-ghost.btn-sm', { style: { marginLeft: '22px' }, onclick: () => { c.sections.push({ id: uid(), title: 'Новый раздел', brief: '', pages: 2 }); save(); drawChapters(); } }, ic('plus', 14), 'раздел'));

    card.append(
      h('div.ch-head', h('div.toc-num', ci + 1), h('div.grow', title),
        h('div.ch-tools',
          h('button.btn.btn-soft.btn-sm', { title: 'Точечная правка главы с ИИ', onclick: openRefine }, ic('sparkles', 14), 'ИИ-правка'),
          h('button.icon-btn.sm', { title: 'Выше', onclick: () => move(-1) }, ic('up', 16)),
          h('button.icon-btn.sm', { title: 'Ниже', onclick: () => move(1) }, ic('down', 16)),
          h('button.icon-btn.sm', { title: locked ? 'Глава уже частично сгенерирована' : 'Удалить главу', disabled: locked, onclick: () => { outline.chapters.splice(ci, 1); save(); drawChapters(); } }, ic('trash', 15)))),
      refineBox,
      h('div.ch-body', summary, tags, secs));
    return card;
  };

  const fitPages = () => {
    const sum = total();
    if (!target || !sum) return;
    const k = target / sum;
    outline.chapters.forEach((c) => c.sections.forEach((s) => { s.pages = Math.max(0.5, Math.round(s.pages * k * 2) / 2); }));
    save(); drawChapters();
  };

  const regen = async () => {
    const fb = await promptDialog('Перегенерировать содержание', { label: 'Что не понравилось? (необязательно)', placeholder: 'Например: меньше теории, больше практики; добавь главу про…', multiline: true, okLabel: 'Перегенерировать', hint: 'Текущий вариант сохранится в истории.' });
    if (fb === null) return;
    if (busy) return;
    busy = true;
    chaptersBox.style.opacity = '.45';
    chaptersBox.style.pointerEvents = 'none';
    regenBtn.disabled = true;
    regenBtn.replaceChildren(h('div.spinner'), 'Генерирую…');
    try {
      await save.flush();
      book = await window.api.ai.regenOutline(bookId, fb);
      outline = await window.api.outline.get(bookId);
      drawMeta(); drawChapters();
      toast('Новое содержание готово');
    } catch (e) { toastErr(e); } finally {
      busy = false; chaptersBox.style.opacity = ''; chaptersBox.style.pointerEvents = '';
      regenBtn.disabled = false; regenBtn.replaceChildren(ic('refresh', 16), 'Перегенерировать');
    }
  };

  const regenBtn = h('button.btn', { onclick: regen }, ic('refresh', 16), 'Перегенерировать');
  const histBtn = h('button.icon-btn', { title: 'История вариантов', onclick: async (e) => {
    const list = await window.api.outline.history(bookId);
    if (!list.length) { toast('Предыдущих вариантов пока нет'); return; }
    menu(e.currentTarget, list.map((r, i) => ({ icon: 'history', label: `Вариант от ${new Date(r.created_at).toLocaleTimeString('ru-RU')}${i === 0 ? ' (предыдущий)' : ''}`,
      onClick: async () => { await save.flush(); await window.api.outline.restore(bookId, r.id); outline = await window.api.outline.get(bookId); drawMeta(); drawChapters(); toast('Вариант восстановлен'); } })));
  } }, ic('history', 18));

  drawMeta();
  drawChapters();
  wrap.append(stepsBar(2, bookId),
    metaBox,
    h('div.outline-bar', h('div.h2.grow', 'Содержание'), h('span.muted', totalEl),
      target ? h('button.btn.btn-ghost.btn-sm', { title: `Подогнать объём под ${target} стр.`, onclick: fitPages }, 'Подогнать') : null,
      histBtn, regenBtn),
    chaptersBox,
    h('div.sticky-foot',
      h('button.btn', { onclick: async () => { await save.flush(); go('book', { id: bookId }); } }, 'Сохранить и выйти'),
      h('div.spacer'),
      h('span.small.muted', 'Изменения сохраняются автоматически'),
      h('button.btn.btn-primary.btn-lg', { onclick: async () => { await save.flush(); go('wizard', { bookId, step: 3 }); } }, 'Далее: обложка и генерация', ic('arrowRight', 16))));
  return () => save.flush();
}

// ================= Шаг 3: обложка и запуск =================
async function stepLaunch(wrap, bookId) {
  let book = await window.api.books.get(bookId);
  let loading = false;
  const coverBox = h('div');
  const drawCover = () => coverBox.replaceChildren(coverEl(book, state.info.mediaUrl, { loading }),
    h('div.cover-actions',
      h('button.btn.btn-soft', { disabled: loading, onclick: () => coverDialog(book, (o) => gen(o)) }, ic('sparkles', 16), book.cover?.file ? 'Другая обложка' : 'Сгенерировать обложку'),
      h('button.icon-btn', { title: 'Загрузить своё изображение', onclick: async () => {
        const f = await window.api.media.import();
        if (f) { book = await window.api.books.update(bookId, { cover: { type: 'image', file: f } }); drawCover(); }
      } }, ic('upload', 18))),
    h('div.hint', { style: { marginTop: '8px' } }, loading ? 'ИИ рисует обложку…' : 'Название и автор накладываются автоматически.'));
  const gen = async (o) => {
    loading = true; drawCover();
    await runCover(bookId, o);
    book = await window.api.books.get(bookId);
    loading = false; drawCover();
  };
  drawCover();

  // Автоматическая обложка при первом входе
  if (!book.cover?.file && !book.options?.coverTried) {
    window.api.books.update(bookId, { options: { ...book.options, coverTried: true } });
    gen({ style: book.options?.coverStyle || COVER_STYLES[0] });
  }

  wrap.append(stepsBar(3, bookId),
    h('div.cover-step',
      coverBox,
      h('div.col', { style: { gap: '14px' } },
        h('div', h('div.h1', book.title), h('div.muted', { style: { marginTop: '6px' } }, book.annotation)),
        h('div.card.card-pad',
          h('div.h3', { style: { marginBottom: '4px' } }, 'План генерации'),
          h('div.small.muted', { style: { marginBottom: '14px' } }, 'Книга пишется небольшими кусками по разделам, прогресс сохраняется — можно остановить и продолжить в любой момент.'),
          planPanel(book, { onStarted: () => { toast('Генерация запущена'); go('book', { id: bookId }); } })))));
}
