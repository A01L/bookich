// Промпты для генерации книг.
const LANGS = { ru: 'русском', en: 'английском', kk: 'казахском', de: 'немецком', es: 'испанском', fr: 'французском', uk: 'украинском' };
const CHAPTER_TAGS = ['recommended', 'interesting', 'basics', 'practice', 'advanced', 'optional'];
const KINDS = {
  study: 'учебник / курс для изучения темы: от простого к сложному, примеры, упражнения, итоги глав',
  guide: 'практическое руководство: конкретные шаги, чек-листы, советы, типичные ошибки',
  nonfiction: 'научно-популярная книга: увлекательное повествование, факты, истории, объяснения',
  fiction: 'художественная книга: сюжет, персонажи, диалоги, атмосфера; главы — части истории',
  reference: 'справочник: структурированные статьи, определения, таблицы, быстрый поиск',
};

const lang = (o) => LANGS[o.language] || o.language || 'русском';

function chaptersHint(pages) {
  if (pages <= 15) return '3–5 глав';
  if (pages <= 40) return '5–7 глав';
  if (pages <= 80) return '6–10 глав';
  if (pages <= 140) return '9–13 глав';
  return '11–16 глав';
}

const OUTLINE_SCHEMA = `{
  "title": "название книги",
  "subtitle": "подзаголовок (коротко)",
  "annotation": "мини-аннотация, 2–4 предложения: о чём книга и что получит читатель",
  "tags": ["5–8 коротких тегов-тем книги"],
  "chapters": [
    {
      "title": "название главы",
      "summary": "1–2 предложения: что в главе",
      "tags": ["одна-две метки из: recommended, interesting, basics, practice, advanced, optional"],
      "sections": [ { "title": "название раздела", "brief": "что раскрыть, 1 предложение", "pages": 3 } ]
    }
  ]
}`;

function outlinePrompt(o) {
  const system = 'Ты — опытный редактор и автор книг. Ты проектируешь структуру книг: логичную, без повторов, с ясной прогрессией. Отвечай строго валидным JSON без пояснений.';
  const prompt = `Спроектируй содержание книги.

Запрос пользователя: «${o.prompt}»
Тип книги: ${KINDS[o.kind] || KINDS.study}
Уровень читателя: ${o.level || 'любой'}
Объём: примерно ${o.pages} страниц (страница ≈ 280 слов). Сумма "pages" всех разделов должна быть ≈ ${o.pages}.
Количество глав: ${chaptersHint(o.pages)}, в каждой 2–6 разделов по 1–6 страниц.
Язык книги: пиши всё на ${lang(o)} языке.
${o.visual ? 'Книга будет насыщена визуалом (схемы, диаграммы, таблицы) — заложи в разделы темы, которые удобно объяснять схемами.' : ''}
${o.extra ? `Дополнительные пожелания: ${o.extra}` : ''}

Метки глав (tags): recommended — обязательно к прочтению / ключевая; interesting — особенно увлекательная; basics — фундамент; practice — практика; advanced — углублённо; optional — можно пропустить. Отметь честно: «recommended» не у всех глав.

Верни JSON строго такой структуры:
${OUTLINE_SCHEMA}`;
  return { system, prompt, json: true };
}

function regenOutlinePrompt(o, current, feedback) {
  const base = outlinePrompt(o);
  base.prompt += `

Предыдущий вариант содержания пользователю не понравился:
${compactOutline(current)}

${feedback ? `Что нужно изменить: ${feedback}` : 'Предложи заметно другой, более сильный вариант структуры.'}`;
  return base;
}

function refineChapterPrompt(o, outline, chapterIndex, instruction) {
  const ch = outline.chapters[chapterIndex];
  const system = 'Ты — редактор книги. Правишь одну главу в содержании. Отвечай строго валидным JSON.';
  const prompt = `Книга: «${outline.title}». ${outline.annotation || ''}
Всё содержание (для контекста):
${compactOutline(outline)}

Нужно изменить главу №${chapterIndex + 1}:
${JSON.stringify({ title: ch.title, summary: ch.summary, tags: ch.tags, sections: ch.sections.map((s) => ({ title: s.title, brief: s.brief, pages: s.pages })) }, null, 1)}

Инструкция пользователя: «${instruction}»
Сохрани примерно тот же суммарный объём страниц (если пользователь не просит иначе). Язык: ${lang(o)}.
Верни JSON одной главы: {"title":"","summary":"","tags":[],"sections":[{"title":"","brief":"","pages":2}]}`;
  return { system, prompt, json: true };
}

function metaPrompt(o, outline) {
  return {
    system: 'Ты — редактор книжного издательства. Отвечай строго валидным JSON.',
    prompt: `Содержание книги:
${compactOutline(outline)}

Напиши новую мини-аннотацию (2–4 предложения, цепляющая, без клише) и 5–8 тегов-тем. Язык: ${lang(o)}.
Верни JSON: {"annotation":"","tags":[""]}`,
    json: true,
  };
}

function compactOutline(outline) {
  return (outline.chapters || []).map((c, i) =>
    `${i + 1}. ${c.title}${c.summary ? ` — ${c.summary}` : ''}\n` +
    (c.sections || []).map((s, j) => `   ${i + 1}.${j + 1} ${s.title} (${s.pages} стр.)`).join('\n')
  ).join('\n');
}

const VISUAL_RULES = `ВИЗУАЛ (обязательно): в этом фрагменте вставь 1–2 поясняющие схемы в виде кода SVG в блоке \`\`\`svg ... \`\`\`.
Требования к SVG: корневой <svg> с viewBox="0 0 720 400" и xmlns, без width/height, без скриптов, без внешних ссылок и изображений;
шрифт font-family="Segoe UI, Arial, sans-serif", размер текста 14–18; палитра: #1f6fe6, #5aa2ff, #dbeafe, #eef5ff, #0f1b2d, #f59e0b для акцентов; фон светлый или прозрачный;
подписи на языке книги, короткие, не выходят за края; схема должна реально объяснять материал (блок-схема, цикл, сравнение, временная шкала, структура, график).
Также используй, где уместно, таблицы Markdown и выноски: строка "> [!tip] Совет: ...", "> [!note] ...", "> [!warning] ...", "> [!example] ...".`;

const PLAIN_RULES = `Можно использовать таблицы Markdown и выноски ("> [!tip] ...", "> [!note] ..."), но без SVG.`;

function sectionPrompt({ book, outline, chapter, chapterIndex, section, sectionIndex, part, parts, words, prevTail, options }) {
  const o = options;
  const system = `Ты — талантливый автор. Пишешь книгу «${book.title}» (${KINDS[o.kind] || KINDS.study}). Язык: ${lang(o)}. Уровень читателя: ${o.level || 'любой'}.
Пиши живо, конкретно и по делу, без воды и без повторов уже написанного. Формат — Markdown. Не пиши вступлений вида «В этом разделе мы...» в каждом фрагменте и не подводи итоги, если это не последняя часть раздела.`;
  const isFirst = part === 0, isLast = part === parts - 1;
  const prompt = `Аннотация книги: ${book.annotation}

Содержание книги:
${compactOutline(outline)}

Сейчас пишем: глава ${chapterIndex + 1} «${chapter.title}» → раздел ${chapterIndex + 1}.${sectionIndex + 1} «${section.title}».
Что раскрыть в разделе: ${section.brief || '—'}
${parts > 1 ? `Раздел пишется частями. Это часть ${part + 1} из ${parts}. ${isFirst ? 'Начни раздел.' : 'Продолжи ровно с того места, где закончился предыдущий фрагмент.'} ${isLast ? 'Заверши раздел.' : 'Не завершай раздел — дальше будет продолжение.'}` : ''}
${prevTail ? `\nКонец предыдущего фрагмента (для связности, НЕ повторяй его):\n"""\n${prevTail}\n"""\n` : ''}
Объём этого фрагмента: около ${words} слов.
${o.visual ? VISUAL_RULES : PLAIN_RULES}
${o.kind === 'study' && isLast ? 'В конце раздела можно дать 2–3 вопроса или мини-упражнение для самопроверки.' : ''}
${o.extra ? `Пожелания автора: ${o.extra}` : ''}

Правила оформления: НЕ пиши заголовок раздела (он добавится автоматически); для подзаголовков внутри используй ### и ####. Выдай только текст книги, без комментариев.`;
  return { system, prompt };
}

function rewriteSectionPrompt({ book, chapter, section, instruction, options }) {
  return {
    system: `Ты — редактор и автор книги «${book.title}». Язык: ${lang(options)}. Формат — Markdown.`,
    prompt: `Глава «${chapter.title}», раздел «${section.title}».
Текущий текст раздела:
"""
${section.content}
"""

Перепиши раздел по инструкции: «${instruction}».
Сохрани формат (### подзаголовки, \`\`\`svg схемы, таблицы, выноски > [!tip]). Не пиши заголовок раздела. Выдай только новый текст раздела.
${options.visual ? VISUAL_RULES : ''}`,
  };
}

function coverArtPrompt(book, style) {
  return {
    system: 'Ты — иллюстратор и SVG-художник. Отвечай только кодом SVG.',
    prompt: `Нарисуй художественную иллюстрацию для обложки книги «${book.title}». ${book.annotation || ''}
Стиль: ${style || 'современная векторная иллюстрация, минимализм'}.
Требования: один корневой <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900">; БЕЗ ТЕКСТА и букв; без скриптов и внешних ссылок;
используй градиенты (linearGradient/radialGradient), фигуры, path; светлая гармоничная палитра с голубыми оттенками;
верхняя треть — спокойная (там будет название), основной образ — в центре и внизу; 40–120 элементов, выразительная метафора темы книги.
Выдай только SVG.`,
  };
}

function coverImagePrompt(book, style) {
  return `Book cover illustration for a book titled "${book.title}". Theme: ${book.annotation || book.subtitle || ''}.
Style: ${style || 'modern clean vector illustration, soft light colors with blue accents'}.
Vertical composition. Absolutely no text, no letters, no typography, no logos. Keep the top third calm and uncluttered (a title will be placed there). High quality, harmonious, elegant.`;
}

function chapterImagePrompt(book, chapter, style) {
  return `Illustration for a book chapter. Book: "${book.title}". Chapter: "${chapter.title}" — ${chapter.summary || ''}.
Style: ${style || 'clean modern editorial illustration, light background, soft blue palette'}. Explanatory, clear visual metaphor. No text, no letters.`;
}

module.exports = {
  outlinePrompt, regenOutlinePrompt, refineChapterPrompt, metaPrompt, sectionPrompt, rewriteSectionPrompt,
  coverArtPrompt, coverImagePrompt, chapterImagePrompt, compactOutline, CHAPTER_TAGS,
};
