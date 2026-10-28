// Экспорт книги: PDF (через Chromium printToPDF) и Markdown
const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function exportPdf({ book, file, mediaDir, rendererDir, opts = {} }) {
  const w = new BrowserWindow({
    show: false, width: 900, height: 1200,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  try {
    await w.loadFile(path.join(rendererDir, 'print.html'));
    for (let i = 0; i < 50 && !(await w.webContents.executeJavaScript('typeof window.renderBook === "function"')); i++) await new Promise((r) => setTimeout(r, 100));
    const payload = { book, mediaUrl: pathToFileURL(mediaDir).href, opts: { pageSize: opts.pageSize || 'A4', cover: opts.cover !== false, toc: opts.toc !== false } };
    await w.webContents.executeJavaScript(`window.renderBook(${JSON.stringify(payload)})`, true);
    const pdf = await w.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      generateDocumentOutline: true,
      generateTaggedPDF: true,
    });
    fs.writeFileSync(file, pdf);
  } finally {
    w.destroy();
  }
}

function exportMarkdown(book) {
  const out = [`# ${book.title}`];
  if (book.subtitle) out.push(`*${book.subtitle}*`);
  if (book.author) out.push(`**${book.author}**`);
  if (book.annotation) out.push(`> ${book.annotation}`);
  for (const c of book.chapters) {
    out.push(`\n## ${c.title}`);
    for (const s of c.sections) {
      if (s.title) out.push(`\n### ${s.title}`);
      if (s.content) out.push(s.content.replace(/\]\(media:\/\//g, ']('));
    }
  }
  return out.join('\n\n') + '\n';
}

module.exports = { exportPdf, exportMarkdown };
