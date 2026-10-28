// Рендер Markdown → безопасный HTML (с SVG-схемами и выносками)
let svgCounter = 0;

function prepareSvg(code) {
  const m = code.match(/<svg[\s\S]*?(<\/svg>|$)/i);
  if (!m) return null;
  let svg = m[0];
  if (!/<\/svg>\s*$/i.test(svg)) svg += '</svg>';
  const p = `s${++svgCounter}x`;
  svg = svg
    .replace(/\sid="([^"]+)"/g, ` id="${p}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${p}-$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${p}-$1"`);
  // viewBox из width/height, если его нет
  if (!/viewBox=/i.test(svg)) {
    const w = (svg.match(/<svg[^>]*\swidth="(\d+)/i) || [])[1];
    const hh = (svg.match(/<svg[^>]*\sheight="(\d+)/i) || [])[1];
    if (w && hh) svg = svg.replace(/<svg/i, `<svg viewBox="0 0 ${w} ${hh}"`);
  }
  svg = svg.replace(/(<svg[^>]*?)\s(width|height)="[^"]*"/gi, '$1').replace(/(<svg[^>]*?)\s(width|height)="[^"]*"/gi, '$1');
  return svg;
}

window.marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    code(token) {
      const lang = (token.lang || '').trim().toLowerCase();
      if (lang === 'svg' || (lang === 'xml' && /<svg/i.test(token.text)) || (!lang && /^\s*<svg/i.test(token.text))) {
        const svg = prepareSvg(token.text);
        return svg ? `<figure class="diagram">${svg}</figure>` : '<figure class="diagram broken">Схема повреждена</figure>';
      }
      return false;
    },
  },
});

const URI_RE = /^(?:(?:https?|file|mailto|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

export function renderMarkdown(md, mediaUrl = '') {
  let src = String(md || '');
  if (mediaUrl) src = src.replace(/\]\(media:\/\//g, `](${mediaUrl}/`);
  const raw = window.marked.parse(src);
  const clean = window.DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ALLOWED_URI_REGEXP: URI_RE,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
  });
  const tpl = document.createElement('template');
  tpl.innerHTML = clean;
  // Выноски: > [!tip] Текст
  tpl.content.querySelectorAll('blockquote').forEach((bq) => {
    const first = bq.querySelector('p');
    if (!first) return;
    const m = first.innerHTML.match(/^\s*\[!(tip|note|warning|example|info|important|caution)\]\s*/i);
    if (!m) return;
    const kind = { info: 'note', important: 'note', caution: 'warning' }[m[1].toLowerCase()] || m[1].toLowerCase();
    first.innerHTML = first.innerHTML.slice(m[0].length);
    const div = document.createElement('div');
    div.className = `callout ${kind}`;
    div.append(...bq.childNodes);
    bq.replaceWith(div);
  });
  tpl.content.querySelectorAll('a[href^="http"]').forEach((a) => a.setAttribute('target', '_blank'));
  return tpl.innerHTML;
}

/** HTML главы: заголовки разделов + текст */
export function renderChapter(chapter, mediaUrl) {
  return chapter.sections.map((s) => {
    const head = s.title ? `<h2 class="sec-title" id="sec-${s.id}">${escapeHtml(s.title)}</h2>` : `<a id="sec-${s.id}"></a>`;
    return head + renderMarkdown(s.content, mediaUrl);
  }).join('\n');
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
