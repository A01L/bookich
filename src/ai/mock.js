// Тестовый провайдер — включается переменной окружения BOOKICH_MOCK=1.
// Позволяет проверить интерфейс и генерацию без реального ИИ.
const sleep = (ms, signal) => new Promise((res, rej) => {
  const onAbort = () => { clearTimeout(t); rej(Object.assign(new Error('Отменено'), { retry: false })); };
  const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); res(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

const DEMO = [
  ['Знакомство с Python', 'Почему Python так популярен и как подготовить рабочее место.', ['basics', 'recommended'], [['Что такое Python и где он применяется', 'Сферы применения, сильные стороны'], ['Установка и первый запуск', 'Python, VS Code, терминал'], ['Ваша первая программа', 'print, запуск скрипта']]],
  ['Переменные и типы данных', 'Числа, строки, логика и то, как Python хранит значения.', ['basics'], [['Переменные и присваивание', 'Имена, ссылки, динамическая типизация'], ['Числа и операции', 'int, float, арифметика'], ['Строки и f-строки', 'Срезы, методы, форматирование']]],
  ['Условия и циклы', 'Управляем ходом программы: if, for, while.', ['recommended', 'practice'], [['Ветвления if / elif / else', 'Сравнения и логические операторы'], ['Цикл for и range', 'Перебор последовательностей'], ['Цикл while и break', 'Условные повторения']]],
  ['Коллекции', 'Списки, кортежи, словари и множества на реальных задачах.', ['interesting'], [['Списки и кортежи', 'Изменяемость, индексы'], ['Словари', 'Ключи, значения, перебор'], ['Множества и генераторы', 'Уникальность, comprehension']]],
  ['Функции', 'Как разбивать код на понятные переиспользуемые блоки.', ['recommended'], [['Объявление функций', 'def, параметры, return'], ['Аргументы по умолчанию и *args', 'Гибкие сигнатуры'], ['Область видимости', 'local, global, замыкания']]],
  ['Работа с файлами', 'Читаем и записываем данные, обрабатываем ошибки.', ['practice'], [['Открытие и чтение файлов', 'open, with, кодировки'], ['Запись и CSV', 'csv-модуль'], ['Исключения', 'try / except / finally']]],
  ['Модули и пакеты', 'Стандартная библиотека и установка сторонних пакетов.', ['advanced'], [['Импорт модулей', 'import, from'], ['pip и виртуальные окружения', 'venv, requirements.txt'], ['Полезные модули', 'datetime, random, pathlib']]],
  ['Первый проект', 'Собираем всё вместе: консольный менеджер задач.', ['practice', 'interesting'], [['Проектируем приложение', 'Требования, структура'], ['Пишем код', 'Функции, хранение в JSON'], ['Что изучать дальше', 'Веб, данные, автоматизация']]],
];

function outline(prompt) {
  const pages = Number((prompt.match(/примерно (\d+) страниц/) || [])[1] || 60);
  const per = pages / DEMO.reduce((a, c) => a + c[3].length, 0);
  return JSON.stringify({
    title: 'Python с нуля: от первой строки до проекта',
    subtitle: 'Наглядный учебник для начинающих',
    annotation: 'Пошаговый курс, который проведёт вас от установки Python до собственного приложения. Каждая глава объясняет одну идею простыми словами, показывает её на схемах и закрепляет практикой.',
    tags: ['python', 'программирование', 'с нуля', 'практика', 'схемы'],
    chapters: DEMO.map(([title, summary, tags, secs]) => ({ title, summary, tags, sections: secs.map(([t, b]) => ({ title: t, brief: b, pages: per })) })),
  });
}

const SVG = `\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 300">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#eef5ff"/><stop offset="1" stop-color="#dbeafe"/></linearGradient>
  <marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#1f6fe6"/></marker></defs>
  <rect x="6" y="6" width="708" height="288" rx="18" fill="url(#g)"/>
  <g font-family="Segoe UI, Arial, sans-serif" font-size="16" text-anchor="middle">
    <rect x="40" y="110" width="170" height="74" rx="14" fill="#1f6fe6"/><text x="125" y="143" fill="#fff" font-weight="600">Исходный код</text><text x="125" y="165" fill="#dbeafe" font-size="13">main.py</text>
    <rect x="275" y="110" width="170" height="74" rx="14" fill="#5aa2ff"/><text x="360" y="143" fill="#fff" font-weight="600">Интерпретатор</text><text x="360" y="165" fill="#eef5ff" font-size="13">python</text>
    <rect x="510" y="110" width="170" height="74" rx="14" fill="#0f1b2d"/><text x="595" y="143" fill="#fff" font-weight="600">Результат</text><text x="595" y="165" fill="#9cc7ff" font-size="13">вывод в консоль</text>
    <path d="M212 147 H268" stroke="#1f6fe6" stroke-width="3" marker-end="url(#a)"/><path d="M447 147 H503" stroke="#1f6fe6" stroke-width="3" marker-end="url(#a)"/>
    <text x="360" y="245" fill="#3a4b63" font-size="14">Python читает код построчно и сразу его выполняет</text>
  </g>
</svg>
\`\`\``;

const PARAS = [
  'Python читает программу сверху вниз, строка за строкой. Каждая инструкция выполняется сразу, поэтому результат виден мгновенно: напишите команду, запустите файл и посмотрите, что получилось. Такой цикл «написал - проверил» делает обучение быстрым и наглядным.',
  'Переменная в Python - это имя, которое указывает на значение в памяти. Вам не нужно заранее объявлять её тип: интерпретатор сам поймёт, что `age = 25` - это целое число, а `name = "Анна"` - строка. Это удобно, но требует внимательности к тому, что хранится в каждой переменной.',
  'Хорошая привычка - давать переменным говорящие имена. Сравните `x = 3600` и `seconds_in_hour = 3600`: второй вариант объясняет сам себя, и через месяц вы без труда поймёте собственный код.',
  'Отступы в Python - не просто оформление, а часть синтаксиса. Блок кода внутри условия или цикла выделяется четырьмя пробелами. Если отступ сбит, программа не запустится, и это защищает от целого класса трудноуловимых ошибок.',
];

function section(prompt) {
  const visual = /ВИЗУАЛ/.test(prompt);
  const n = Number((prompt.match(/раздел (\d+)\.(\d+)/) || [0, 1, 1])[2]) || 1;
  let out = `### Главная идея\n\n${PARAS[n % 4]}\n\n${PARAS[(n + 1) % 4]}\n\n`;
  if (visual) out += SVG + '\n\n';
  out += `> [!tip] Совет: запускайте код после каждого небольшого изменения - так ошибки находятся сразу.\n\n`;
  out += `### Пример\n\n\`\`\`python\nname = input("Как вас зовут? ")\nage = int(input("Сколько вам лет? "))\nprint(f"Привет, {name}! Через 10 лет вам будет {age + 10}.")\n\`\`\`\n\n${PARAS[(n + 2) % 4]}\n\n`;
  out += `| Тип | Пример | Назначение |\n|---|---|---|\n| int | \`42\` | Целые числа |\n| float | \`3.14\` | Дробные числа |\n| str | \`"Привет"\` | Текст |\n| bool | \`True\` | Логические значения |\n\n`;
  out += `> [!note] Проверьте себя: чем отличается \`"5" + "5"\` от \`5 + 5\`?\n\n${PARAS[(n + 3) % 4]}\n`;
  return out;
}

function coverSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf3ff"/><stop offset="1" stop-color="#9cc7ff"/></linearGradient><radialGradient id="s" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#5aa2ff"/></radialGradient></defs><rect width="600" height="900" fill="url(#b)"/><circle cx="300" cy="560" r="170" fill="url(#s)" opacity=".9"/><path d="M0 760 Q150 680 300 740 T600 720 V900 H0z" fill="#1f6fe6" opacity=".85"/><path d="M0 820 Q200 760 380 810 T600 800 V900 H0z" fill="#0f3d91"/><g fill="#fff" opacity=".7"><circle cx="120" cy="420" r="4"/><circle cx="480" cy="380" r="3"/><circle cx="420" cy="470" r="5"/></g></svg>`;
}

async function complete({ prompt }, signal) {
  await sleep(350 + Math.random() * 400, signal);
  if (/Верни JSON одной главы/.test(prompt)) {
    const o = JSON.parse(outline(prompt));
    const ch = o.chapters[1];
    ch.title = 'Переработанная глава (ИИ-правка)';
    return JSON.stringify(ch);
  }
  if (/"annotation":"","tags"/.test(prompt)) return JSON.stringify({ annotation: 'Новая аннотация: короткая, живая и по делу. Книга, которую хочется дочитать.', tags: ['новое', 'практика', 'наглядно'] });
  if (/Спроектируй содержание/.test(prompt)) return outline(prompt);
  if (/обложки книги/.test(prompt)) return coverSvg();
  if (/Перепиши раздел/.test(prompt)) return section(prompt).replace('Главная мысль', 'Переписанный раздел');
  return section(prompt);
}

module.exports = { complete };
