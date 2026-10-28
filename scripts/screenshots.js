// Скриншоты для README (только для разработки):
// BOOKICH_MOCK=1 BOOKICH_SELFTEST=1 BOOKICH_SCREENSHOTS=docs/screenshots electron .
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { exportPdf } = require('../src/export');

module.exports = async function screenshots(win, { store, gen }) {
  const out = path.resolve(process.env.BOOKICH_SCREENSHOTS);
  fs.mkdirSync(out, { recursive: true });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const shot = async (name) => { await wait(600); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG()); console.log('shot', name); };
  const click = (text) => js(`[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)})).click()`);
  try {
    await new Promise((r) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r()));
    await wait(800);

    // Демо-книги для библиотеки
    const demo = [
      ['История Древнего Рима', 'От основания города до падения империи', 'Bookich AI', 0.62],
      ['Нейросети простым языком', 'Как машины учатся видеть и говорить', 'Bookich AI', 0.18],
      ['Личные финансы', 'Бюджет, накопления, инвестиции', 'Адиль', 0],
      ['Английский для путешествий', '30 дней до уверенного разговора', 'Bookich AI', 0.4],
    ];
    for (const [title, subtitle, author, prog] of demo) {
      const id = store.createBook({ title, subtitle, author, source: author === 'Адиль' ? 'manual' : 'ai', status: author === 'Адиль' ? 'manual' : 'done' });
      const ch = store.addChapter(id, { title: 'Глава 1' });
      const s = store.getBook(id).chapters[0].sections[0];
      store.updateSection(s.id, { content: 'Текст главы. '.repeat(400), status: 'done', pages: [84, 120, 46, 64][demo.findIndex((d) => d[0] === title)] });
      if (prog) store.updateBook(id, { progress: { chapterId: ch, chapterTitle: 'Глава 1', ratio: prog, book: prog }, opened_at: Date.now() - 100000 });
    }

    // Мастер: идея
    await js(`__bookich.go('wizard')`);
    await wait(300);
    await js(`(() => { const t = document.querySelector('.hero-prompt textarea'); t.value = 'Хочу изучить Python с нуля: от переменных до первого своего проекта, с понятными схемами'; t.dispatchEvent(new Event('input')); })()`);
    await shot('02-wizard');
    await click('Сгенерировать содержание');
    await wait(1800);
    await shot('03-outline');
    await click('Далее');
    await wait(2200);
    await js(`document.querySelectorAll('.radio-card')[1].click()`);
    await shot('04-launch');
    await js(`document.querySelectorAll('.radio-card')[0].click()`);
    await wait(300);
    await click('Начать генерацию');
    await wait(4500);
    await shot('05-generating');
    const bookId = await js(`__bookich.state.route.params.id`);
    for (let i = 0; i < 300; i++) { const s = gen.status(bookId); if (s && s.state !== 'running') break; await wait(500); }
    store.updateBook(bookId, { opened_at: Date.now() });

    // Читалка: глава 3, прокрутка к схеме
    const book = store.getBook(bookId);
    await js(`__bookich.go('reader', { id: '${bookId}', chapterId: '${book.chapters[2].id}' })`);
    await wait(900);
    await js(`(() => { const s = document.querySelector('.reader-scroll'); const f = s.querySelector('figure.diagram'); s.scrollTop = f.offsetTop - 260; })()`);
    await shot('06-reader');
    await js(`__bookich.go('editor', { id: '${bookId}', chapterId: '${book.chapters[1].id}' })`);
    await wait(800);
    await shot('07-editor');
    await js(`__bookich.go('settings')`);
    await wait(400);
    await shot('08-settings');
    await js(`__bookich.go('library')`);
    await wait(900);
    await shot('01-library');

    await exportPdf({ book: store.getBook(bookId), file: path.join(out, 'sample.pdf'), mediaDir: path.join(app.getPath('userData'), 'media'), rendererDir: path.join(__dirname, '..', 'renderer'), opts: { pageSize: 'A4', cover: true, toc: true } });
    console.log('pdf ok');
  } catch (e) {
    console.error('[screenshots] FAIL', e);
  }
  store.flush();
  app.quit();
};
