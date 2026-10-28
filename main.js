// Bookich — главный процесс Electron
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Store } = require('./src/db');
const { Generator, MAX_PAGES } = require('./src/ai/generator');
const { complete, findClaude } = require('./src/ai/providers');
const { exportPdf, exportMarkdown } = require('./src/export');

if (process.env.BOOKICH_USERDATA) app.setPath('userData', process.env.BOOKICH_USERDATA);

// ---------------- Журнал запуска и ошибок ----------------
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.map((x) => (x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`;
  for (const dir of [path.dirname(process.execPath), (() => { try { return app.getPath('userData'); } catch { return null; } })()]) {
    if (!dir) continue;
    try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, 'bookich-log.txt'), line); break; } catch { /* следующая папка */ }
  }
}
function fatal(e) {
  log('FATAL', e);
  try { dialog.showErrorBox('Bookich — ошибка запуска', String(e?.stack || e)); } catch { /* */ }
}
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);
log('start', { version: app.getVersion(), electron: process.versions.electron, exe: process.execPath, platform: process.platform });

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

let win, store, gen;
const userData = () => app.getPath('userData');
const mediaDir = () => path.join(userData(), 'media');

// ---------------- Настройки ----------------
const DEFAULTS = {
  provider: 'claude', claudePath: 'claude', claudeModel: '', openaiBase: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4.1', openaiImageModel: 'gpt-image-1', imageQuality: 'medium', language: 'ru',
  chunkWords: 1000, timeoutSec: 600, author: '', readerFont: 18, readerWidth: 720, readerFamily: 'serif',
};

function getConfig() {
  const cfg = { ...DEFAULTS, ...(store.getSetting('config', {}) || {}) };
  const enc = store.getSetting('openaiKeyEnc', null);
  cfg.openaiKey = '';
  if (enc) {
    try {
      cfg.openaiKey = enc.plain ? Buffer.from(enc.data, 'base64').toString('utf8') : safeStorage.decryptString(Buffer.from(enc.data, 'base64'));
    } catch { cfg.openaiKey = ''; }
  }
  return cfg;
}
function publicConfig() {
  const c = getConfig();
  const k = c.openaiKey;
  return { ...c, openaiKey: '', hasOpenaiKey: !!k, openaiKeyHint: k ? `${k.slice(0, 3)}…${k.slice(-4)}` : '', mock: !!process.env.BOOKICH_MOCK && !process.env.BOOKICH_SCREENSHOTS };
}
function setConfig(patch) {
  const { openaiKey, ...rest } = patch || {};
  const cur = store.getSetting('config', {}) || {};
  store.setSetting('config', { ...cur, ...rest });
  if (openaiKey !== undefined) {
    if (!openaiKey) store.setSetting('openaiKeyEnc', null);
    else if (safeStorage.isEncryptionAvailable()) store.setSetting('openaiKeyEnc', { data: safeStorage.encryptString(openaiKey).toString('base64') });
    else store.setSetting('openaiKeyEnc', { plain: true, data: Buffer.from(openaiKey).toString('base64') });
  }
  return publicConfig();
}

// ---------------- Окно ----------------
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640,
    backgroundColor: '#f4f8fd', show: false, title: 'Bookich',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#f4f8fd', symbolColor: '#3a4b63', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // ready-to-show на некоторых Windows-машинах не приходит — показываем по первому из событий
  const showOnce = (why) => { if (win && !win.isDestroyed() && !win.isVisible()) { win.show(); log('shown via', why); } };
  win.once('ready-to-show', () => showOnce('ready-to-show'));
  win.webContents.once('did-finish-load', () => showOnce('did-finish-load'));
  setTimeout(() => showOnce('timeout'), 1500);
  win.webContents.on('render-process-gone', (_e, d) => log('renderer gone', d));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => log('did-fail-load', code, desc, url));
  win.webContents.on('console-message', (_e, level, msg, line, src) => { if (level >= 3) log('renderer error', msg, src, line); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
}

// ---------------- IPC ----------------
function handle(name, fn) {
  ipcMain.handle(name, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; } catch (e) {
      console.error(`[${name}]`, e);
      return { ok: false, error: e?.message || String(e) };
    }
  });
}

function registerIpc() {
  handle('app:info', () => ({ mediaUrl: pathToFileURL(mediaDir()).href, version: app.getVersion(), maxPages: MAX_PAGES, dataDir: userData() }));
  handle('settings:get', () => publicConfig());
  handle('settings:set', (patch) => setConfig(patch));
  handle('settings:test', async () => {
    const t0 = Date.now();
    const r = await complete({ prompt: 'Ответь одним словом: «Готово».' }, getConfig());
    return { reply: r.trim().slice(0, 200), ms: Date.now() - t0 };
  });
  handle('settings:openData', () => shell.openPath(userData()));
  handle('settings:findClaude', () => findClaude());

  handle('books:list', () => store.listBooks());
  handle('books:get', (id) => store.getBook(id));
  handle('books:create', (data) => {
    const id = store.createBook({ ...data, author: data.author || getConfig().author, status: 'manual', source: 'manual' });
    store.addChapter(id, { title: 'Глава 1' });
    return store.getBook(id);
  });
  handle('books:update', (id, patch) => { store.updateBook(id, patch); return store.getBook(id); });
  handle('books:opened', (id) => store.touchOpened(id));
  handle('books:progress', (id, progress) => store.updateBook(id, { progress, updated_at: undefined }));
  handle('books:delete', (id) => { gen.pause(id); gen.dismiss(id); store.deleteBook(id); });

  handle('chapters:add', (bookId, data) => { const id = store.addChapter(bookId, data); return id; });
  handle('chapters:update', (id, patch) => store.updateChapter(id, patch));
  handle('chapters:delete', (id) => store.deleteChapter(id));
  handle('chapters:reorder', (bookId, ids) => store.reorderChapters(bookId, ids));
  handle('sections:add', (chapterId, bookId, data) => store.addSection(chapterId, bookId, data));
  handle('sections:update', (id, patch) => store.updateSection(id, patch));
  handle('sections:delete', (id) => store.deleteSection(id));
  handle('sections:reorder', (ids) => { ids.forEach((id, i) => store.updateSection(id, { idx: i })); });

  handle('outline:get', (bookId) => store.getOutline(bookId));
  handle('outline:save', (bookId, outline) => { store.saveOutline(bookId, outline); return store.getBook(bookId); });
  handle('outline:history', (bookId) => store.outlineHistory(bookId));
  handle('outline:restore', (bookId, hid) => { store.restoreOutline(bookId, hid); return store.getBook(bookId); });

  handle('ai:outline', (opts) => gen.createOutline({ ...opts, author: getConfig().author }));
  handle('ai:regenOutline', (bookId, feedback) => gen.regenerateOutline(bookId, feedback));
  handle('ai:refineChapter', (bookId, outline, idx, instruction) => gen.refineChapter(bookId, outline, idx, instruction));
  handle('ai:regenMeta', (bookId) => gen.regenerateMeta(bookId));
  handle('ai:cover', (bookId, opts) => gen.generateCover(bookId, opts));
  handle('ai:rewriteSection', (sectionId, instruction) => gen.rewriteSection(sectionId, instruction));

  handle('gen:plan', (bookId, plan) => gen.planQueue(bookId, plan));
  handle('gen:start', (bookId, plan) => gen.start(bookId, plan));
  handle('gen:pause', (bookId) => gen.pause(bookId));
  handle('gen:dismiss', (bookId) => gen.dismiss(bookId));
  handle('gen:status', (bookId) => (bookId ? gen.status(bookId) : gen.allStatus()));

  handle('media:import', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const src = r.filePaths[0];
    const ext = path.extname(src).slice(1).toLowerCase();
    return gen.saveMedia(fs.readFileSync(src), ext);
  });

  handle('export:pdf', async (bookId, opts = {}) => {
    const book = store.getBook(bookId);
    const safe = book.title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'book';
    const r = await dialog.showSaveDialog(win, { defaultPath: `${safe}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return null;
    await exportPdf({ book, file: r.filePath, mediaDir: mediaDir(), rendererDir: path.join(__dirname, 'renderer'), opts });
    return r.filePath;
  });
  handle('export:md', async (bookId) => {
    const book = store.getBook(bookId);
    const safe = book.title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'book';
    const r = await dialog.showSaveDialog(win, { defaultPath: `${safe}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, exportMarkdown(book), 'utf8');
    return r.filePath;
  });
  handle('shell:showItem', (p) => shell.showItemInFolder(p));
}

// ---------------- Запуск ----------------
app.whenReady().then(async () => {
  nativeTheme.themeSource = 'light';
  log('ready, userData =', userData());
  store = new Store(path.join(userData(), 'bookich.db'));
  await store.init();
  gen = new Generator(store, mediaDir(), getConfig);
  gen.on('progress', (p) => win && !win.isDestroyed() && win.webContents.send('gen:progress', p));
  registerIpc();
  createWindow();
  log('window created');
  if (process.env.BOOKICH_SCREENSHOTS) require('./scripts/screenshots')(win, { store, gen });
  else if (process.env.BOOKICH_SELFTEST) require('./scripts/selftest')(win, { store, gen });
}).catch(fatal);

app.on('before-quit', () => { try { store?.flush(); } catch { /* */ } });
app.on('window-all-closed', () => app.quit());
