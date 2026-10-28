// ИИ-движок Bookich: содержание, генерация книги по кускам, обложки.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const P = require('./prompts');
const { complete, openaiImage, withRetry, extractJson, AIError } = require('./providers');

const MAX_PAGES = 200;
const CHUNK_WORDS = 1000; // слов за один запрос к модели

const wordsPerPage = (o) => (o?.visual ? 230 : 280);
const round05 = (n) => Math.max(0.5, Math.round(n * 2) / 2);

function normalizeOutline(raw, targetPages) {
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : []).filter(Boolean).map((c, i) => ({
    title: String(c.title || `Глава ${i + 1}`).trim(),
    summary: String(c.summary || '').trim(),
    tags: (Array.isArray(c.tags) ? c.tags : []).map((t) => String(t).toLowerCase().trim()).filter((t) => P.CHAPTER_TAGS.includes(t)).slice(0, 2),
    sections: (Array.isArray(c.sections) && c.sections.length ? c.sections : [{ title: c.title, brief: c.summary, pages: 2 }])
      .map((s) => ({ title: String(s.title || '').trim() || 'Раздел', brief: String(s.brief || '').trim(), pages: Math.max(0.5, Number(s.pages) || 1) })),
  }));
  if (!chapters.length) throw new AIError('Модель вернула пустое содержание');
  const target = Math.min(MAX_PAGES, Math.max(3, Number(targetPages) || 0));
  if (target) {
    const sum = chapters.reduce((a, c) => a + c.sections.reduce((b, s) => b + s.pages, 0), 0) || 1;
    const k = target / sum;
    chapters.forEach((c) => c.sections.forEach((s) => (s.pages = round05(s.pages * k))));
  }
  return {
    title: String(raw.title || 'Новая книга').trim(),
    subtitle: String(raw.subtitle || '').trim(),
    annotation: String(raw.annotation || '').trim(),
    tags: (Array.isArray(raw.tags) ? raw.tags : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 10),
    chapters,
  };
}

/** Чистит фрагмент: убирает обёртку ```markdown и повтор заголовка раздела. */
function cleanChunk(text, sectionTitle) {
  let t = String(text || '').trim();
  const wrap = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (wrap) t = wrap[1].trim();
  const lines = t.split('\n');
  const norm = (s) => s.replace(/^#+\s*/, '').replace(/[*_«»"]/g, '').replace(/^[\d.]+\s*/, '').trim().toLowerCase();
  if (lines.length && /^#{1,3}\s/.test(lines[0]) && norm(lines[0]) === norm(sectionTitle || '')) lines.shift();
  // заголовки уровня 1–2 внутри раздела понижаем до ###
  return lines.map((l) => l.replace(/^#{1,2}(\s)/, '###$1')).join('\n').trim();
}

function sanitizeSvg(svg) {
  const m = String(svg || '').match(/<svg[\s\S]*<\/svg>/i);
  if (!m) throw new AIError('Модель не вернула SVG');
  let s = m[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '');
  if (!/xmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}

class Generator extends EventEmitter {
  constructor(store, mediaDir, getConfig) {
    super();
    this.store = store;
    this.mediaDir = mediaDir;
    this.getConfig = getConfig;
    this.jobs = new Map();
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  saveMedia(buf, ext) {
    const name = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(this.mediaDir, name), buf);
    return name;
  }

  // ---------------- Содержание ----------------
  async createOutline(opts) {
    const o = { ...opts, pages: Math.min(MAX_PAGES, Math.max(5, Number(opts.pages) || 40)) };
    const cfg = this.getConfig();
    const raw = await withRetry(async () => extractJson(await complete(P.outlinePrompt(o), cfg)), { tries: 2 });
    const outline = normalizeOutline(raw, o.pages);
    const bookId = this.store.createBook({
      title: outline.title, subtitle: outline.subtitle, annotation: outline.annotation, tags: outline.tags,
      status: 'outline', source: 'ai', prompt: o.prompt, target_pages: o.pages,
      options: { kind: o.kind, level: o.level, language: o.language, visual: !!o.visual, chapterImages: !!o.chapterImages, extra: o.extra || '', coverStyle: o.coverStyle || '' },
      author: o.author || 'Bookich AI',
    });
    this.store.saveOutline(bookId, { ...outline, target_pages: o.pages });
    return this.store.getBook(bookId);
  }

  async regenerateOutline(bookId, feedback) {
    const book = this.store.getBook(bookId);
    const o = { ...book.options, prompt: book.prompt, pages: book.target_pages };
    const cfg = this.getConfig();
    const current = this.store.getOutline(bookId);
    const raw = await withRetry(async () => extractJson(await complete(P.regenOutlinePrompt(o, current, feedback), cfg)), { tries: 2 });
    const outline = normalizeOutline(raw, o.pages);
    this.store.saveOutline(bookId, outline, { keepHistory: true });
    return this.store.getBook(bookId);
  }

  async refineChapter(bookId, outline, chapterIndex, instruction) {
    const book = this.store.getBook(bookId);
    const o = { ...book.options, prompt: book.prompt, pages: book.target_pages };
    const raw = await withRetry(async () => extractJson(await complete(P.refineChapterPrompt(o, outline, chapterIndex, instruction), this.getConfig())), { tries: 2 });
    const ch = normalizeOutline({ chapters: [raw] }, 0).chapters[0];
    return ch;
  }

  async regenerateMeta(bookId) {
    const book = this.store.getBook(bookId);
    const raw = extractJson(await complete(P.metaPrompt(book.options, this.store.getOutline(bookId)), this.getConfig()));
    const patch = { annotation: String(raw.annotation || book.annotation), tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 10) : book.tags };
    this.store.updateBook(bookId, patch);
    return patch;
  }

  // ---------------- Обложка ----------------
  /** mode: 'image' (OpenAI Images) | 'art' (SVG-иллюстрация от текстовой модели) */
  async generateCover(bookId, { mode, style } = {}) {
    const book = this.store.getBook(bookId);
    const cfg = this.getConfig();
    const st = style || book.options?.coverStyle || '';
    const useImage = mode ? mode === 'image' : (cfg.provider === 'openai' && cfg.openaiKey && !process.env.BOOKICH_MOCK);
    let cover;
    if (useImage) {
      const buf = await openaiImage({ prompt: P.coverImagePrompt(book, st) }, cfg);
      cover = { type: 'image', file: this.saveMedia(buf, 'png'), style: st };
    } else {
      const svg = sanitizeSvg(await withRetry(() => complete(P.coverArtPrompt(book, st), cfg), { tries: 2 }));
      cover = { type: 'image', file: this.saveMedia(Buffer.from(svg, 'utf8'), 'svg'), style: st, art: true };
    }
    const old = book.cover;
    this.store.updateBook(bookId, { cover: { ...cover, palette: old?.palette } });
    return cover;
  }

  // ---------------- Переписать раздел ----------------
  async rewriteSection(sectionId, instruction) {
    const section = this.store.getSection(sectionId);
    const book = this.store.getBook(section.book_id);
    const chapter = book.chapters.find((c) => c.id === section.chapter_id);
    const text = await withRetry(() => complete(P.rewriteSectionPrompt({ book, chapter, section, instruction, options: book.options }), this.getConfig()), { tries: 2 });
    const content = cleanChunk(text, section.title);
    this.store.updateSection(sectionId, { content, status: 'done' });
    return content;
  }

  // ---------------- Генерация книги по кускам ----------------
  /**
   * plan.mode: 'all' — вся книга; 'pages' — только plan.pages страниц; 'chapters' — выбранные главы (plan.chapterIds)
   * plan.regenerate — перегенерировать уже готовые разделы выбранных глав
   */
  planQueue(bookId, plan = {}) {
    const book = this.store.getBook(bookId);
    let sections = book.chapters.flatMap((c) => c.sections.map((s) => ({ ...s, chapter: c })));
    if (plan.mode === 'chapters') {
      const ids = new Set(plan.chapterIds || []);
      sections = sections.filter((s) => ids.has(s.chapter_id));
      if (!plan.regenerate) sections = sections.filter((s) => s.status !== 'done');
    } else {
      sections = sections.filter((s) => s.status !== 'done');
    }
    if (plan.mode === 'pages') {
      const limit = Math.max(1, Number(plan.pages) || 10);
      const out = [];
      let acc = 0;
      for (const s of sections) {
        if (acc >= limit) break;
        out.push(s);
        acc += s.pages;
      }
      sections = out;
    }
    const pages = sections.reduce((a, s) => a + s.pages, 0);
    return { sections: sections.map((s) => s.id), pages: Math.round(pages * 10) / 10, count: sections.length };
  }

  status(bookId) {
    const j = this.jobs.get(bookId);
    return j ? j.snapshot() : null;
  }

  allStatus() { return [...this.jobs.values()].map((j) => j.snapshot()); }

  start(bookId, plan) {
    if (this.jobs.get(bookId)?.state === 'running') return this.status(bookId);
    const q = this.planQueue(bookId, plan);
    if (!q.count) throw new AIError('Нечего генерировать — все разделы уже готовы', { retry: false });
    const book = this.store.getBook(bookId);
    if (plan?.regenerate) for (const id of q.sections) this.store.updateSection(id, { status: 'pending', parts_done: 0, content: '' });
    const job = {
      bookId, title: book.title, state: 'running', queue: q.sections, index: 0, plannedPages: q.pages,
      current: null, error: null, log: [], startedAt: Date.now(), controller: new AbortController(), wordsDone: 0,
      snapshot() {
        return { bookId: this.bookId, title: this.title, state: this.state, index: this.index, total: this.queue.length,
          plannedPages: this.plannedPages, current: this.current, error: this.error, log: this.log.slice(-30), startedAt: this.startedAt };
      },
    };
    this.jobs.set(bookId, job);
    this.store.updateBook(bookId, { status: 'generating' });
    this._run(job).catch(() => {});
    this._emit(job);
    return job.snapshot();
  }

  pause(bookId) {
    const j = this.jobs.get(bookId);
    if (!j || j.state !== 'running') return;
    j.state = 'stopping';
    j.controller.abort();
    this._emit(j);
  }

  dismiss(bookId) {
    const j = this.jobs.get(bookId);
    if (j && j.state !== 'running' && j.state !== 'stopping') this.jobs.delete(bookId);
  }

  _emit(job, extra = {}) { this.emit('progress', { ...job.snapshot(), ...extra }); }
  _log(job, msg) { job.log.push({ t: Date.now(), msg }); this._emit(job); }

  async _run(job) {
    const cfg = this.getConfig();
    try {
      for (; job.index < job.queue.length; job.index++) {
        if (job.state !== 'running') break;
        const book = this.store.getBook(job.bookId);
        if (!book) break;
        const outline = this.store.getOutline(job.bookId);
        const flat = book.chapters.flatMap((c, ci) => c.sections.map((s, si) => ({ s, c, ci, si })));
        const pos = flat.findIndex((x) => x.s.id === job.queue[job.index]);
        if (pos === -1) continue;
        const { s: section, c: chapter, ci, si } = flat[pos];
        const opts = book.options || {};

        // Иллюстрация к главе (OpenAI Images) — один раз на главу
        if (si === 0 && opts.chapterImages && !chapter.image && cfg.openaiKey && !process.env.BOOKICH_MOCK) {
          try {
            this._log(job, `Иллюстрация к главе «${chapter.title}»…`);
            const buf = await openaiImage({ prompt: P.chapterImagePrompt(book, chapter, opts.coverStyle), size: 'landscape' }, cfg, job.controller.signal);
            this.store.updateChapter(chapter.id, { image: this.saveMedia(buf, 'png') });
          } catch (e) {
            if (job.state !== 'running') break;
            this._log(job, `Иллюстрация не создана: ${e.message}`);
          }
        }

        const totalWords = Math.max(150, Math.round(section.pages * wordsPerPage(opts)));
        const parts = Math.max(1, Math.ceil(totalWords / (cfg.chunkWords || CHUNK_WORDS)));
        let content = section.status === 'done' ? '' : section.content || '';
        let partsDone = section.parts_total === parts ? Math.min(section.parts_done, parts) : 0;
        if (partsDone === 0) content = '';
        this.store.updateSection(section.id, { status: 'generating', parts_total: parts, parts_done: partsDone, content, error: '' });

        for (let part = partsDone; part < parts; part++) {
          if (job.state !== 'running') break;
          job.current = { chapter: `${ci + 1}. ${chapter.title}`, section: `${ci + 1}.${si + 1} ${section.title}`, part: part + 1, parts, sectionId: section.id, chapterId: chapter.id };
          this._emit(job);
          const prev = content || (pos > 0 ? flat[pos - 1].s.content : '') || '';
          const prevTail = prev ? prev.slice(-1400) : '';
          const req = P.sectionPrompt({
            book, outline, chapter, chapterIndex: ci, section, sectionIndex: si, part, parts,
            words: Math.round(totalWords / parts), prevTail, options: opts,
          });
          const text = await withRetry(() => complete(req, cfg, job.controller.signal), {
            tries: 3, onRetry: (e, n) => this._log(job, `Повтор ${n}: ${e.message}`),
          });
          const chunk = cleanChunk(text, section.title);
          content = content ? `${content}\n\n${chunk}` : chunk;
          this.store.updateSection(section.id, { content, parts_done: part + 1 });
          this._emit(job, { tick: true });
        }
        if (job.state !== 'running') {
          this.store.updateSection(section.id, { status: 'pending' });
          break;
        }
        this.store.updateSection(section.id, { status: 'done' });
        this._log(job, `Готово: ${ci + 1}.${si + 1} ${section.title}`);
      }
      job.current = null;
      if (job.state === 'running') {
        job.state = 'done';
        this._log(job, 'Генерация завершена');
      } else {
        job.state = 'paused';
        this._log(job, 'Пауза');
      }
    } catch (e) {
      const cancelled = job.state === 'stopping';
      job.state = cancelled ? 'paused' : 'error';
      job.error = cancelled ? null : e.message;
      const sid = job.current?.sectionId;
      if (sid) this.store.updateSection(sid, { status: cancelled ? 'pending' : 'error', error: cancelled ? '' : e.message });
      job.current = null;
      this._log(job, cancelled ? 'Пауза' : `Ошибка: ${e.message}`);
    } finally {
      const b = this.store.getBook(job.bookId);
      if (b) {
        const all = b.chapters.flatMap((c) => c.sections);
        const done = all.length && all.every((s) => s.status === 'done');
        this.store.updateBook(job.bookId, { status: done ? 'done' : 'partial' });
      }
      this.store.flush();
      this._emit(job, { finished: true });
    }
  }
}

module.exports = { Generator, normalizeOutline, cleanChunk, sanitizeSvg, MAX_PAGES };
