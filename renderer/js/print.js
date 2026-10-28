// Вёрстка книги для PDF (вызывается из главного процесса)
import { renderChapter, escapeHtml } from './markdown.js';
import { coverEl } from './cover.js';

const SIZES = { A4: ['210mm', '297mm'], A5: ['148mm', '210mm'], Letter: ['8.5in', '11in'] };
const TAGS = { recommended: 'Рекомендуется', interesting: 'Интересно', basics: 'Основа', practice: 'Практика', advanced: 'Углублённо', optional: 'Необязательно' };

window.renderBook = async ({ book, mediaUrl, opts }) => {
  const [w, hgt] = SIZES[opts.pageSize] || SIZES.A4;
  const small = opts.pageSize === 'A5';
  document.getElementById('page-style').textContent = `
    @page { size: ${w} ${hgt}; margin: ${small ? '14mm 13mm 16mm' : '20mm 19mm 22mm'};
      @bottom-center { content: counter(page); font: 9pt "Segoe UI", sans-serif; color: #8a9ab0; }
      @top-right { content: "${escapeHtml(book.title).replace(/"/g, '')}"; font: 8pt "Segoe UI", sans-serif; color: #a9b7ca; }
    }
    @page cover { margin: 0; @bottom-center { content: none; } @top-right { content: none; } }
    @page front { @bottom-center { content: none; } @top-right { content: none; } }
    .print-cover { width: ${w}; height: ${hgt}; }
    .print-front { page: front; }
    ${small ? '.md { --fs: 10pt; } .print-chapter h1.ct { font-size: 18pt; }' : ''}`;

  const root = document.getElementById('root');
  root.innerHTML = '';
  const withText = book.chapters.filter((c) => c.sections.some((s) => s.content));

  if (opts.cover) {
    const cov = document.createElement('section');
    cov.className = 'print-cover';
    cov.append(coverEl(book, mediaUrl));
    root.append(cov);

    const front = document.createElement('section');
    front.className = 'print-front';
    front.innerHTML = `
      <h1>${escapeHtml(book.title)}</h1>
      ${book.annotation ? `<div class="ann">${escapeHtml(book.annotation)}</div>` : ''}
      ${book.tags?.length ? `<div class="tags">${book.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      ${opts.toc ? `<div class="eyebrow" style="margin-bottom:4mm">Содержание</div><div class="print-toc">${withText.map((c, i) => `
        <div class="tc"><span class="n">${i + 1}</span><span>${escapeHtml(c.title)}</span></div>
        ${c.sections.filter((s) => s.title && s.content).map((s) => `<div class="ts">${escapeHtml(s.title)}</div>`).join('')}`).join('')}</div>` : ''}`;
    root.append(front);
  }

  withText.forEach((c) => {
    const i = book.chapters.indexOf(c);
    const sec = document.createElement('section');
    sec.className = 'print-chapter';
    const tags = (c.tags || []).map((t) => `<span class="tag t-${t}">${TAGS[t] || t}</span>`).join(' ');
    sec.innerHTML = `
      <div class="eyebrow">Глава ${i + 1}</div>
      <h1 class="ct">${escapeHtml(c.title)}</h1>
      ${c.summary || tags ? `<div class="cs">${escapeHtml(c.summary || '')}${tags ? `<div style="margin-top:3mm">${tags}</div>` : ''}</div>` : ''}
      ${c.image ? `<img class="chap-img" src="${mediaUrl}/${encodeURIComponent(c.image)}">` : ''}
      <div class="md">${renderChapter({ ...c, sections: c.sections.filter((s) => s.content) }, mediaUrl)}</div>`;
    root.append(sec);
  });

  // ждём загрузку изображений и шрифтов
  await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  await document.fonts?.ready;
  return true;
};
