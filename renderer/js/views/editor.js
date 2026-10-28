// Редактор книги: структура слева, Markdown + предпросмотр справа
import { h, ic, debounce, toast, toastErr, confirmDialog, promptDialog, autosize, CH_TAGS } from '../ui.js';
import { state, go } from '../state.js';
import { renderMarkdown } from '../markdown.js';
import { coverEl } from '../cover.js';
import { exportPdfFlow } from './book.js';

const SVG_TEMPLATE = '\n```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 300">\n  <rect x="40" y="110" width="180" height="80" rx="14" fill="#2479f2"/>\n  <text x="130" y="156" fill="#fff" font-family="Segoe UI" font-size="18" text-anchor="middle">Шаг 1</text>\n  <path d="M220 150 H300" stroke="#2479f2" stroke-width="3"/>\n  <rect x="300" y="110" width="180" height="80" rx="14" fill="#5aa9ff"/>\n  <text x="390" y="156" fill="#fff" font-family="Segoe UI" font-size="18" text-anchor="middle">Шаг 2</text>\n</svg>\n```\n';
const TABLE_TEMPLATE = '\n| Колонка 1 | Колонка 2 |\n|---|---|\n| Значение | Значение |\n';

export async function render(root, params) {
  let book = await window.api.books.get(params.id);
  if (!book) { go('library'); return; }
  let sel = null;
  let mode = 'split';
  const initCh = book.chapters.find((c) => c.id === params.chapterId) || book.chapters[0];
  sel = initCh?.sections[0] ? { type: 'section', id: initCh.sections[0].id } : { type: 'book' };

  const tree = h('aside.ed-tree');
  const main = h('div.ed-main');
  const saveState = h('span.save-state', ic('check', 14), 'Сохранено');
  root.append(h('div.editor', tree, main));

  const setSaving = (v) => saveState.replaceChildren(v ? h('div.spinner', { style: { width: '12px', height: '12px' } }) : ic('check', 14), v ? 'Сохранение…' : 'Сохранено');
  const findSec = (id) => { for (const c of book.chapters) { const s = c.sections.find((x) => x.id === id); if (s) return { c, s }; } return {}; };
  const reload = async () => { book = await window.api.books.get(book.id); };

  // ---------------- Дерево ----------------
  const drawTree = () => {
    const node = (cls, active, label, onclick, tools = []) => h(`div.ed-node.${cls}${active ? '.active' : ''}`, { onclick }, h('span.label-t', label), h('div.tools', { onclick: (e) => e.stopPropagation() }, tools));
    const tb = (iconName, title, fn) => h('button.icon-btn.sm', { title, onclick: fn }, ic(iconName, 14));
    tree.replaceChildren(
      h('div.row', { style: { padding: '2px 4px 10px', gap: '6px' } },
        h('button.icon-btn', { title: 'К книге', onclick: () => go('book', { id: book.id }) }, ic('back', 18)),
        h('div.grow', { style: { fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, book.title)),
      node('book', sel.type === 'book', h('span.row', { style: { gap: '8px' } }, ic('book', 15), 'Книга: обложка и описание'), () => select({ type: 'book' })),
      h('div.eyebrow', { style: { padding: '14px 10px 4px' } }, 'Главы'),
      ...book.chapters.flatMap((c, ci) => [
        node('ch', false, `${ci + 1}. ${c.title}`, () => c.sections[0] && select({ type: 'section', id: c.sections[0].id }), [
          tb('up', 'Выше', () => moveCh(ci, -1)), tb('down', 'Ниже', () => moveCh(ci, 1)),
          tb('plus', 'Добавить раздел', () => addSection(c)), tb('trash', 'Удалить главу', () => delChapter(c)),
        ]),
        ...c.sections.map((s, si) => node('sec', sel.id === s.id, h('span.row', { style: { gap: '6px' } },
          s.status !== 'done' && book.source === 'ai' ? h('span', { style: { color: '#b7c5d8' } }, '○') : null, s.title || (c.sections.length === 1 ? 'Текст главы' : `Раздел ${si + 1}`)),
        () => select({ type: 'section', id: s.id }), [
          tb('up', 'Выше', () => moveSec(c, si, -1)), tb('down', 'Ниже', () => moveSec(c, si, 1)),
          c.sections.length > 1 ? tb('trash', 'Удалить раздел', () => delSection(s)) : null,
        ])),
      ]),
      h('button.btn.btn-ghost.btn-sm', { style: { marginTop: '10px' }, onclick: addChapter }, ic('plus', 15), 'Новая глава'));
  };

  const select = async (s) => {
    await flushAll();
    sel = s;
    drawTree();
    drawMain();
  };

  const addChapter = async () => {
    await flushAll();
    const title = await promptDialog('Новая глава', { value: `Глава ${book.chapters.length + 1}` });
    if (!title) return;
    await window.api.chapters.add(book.id, { title });
    await reload();
    const c = book.chapters[book.chapters.length - 1];
    select({ type: 'section', id: c.sections[0].id });
  };
  const addSection = async (c) => {
    await flushAll();
    const title = await promptDialog('Новый раздел', { placeholder: 'Заголовок раздела' });
    if (title === null) return;
    const id = await window.api.sections.add(c.id, book.id, { title: title || 'Новый раздел' });
    await reload();
    select({ type: 'section', id });
  };
  const delChapter = async (c) => {
    if (!(await confirmDialog('Удалить главу?', `Глава «${c.title}» и весь её текст будут удалены.`))) return;
    await window.api.chapters.delete(c.id);
    await reload();
    sel = book.chapters[0]?.sections[0] ? { type: 'section', id: book.chapters[0].sections[0].id } : { type: 'book' };
    drawTree(); drawMain();
  };
  const delSection = async (s) => {
    if (!(await confirmDialog('Удалить раздел?', `Раздел «${s.title || 'без названия'}» будет удалён.`))) return;
    await window.api.sections.delete(s.id);
    await reload();
    sel = { type: 'book' };
    drawTree(); drawMain();
  };
  const moveCh = async (i, d) => {
    const j = i + d;
    if (j < 0 || j >= book.chapters.length) return;
    const ids = book.chapters.map((c) => c.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await window.api.chapters.reorder(book.id, ids);
    await reload(); drawTree();
  };
  const moveSec = async (c, i, d) => {
    const j = i + d;
    if (j < 0 || j >= c.sections.length) return;
    const ids = c.sections.map((s) => s.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await window.api.sections.reorder(ids);
    await reload(); drawTree();
  };

  // ---------------- Правая часть ----------------
  let flushers = [];
  const flushAll = async () => { for (const f of flushers) await f(); };

  const drawMain = () => {
    flushers = [];
    if (sel.type === 'book') return drawBookMeta();
    const { c, s } = findSec(sel.id);
    if (!s) { sel = { type: 'book' }; return drawBookMeta(); }

    const ta = h('textarea.ed-text', { spellcheck: true, placeholder: 'Пишите в Markdown: ### подзаголовок, **жирный**, списки, таблицы, ```svg схемы…' });
    ta.value = s.content || '';
    const preview = h('div.md.selectable', { style: { '--fs': '16px' } });
    const words = h('span.small.muted');
    const updPreview = debounce(() => {
      preview.innerHTML = (s.title ? `<h2 class="sec-title">${s.title.replace(/</g, '&lt;')}</h2>` : '') + renderMarkdown(ta.value, state.info.mediaUrl);
      words.textContent = `${(ta.value.match(/[\p{L}\p{N}]+/gu) || []).length} слов`;
    }, 120);
    const saveContent = debounce(async () => {
      setSaving(true);
      try { await window.api.sections.update(s.id, { content: ta.value, status: 'done' }); s.content = ta.value; s.status = 'done'; } catch (e) { toastErr(e); }
      setSaving(false);
    }, 650);
    ta.addEventListener('input', () => { setSaving(true); saveContent(); updPreview(); });
    ta.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap('**', '**', 'жирный'); }
      if (e.ctrlKey && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap('*', '*', 'курсив'); }
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveContent.flush(); }
      if (e.key === 'Tab') { e.preventDefault(); insert('  '); }
    });
    flushers.push(async () => { saveContent.flush(); });

    const chTitle = h('input.input', { value: c.title, placeholder: 'Название главы' });
    const saveCh = debounce(async () => { await window.api.chapters.update(c.id, { title: chTitle.value }); c.title = chTitle.value; drawTree(); }, 500);
    chTitle.addEventListener('input', saveCh);
    const secTitle = h('input.input', { value: s.title, placeholder: 'Заголовок раздела (необязательно)' });
    const saveSec = debounce(async () => { await window.api.sections.update(s.id, { title: secTitle.value }); s.title = secTitle.value; drawTree(); updPreview(); }, 500);
    secTitle.addEventListener('input', saveSec);
    flushers.push(async () => { saveCh.flush(); saveSec.flush(); });

    const fire = () => ta.dispatchEvent(new Event('input'));
    const wrap = (a, b, ph) => {
      const { selectionStart: st, selectionEnd: en, value } = ta;
      const txt = value.slice(st, en) || ph;
      ta.setRangeText(a + txt + b, st, en, 'end');
      ta.setSelectionRange(st + a.length, st + a.length + txt.length);
      ta.focus(); fire();
    };
    const insert = (text) => { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.focus(); fire(); };
    const prefix = (p) => {
      const st = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
      ta.setRangeText(p, st, st, 'end'); ta.focus(); fire();
    };
    const t = (label, title, fn, isIcon = true) => h('button.icon-btn', { title, onclick: fn }, isIcon ? ic(label, 16) : label);
    const body = h(`div.ed-body.mode-${mode}`, h('div.ed-pane', ta), h('div.ed-pane.ed-preview', preview));
    const modeSeg = h('div.seg', [['edit', 'Текст'], ['split', 'Вместе'], ['preview', 'Просмотр']].map(([k, l]) =>
      h(`button${mode === k ? '.active' : ''}`, { onclick: (e) => { mode = k; body.className = `ed-body mode-${k}`; modeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.currentTarget)); } }, l)));

    const aiBtn = h('button.btn.btn-soft.btn-sm', { onclick: async () => {
      const instr = await promptDialog('ИИ-правка раздела', { label: 'Что сделать с текстом?', placeholder: 'Например: допиши примеры; упрости; добавь схему; исправь ошибки', multiline: true, okLabel: 'Применить', hint: 'Ctrl+Enter — отправить. Используется провайдер из настроек.' });
      if (!instr) return;
      saveContent.flush();
      aiBtn.disabled = true; aiBtn.replaceChildren(h('div.spinner'), 'ИИ работает…');
      try {
        const content = await window.api.ai.rewriteSection(s.id, instr);
        ta.value = content; s.content = content; updPreview(); toast('Готово');
      } catch (e) { toastErr(e); } finally { aiBtn.disabled = false; aiBtn.replaceChildren(ic('sparkles', 14), 'ИИ-правка'); }
    } }, ic('sparkles', 14), 'ИИ-правка');

    main.replaceChildren(
      h('div.ed-head', h('div.h3.grow', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, c.title), saveState,
        h('button.btn.btn-sm', { onclick: async () => { await flushAll(); go('reader', { id: book.id, chapterId: c.id, sectionId: s.id }); } }, ic('book', 15), 'Читать'),
        h('button.btn.btn-sm', { onclick: async () => { await flushAll(); exportPdfFlow(book.id); } }, ic('download', 15), 'PDF')),
      h('div.ed-fields', h('div.field.grow', h('label', 'Глава'), chTitle), h('div.field.grow', h('label', 'Раздел'), secTitle)),
      h('div.ed-toolbar',
        t(h('b', 'B'), 'Жирный (Ctrl+B)', () => wrap('**', '**', 'жирный'), false),
        t(h('i', { style: { fontFamily: 'Georgia' } }, 'I'), 'Курсив (Ctrl+I)', () => wrap('*', '*', 'курсив'), false),
        t('H3', 'Подзаголовок', () => prefix('### '), false),
        h('div.sep'),
        t('list', 'Список', () => prefix('- ')),
        t('listOl', 'Нумерованный список', () => prefix('1. ')),
        t('quote', 'Цитата', () => prefix('> ')),
        t('lightbulb', 'Выноска-совет', () => insert('\n> [!tip] Совет: \n')),
        h('div.sep'),
        t('table', 'Таблица', () => insert(TABLE_TEMPLATE)),
        t('code', 'Код', () => wrap('\n```\n', '\n```\n', 'код')),
        t('diagram', 'SVG-схема', () => insert(SVG_TEMPLATE)),
        t('image', 'Изображение', async () => { const f = await window.api.media.import(); if (f) insert(`\n![](media://${f})\n`); }),
        h('div.sep'), aiBtn, h('div.spacer'), words, modeSeg),
      body);
    updPreview.flush();
    setTimeout(() => { ta.setSelectionRange(0, 0); ta.focus({ preventScroll: true }); ta.scrollTop = 0; }, 30);
  };

  const drawBookMeta = () => {
    const f = (label, el) => h('div.field', h('label', label), el);
    const title = h('input.input', { value: book.title });
    const subtitle = h('input.input', { value: book.subtitle || '' });
    const author = h('input.input', { value: book.author || '' });
    const annotation = autosize(h('textarea.textarea', { rows: 3, value: book.annotation || '' }));
    const tags = h('input.input', { value: (book.tags || []).join(', '), placeholder: 'через запятую' });
    const coverBox = h('div', { style: { width: '170px' } }, coverEl(book, state.info.mediaUrl));
    const save = debounce(async () => {
      setSaving(true);
      book = await window.api.books.update(book.id, { title: title.value.trim() || 'Без названия', subtitle: subtitle.value, author: author.value, annotation: annotation.value, tags: tags.value.split(',').map((x) => x.trim()).filter(Boolean) });
      coverBox.replaceChildren(coverEl(book, state.info.mediaUrl));
      setSaving(false);
      drawTree();
    }, 600);
    [title, subtitle, author, annotation, tags].forEach((el) => el.addEventListener('input', save));
    flushers.push(async () => save.flush());
    main.replaceChildren(
      h('div.ed-head', h('div.h3.grow', 'Книга'), saveState),
      h('div.meta-form',
        h('div.row', { style: { alignItems: 'flex-start', gap: '24px' } }, coverBox,
          h('div.col.grow', f('Название', title), f('Подзаголовок', subtitle), f('Автор', author),
            h('div.row', h('button.btn.btn-sm', { onclick: async () => { const file = await window.api.media.import(); if (file) { book = await window.api.books.update(book.id, { cover: { type: 'image', file } }); coverBox.replaceChildren(coverEl(book, state.info.mediaUrl)); } } }, ic('upload', 15), 'Своя обложка'),
              h('button.btn.btn-sm.btn-soft', { onclick: () => go('book', { id: book.id }) }, ic('sparkles', 15), 'Обложка ИИ')))),
        f('Аннотация', annotation), f('Теги', tags),
        h('div.hint', 'Метки глав: ', Object.values(CH_TAGS).join(' · '), ' — задаются в «Содержании» ИИ-книг.')));
  };

  drawTree();
  drawMain();
  return () => { flushAll(); };
}
