// Автотест интерфейса (только для разработки): BOOKICH_MOCK=1 BOOKICH_SELFTEST=1 electron .
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { exportPdf } = require('../src/export');

module.exports = async function selftest(win, { store, gen }) {
  const out = process.env.BOOKICH_SHOTS || path.join(__dirname, '..', 'shots');
  fs.mkdirSync(out, { recursive: true });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const shot = async (name) => { await wait(450); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG()); console.log('shot', name); };
  const log = (...a) => console.log('[selftest]', ...a);
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  try {
    await new Promise((r) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r()));
    await wait(800);
    await shot('01-library-empty');
    await js(`__bookich.go('wizard')`);
    await wait(300);
    await js(`(() => { const t = document.querySelector('.hero-prompt textarea'); t.value = 'изучение Python с нуля'; t.dispatchEvent(new Event('input')); })()`);
    await shot('02-wizard-idea');
    await js(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Сгенерировать содержание')).click()`);
    await wait(150);
    await shot('03-wizard-wait');
    await wait(1500);
    await shot('04-outline');
    // ИИ-правка главы 2
    await js(`(() => { document.querySelectorAll('.ch-card')[1].querySelector('.btn-soft').click(); })()`);
    await wait(200);
    await js(`(() => { const i = document.querySelector('.refine-box input'); i.value = 'больше практики'; i.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter'})); })()`);
    await wait(1500);
    await shot('05-outline-refined');
    await js(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Далее')).click()`);
    await wait(2000);
    await shot('06-launch');
    // запуск: только часть
    await js(`document.querySelectorAll('.radio-card')[1].click()`);
    await wait(300);
    await shot('07-plan-part');
    await js(`document.querySelectorAll('.radio-card')[0].click()`);
    await wait(300);
    await js(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Начать генерацию')).click()`);
    await wait(2500);
    await shot('08-book-generating');
    const bookId = await js(`__bookich.state.route.params.id`);
    // ждём завершения
    for (let i = 0; i < 240; i++) { const s = gen.status(bookId); if (s && s.state !== 'running') break; await wait(500); }
    log('gen state', gen.status(bookId)?.state, gen.status(bookId)?.error);
    await wait(800);
    await shot('09-book-done');
    await js(`__bookich.go('reader', { id: '${bookId}' })`);
    await wait(900);
    await shot('10-reader');
    await js(`document.querySelector('.reader-scroll').scrollTop = 700`);
    await shot('11-reader-scrolled');
    await js(`__bookich.go('editor', { id: '${bookId}' })`);
    await wait(700);
    await shot('12-editor');
    await js(`__bookich.go('settings')`);
    await shot('13-settings');
    await js(`__bookich.go('library')`);
    await wait(600);
    await shot('14-library');
    // ручная книга
    const b = store.createBook({ title: 'Мой дневник путешествий', author: 'Адиль' });
    store.addChapter(b, { title: 'Алматы' });
    await js(`__bookich.go('library')`);
    await wait(600);
    await shot('15-library-2');
    const book = store.getBook(bookId);
    await exportPdf({ book, file: path.join(out, 'book.pdf'), mediaDir: path.join(app.getPath('userData'), 'media'), rendererDir: path.join(__dirname, '..', 'renderer'), opts: { pageSize: 'A4', cover: true, toc: true } });
    log('pdf ok', fs.statSync(path.join(out, 'book.pdf')).size);
  } catch (e) {
    console.error('[selftest] FAIL', e);
  }
  store.flush();
  if (!process.env.BOOKICH_KEEP) app.quit();
};
