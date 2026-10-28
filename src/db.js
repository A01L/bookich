// Хранилище Bookich: SQLite (sql.js / WebAssembly) с сохранением в файл.
// Не требует нативной сборки — работает на любой Windows-машине.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('./vendor/sql-wasm.js');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Без названия',
  subtitle TEXT DEFAULT '',
  author TEXT DEFAULT '',
  annotation TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  cover TEXT DEFAULT '{}',
  status TEXT DEFAULT 'manual',
  source TEXT DEFAULT 'manual',
  prompt TEXT DEFAULT '',
  options TEXT DEFAULT '{}',
  target_pages INTEGER DEFAULT 0,
  progress TEXT DEFAULT '{}',
  favorite INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER,
  opened_at INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  idx INTEGER NOT NULL DEFAULT 0,
  title TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  image TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  idx INTEGER NOT NULL DEFAULT 0,
  title TEXT DEFAULT '',
  brief TEXT DEFAULT '',
  pages REAL DEFAULT 1,
  content TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  parts_total INTEGER DEFAULT 0,
  parts_done INTEGER DEFAULT 0,
  words INTEGER DEFAULT 0,
  error TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS outline_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT NOT NULL,
  created_at INTEGER,
  data TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE INDEX IF NOT EXISTS idx_ch_book ON chapters(book_id, idx);
CREATE INDEX IF NOT EXISTS idx_sec_ch ON sections(chapter_id, idx);
CREATE INDEX IF NOT EXISTS idx_sec_book ON sections(book_id);
`;

const JSON_FIELDS = { books: ['tags', 'cover', 'options', 'progress'], chapters: ['tags'] };

const uid = () => crypto.randomUUID();
const now = () => Date.now();
const words = (s) => (String(s || '').replace(/```[\s\S]*?```/g, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;

class Store {
  constructor(file) {
    this.file = file;
    this.db = null;
    this._saveTimer = null;
  }

  async init() {
    const SQL = await initSqlJs({ locateFile: (f) => path.join(__dirname, 'vendor', f) });
    if (fs.existsSync(this.file)) {
      this.db = new SQL.Database(fs.readFileSync(this.file));
    } else {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      this.db = new SQL.Database();
    }
    this.db.run('PRAGMA foreign_keys = OFF;');
    this.db.exec(SCHEMA);
    // Незавершённые генерации после перезапуска → «частично»
    this.db.run(`UPDATE sections SET status='pending' WHERE status='generating'`);
    this.db.run(`UPDATE books SET status='partial' WHERE status='generating'`);
    this.flush();
  }

  // ---------- низкоуровневые помощники ----------
  all(sql, params = []) {
    const st = this.db.prepare(sql);
    st.bind(params);
    const rows = [];
    while (st.step()) rows.push(st.getAsObject());
    st.free();
    return rows;
  }
  get(sql, params = []) { return this.all(sql, params)[0] || null; }
  run(sql, params = []) { this.db.run(sql, params); this.save(); }

  save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.flush(), 400);
  }
  flush() {
    clearTimeout(this._saveTimer);
    if (!this.db) return;
    const data = Buffer.from(this.db.export());
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, this.file);
  }

  _parse(table, row) {
    if (!row) return row;
    for (const f of JSON_FIELDS[table] || []) {
      try { row[f] = JSON.parse(row[f] || (f === 'tags' ? '[]' : '{}')); } catch { row[f] = f === 'tags' ? [] : {}; }
    }
    return row;
  }
  _patch(table, id, patch, allowed) {
    const keys = Object.keys(patch).filter((k) => allowed.includes(k));
    if (!keys.length) return;
    const vals = keys.map((k) => {
      const v = patch[k];
      return (JSON_FIELDS[table] || []).includes(k) ? JSON.stringify(v ?? null) : v;
    });
    this.run(`UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(', ')} WHERE id=?`, [...vals, id]);
  }

  // ---------- settings ----------
  getSetting(key, def = null) {
    const r = this.get('SELECT value FROM settings WHERE key=?', [key]);
    if (!r) return def;
    try { return JSON.parse(r.value); } catch { return def; }
  }
  setSetting(key, value) {
    this.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, JSON.stringify(value)]);
  }

  // ---------- books ----------
  listBooks() {
    const books = this.all('SELECT * FROM books ORDER BY MAX(updated_at, opened_at) DESC').map((b) => this._parse('books', b));
    const stats = this.all(`SELECT book_id, COUNT(*) total, SUM(status='done') done, SUM(pages) pages, SUM(words) words,
      SUM(CASE WHEN status='done' THEN pages ELSE 0 END) pages_done FROM sections GROUP BY book_id`);
    const chs = this.all('SELECT book_id, COUNT(*) n FROM chapters GROUP BY book_id');
    const sm = Object.fromEntries(stats.map((s) => [s.book_id, s]));
    const cm = Object.fromEntries(chs.map((c) => [c.book_id, c.n]));
    return books.map((b) => ({ ...b, stats: this._stats(b, sm[b.id], cm[b.id]) }));
  }

  _stats(b, s, chapters) {
    s = s || { total: 0, done: 0, pages: 0, words: 0, pages_done: 0 };
    const wpp = b.options?.visual ? 230 : 280;
    return {
      chapters: chapters || 0,
      sections: s.total || 0,
      sectionsDone: s.done || 0,
      plannedPages: Math.round(s.pages || 0),
      pagesDone: Math.round(s.pages_done || 0),
      words: s.words || 0,
      estPages: Math.max(0, Math.round((s.words || 0) / wpp)),
    };
  }

  getBook(id) {
    const book = this._parse('books', this.get('SELECT * FROM books WHERE id=?', [id]));
    if (!book) return null;
    const chapters = this.all('SELECT * FROM chapters WHERE book_id=? ORDER BY idx', [id]).map((c) => this._parse('chapters', c));
    const sections = this.all('SELECT * FROM sections WHERE book_id=? ORDER BY idx', [id]);
    for (const c of chapters) c.sections = sections.filter((s) => s.chapter_id === c.id);
    book.chapters = chapters;
    const s = this.get(`SELECT COUNT(*) total, SUM(status='done') done, SUM(pages) pages, SUM(words) words,
      SUM(CASE WHEN status='done' THEN pages ELSE 0 END) pages_done FROM sections WHERE book_id=?`, [id]);
    book.stats = this._stats(book, s, chapters.length);
    return book;
  }

  createBook(data = {}) {
    const id = uid();
    const t = now();
    this.run(`INSERT INTO books(id,title,subtitle,author,annotation,tags,cover,status,source,prompt,options,target_pages,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      id, data.title || 'Без названия', data.subtitle || '', data.author || '', data.annotation || '',
      JSON.stringify(data.tags || []), JSON.stringify(data.cover || {}), data.status || 'manual', data.source || 'manual',
      data.prompt || '', JSON.stringify(data.options || {}), data.target_pages || 0, t, t,
    ]);
    return id;
  }

  updateBook(id, patch) {
    this._patch('books', id, { ...patch, updated_at: patch.updated_at ?? now() },
      ['title', 'subtitle', 'author', 'annotation', 'tags', 'cover', 'status', 'source', 'prompt', 'options', 'target_pages', 'progress', 'favorite', 'updated_at', 'opened_at']);
  }

  touchOpened(id) { this._patch('books', id, { opened_at: now() }, ['opened_at']); }

  deleteBook(id) {
    this.db.run('DELETE FROM sections WHERE book_id=?', [id]);
    this.db.run('DELETE FROM chapters WHERE book_id=?', [id]);
    this.db.run('DELETE FROM outline_history WHERE book_id=?', [id]);
    this.run('DELETE FROM books WHERE id=?', [id]);
  }

  // ---------- chapters / sections ----------
  addChapter(bookId, data = {}) {
    const id = uid();
    const max = this.get('SELECT COALESCE(MAX(idx),-1) m FROM chapters WHERE book_id=?', [bookId]).m;
    const idx = data.idx ?? max + 1;
    this.db.run('INSERT INTO chapters(id,book_id,idx,title,summary,tags) VALUES(?,?,?,?,?,?)',
      [id, bookId, idx, data.title || `Глава ${idx + 1}`, data.summary || '', JSON.stringify(data.tags || [])]);
    if (data.withSection !== false) this.addSection(id, bookId, { title: '', status: 'done' });
    this.updateBook(bookId, {});
    return id;
  }
  updateChapter(id, patch) {
    this._patch('chapters', id, patch, ['title', 'summary', 'tags', 'image', 'idx']);
    const c = this.get('SELECT book_id FROM chapters WHERE id=?', [id]);
    if (c) this.updateBook(c.book_id, {});
  }
  deleteChapter(id) {
    const c = this.get('SELECT book_id FROM chapters WHERE id=?', [id]);
    this.db.run('DELETE FROM sections WHERE chapter_id=?', [id]);
    this.run('DELETE FROM chapters WHERE id=?', [id]);
    if (c) this._reindex('chapters', 'book_id', c.book_id);
  }
  reorderChapters(bookId, ids) {
    ids.forEach((id, i) => this.db.run('UPDATE chapters SET idx=? WHERE id=? AND book_id=?', [i, id, bookId]));
    this.updateBook(bookId, {});
  }
  addSection(chapterId, bookId, data = {}) {
    const id = uid();
    const max = this.get('SELECT COALESCE(MAX(idx),-1) m FROM sections WHERE chapter_id=?', [chapterId]).m;
    const content = data.content || '';
    this.run(`INSERT INTO sections(id,chapter_id,book_id,idx,title,brief,pages,content,status,words)
      VALUES(?,?,?,?,?,?,?,?,?,?)`, [id, chapterId, bookId, data.idx ?? max + 1, data.title ?? 'Новый раздел', data.brief || '',
      data.pages ?? 1, content, data.status || 'done', words(content)]);
    return id;
  }
  getSection(id) { return this.get('SELECT * FROM sections WHERE id=?', [id]); }
  updateSection(id, patch) {
    if ('content' in patch) patch.words = words(patch.content);
    this._patch('sections', id, patch, ['title', 'brief', 'pages', 'content', 'status', 'parts_total', 'parts_done', 'words', 'error', 'idx']);
    const s = this.get('SELECT book_id FROM sections WHERE id=?', [id]);
    if (s) this.updateBook(s.book_id, {});
  }
  deleteSection(id) {
    const s = this.get('SELECT chapter_id FROM sections WHERE id=?', [id]);
    this.run('DELETE FROM sections WHERE id=?', [id]);
    if (s) this._reindex('sections', 'chapter_id', s.chapter_id);
  }
  _reindex(table, col, val) {
    const rows = this.all(`SELECT id FROM ${table} WHERE ${col}=? ORDER BY idx`, [val]);
    rows.forEach((r, i) => this.db.run(`UPDATE ${table} SET idx=? WHERE id=?`, [i, r.id]));
    this.save();
  }

  // ---------- outline (план книги) ----------
  /** Полностью заменяет структуру книги планом (используется до начала генерации). */
  saveOutline(bookId, outline, { keepHistory = false } = {}) {
    if (keepHistory) {
      const prev = this.getOutline(bookId);
      if (prev.chapters.length) {
        this.db.run('INSERT INTO outline_history(book_id,created_at,data) VALUES(?,?,?)', [bookId, now(), JSON.stringify(prev)]);
      }
    }
    // Сохраняем уже сгенерированный текст разделов, если id совпадают
    const existing = Object.fromEntries(this.all('SELECT * FROM sections WHERE book_id=?', [bookId]).map((s) => [s.id, s]));
    this.db.run('DELETE FROM sections WHERE book_id=?', [bookId]);
    this.db.run('DELETE FROM chapters WHERE book_id=?', [bookId]);
    (outline.chapters || []).forEach((ch, ci) => {
      const cid = ch.id || uid();
      this.db.run('INSERT INTO chapters(id,book_id,idx,title,summary,tags,image) VALUES(?,?,?,?,?,?,?)',
        [cid, bookId, ci, ch.title || `Глава ${ci + 1}`, ch.summary || '', JSON.stringify(ch.tags || []), ch.image || '']);
      (ch.sections || []).forEach((s, si) => {
        const old = s.id && existing[s.id];
        this.db.run(`INSERT INTO sections(id,chapter_id,book_id,idx,title,brief,pages,content,status,parts_total,parts_done,words)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [s.id || uid(), cid, bookId, si, s.title || '', s.brief || '', Number(s.pages) || 1,
          old ? old.content : '', old ? old.status : 'pending', old ? old.parts_total : 0, old ? old.parts_done : 0, old ? old.words : 0]);
      });
    });
    const patch = {};
    for (const k of ['title', 'subtitle', 'annotation', 'tags', 'target_pages']) if (outline[k] !== undefined) patch[k] = outline[k];
    this.updateBook(bookId, patch);
  }

  getOutline(bookId) {
    const b = this.getBook(bookId);
    if (!b) return { chapters: [] };
    return {
      title: b.title, subtitle: b.subtitle, annotation: b.annotation, tags: b.tags, target_pages: b.target_pages,
      chapters: b.chapters.map((c) => ({
        id: c.id, title: c.title, summary: c.summary, tags: c.tags, image: c.image,
        sections: c.sections.map((s) => ({ id: s.id, title: s.title, brief: s.brief, pages: s.pages, status: s.status })),
      })),
    };
  }

  outlineHistory(bookId) {
    return this.all('SELECT id, created_at FROM outline_history WHERE book_id=? ORDER BY id DESC LIMIT 20', [bookId]);
  }
  restoreOutline(bookId, historyId) {
    const r = this.get('SELECT data FROM outline_history WHERE id=? AND book_id=?', [historyId, bookId]);
    if (!r) return;
    this.saveOutline(bookId, JSON.parse(r.data), { keepHistory: true });
  }
}

module.exports = { Store, uid, words };
