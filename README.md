<div align="center">

<img src="docs/banner.png" alt="Bookich" width="100%" />

<h3>Десктопная библиотека, читалка и ИИ-генератор книг для Windows</h3>

<p>
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%7C%2011-2479f2?style=flat-square&logo=windows&logoColor=white" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-34-47848f?style=flat-square&logo=electron&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-sql.js-0f80cc?style=flat-square&logo=sqlite&logoColor=white" />
  <img alt="Claude" src="https://img.shields.io/badge/Claude-CLI-d97757?style=flat-square&logo=anthropic&logoColor=white" />
  <img alt="OpenAI" src="https://img.shields.io/badge/OpenAI-API-111111?style=flat-square&logo=openai&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-5aa9ff?style=flat-square" />
</p>

<p>
  <a href="#-быстрый-старт">Быстрый старт</a> ·
  <a href="#-возможности">Возможности</a> ·
  <a href="#-скриншоты">Скриншоты</a> ·
  <a href="#-концепция">Концепция</a> ·
  <a href="#-подключение-ии">Подключение ИИ</a> ·
  <a href="#-архитектура">Архитектура</a>
</p>

</div>

---

## 💡 О проекте

**Bookich** превращает идею в готовую книгу. Опишите, что хотите изучить или прочитать, и ИИ спроектирует содержание, нарисует обложку и напишет книгу объёмом до 200 страниц с поясняющими схемами, таблицами и примерами. Готовую книгу можно читать прямо в приложении, редактировать вручную и экспортировать в PDF.

Главный принцип: **человек управляет структурой, ИИ пишет текст**. Вы утверждаете содержание до того, как потрачен хотя бы один токен на главы, правите его точечно, а книга генерируется небольшими кусками, которые можно остановить и продолжить в любой момент.

> Все книги хранятся локально в SQLite. Работает через **Claude CLI** (ваша подписка Claude, без API-ключа) или **OpenAI API**.

## ✨ Возможности

<table>
<tr>
<td width="50%" valign="top">

### 🤖 ИИ-генерация
- Книга по одному промпту: учебник, гайд, нон-фикшн, художественная, справочник
- Объём от 5 до **200 страниц**, выбор уровня читателя и языка
- Сначала **содержание, теги и мини-аннотация**, потом текст
- Метки глав: *Рекомендуется*, *Интересно*, *Основа*, *Практика*, *Углублённо*, *Необязательно*
- **Перегенерация** всего содержания с комментарием и **точечная ИИ-правка** одной главы
- История вариантов содержания с восстановлением
- Режим **«Больше визуала»**: SVG-схемы, таблицы и выноски в каждом разделе
- Иллюстрации к главам (OpenAI Images)

</td>
<td width="50%" valign="top">

### 📚 Чтение и работа с книгами
- Библиотека с обложками, поиском и фильтрами
- Читалка: оглавление, размер и тип шрифта, ширина колонки, сохранение позиции
- Редактор Markdown с живым предпросмотром
- Вставка таблиц, кода, выносок, SVG-схем и изображений
- ИИ-правка любого раздела по инструкции
- **Экспорт в PDF** (A4, A5, Letter): обложка, оглавление, номера страниц, закладки
- Экспорт в Markdown
- Обложки: ИИ-изображение, векторный SVG-арт, своё фото или автоузор

</td>
</tr>
</table>

### ⏯️ Генерация по частям

| Режим | Что происходит |
|---|---|
| **Вся книга** | Программа сама делит книгу на куски около 1000 слов и пишет их по порядку |
| **Только N страниц** | Выпускает нужное количество страниц сейчас, остальное можно дописать позже |
| **Выбранные главы** | Генерирует или перегенерирует конкретные главы |

Прогресс сохраняется после каждого куска: генерацию можно поставить на паузу, закрыть программу и продолжить с того же места.

## 📸 Скриншоты

<p align="center">
  <img src="docs/screenshots/01-library.png" alt="Библиотека" width="100%" />
  <br/><sub><b>Библиотека</b> с блоком «Продолжить чтение», фильтрами и обложками</sub>
</p>

<table>
<tr>
<td width="50%"><img src="docs/screenshots/02-wizard.png" alt="Идея" /><p align="center"><sub><b>Шаг 1. Идея:</b> промпт, тип книги, объём, визуал</sub></p></td>
<td width="50%"><img src="docs/screenshots/03-outline.png" alt="Содержание" /><p align="center"><sub><b>Шаг 2. Содержание:</b> аннотация, теги, метки глав, ИИ-правка</sub></p></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/04-launch.png" alt="Запуск" /><p align="center"><sub><b>Шаг 3. Обложка и план генерации</b></sub></p></td>
<td width="50%"><img src="docs/screenshots/05-generating.png" alt="Генерация" /><p align="center"><sub><b>Генерация по кускам</b> с прогрессом и паузой</sub></p></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/06-reader.png" alt="Читалка" /><p align="center"><sub><b>Читалка</b> со схемами, выносками и кодом</sub></p></td>
<td width="50%"><img src="docs/screenshots/07-editor.png" alt="Редактор" /><p align="center"><sub><b>Редактор</b> Markdown с живым предпросмотром</sub></p></td>
</tr>
</table>

<p align="center">
  <img src="docs/screenshots/09-pdf.png" alt="PDF" width="100%" />
  <br/><sub><b>Экспорт в PDF:</b> обложка на всю страницу, оглавление, векторные схемы. <a href="docs/sample.pdf">Пример PDF</a></sub>
</p>

<details>
<summary><b>Настройки</b></summary>
<br/>
<img src="docs/screenshots/08-settings.png" alt="Настройки" width="100%" />
</details>

## 🧭 Концепция

### Путь от идеи до книги

```mermaid
flowchart LR
    A["💡 Идея<br/>промпт, тип, объём"] --> B["🗂️ Содержание<br/>главы, теги, аннотация"]
    B -->|не нравится| R["🔁 Перегенерация<br/>или ИИ-правка главы"]
    R --> B
    B --> C["🎨 Обложка<br/>изображение или SVG-арт"]
    C --> D{"План генерации"}
    D -->|вся книга| E["✍️ Генерация<br/>по кускам"]
    D -->|N страниц| E
    D -->|выбранные главы| E
    E -->|пауза| P["⏸️ Прогресс<br/>сохранён"]
    P -->|продолжить| E
    E --> F["📖 Читалка"]
    E --> G["📝 Редактор"]
    F --> H["📄 PDF"]
    G --> H
```

### Почему книга пишется кусками

Модель не может за один запрос качественно написать 200 страниц. Bookich разбивает книгу на разделы, а большие разделы на части, и для каждого куска собирает контекст:

```mermaid
flowchart TB
    subgraph CTX["Контекст каждого запроса"]
        direction LR
        c1["Аннотация<br/>книги"] ~~~ c2["Всё<br/>содержание"] ~~~ c3["Текущий раздел<br/>и его задача"] ~~~ c4["Хвост предыдущего<br/>фрагмента"]
    end
    CTX --> Q["Запрос к ИИ<br/>около 1000 слов"]
    Q --> S["Очистка ответа<br/>заголовки, обёртки"]
    S --> DB[("SQLite<br/>раздел + прогресс")]
    DB -->|следующий кусок| CTX
```

Так текст остаётся связным (модель видит, чем закончился предыдущий фрагмент), не повторяется (видит план целиком) и не теряется (каждый кусок сразу в базе).

### Модель данных

```mermaid
erDiagram
    BOOK ||--o{ CHAPTER : содержит
    CHAPTER ||--o{ SECTION : содержит
    BOOK ||--o{ OUTLINE_HISTORY : "варианты содержания"
    BOOK {
        text title
        text annotation
        json tags
        json cover
        text status "outline | generating | partial | done | manual"
        json options "тип, уровень, язык, визуал"
        json progress "позиция чтения"
    }
    CHAPTER {
        text title
        text summary
        json tags "recommended, interesting..."
        text image
    }
    SECTION {
        text title
        real pages "плановый объём"
        text content "Markdown"
        text status "pending | generating | done | error"
        int parts_done "для продолжения"
    }
```

## 🚀 Быстрый старт

### Готовая сборка

Скачайте последний релиз со страницы **Releases** и запустите `Bookich.exe`. Устанавливать Node.js не нужно.

### Из исходников

Нужен [Node.js](https://nodejs.org) 18 или новее.

```bash
git clone https://github.com/<you>/bookich.git
cd bookich
npm install
npm start
```

На Windows можно просто дважды щёлкнуть `start.bat`: при первом запуске он сам установит зависимости.

### Сборка установщика

```bash
npm run dist
```

В папке `dist/` появятся установщик NSIS и портативная версия.

## 🔌 Подключение ИИ

Откройте **Настройки → Провайдер ИИ**.

### Claude CLI (рекомендуется)

Работает через вашу подписку Claude, API-ключ не нужен.

```powershell
# 1. Установите Claude Code
irm https://claude.ai/install.ps1 | iex

# 2. Войдите в аккаунт (один раз)
claude
# внутри введите /login, затем /exit
```

В Bookich нажмите **«Найти автоматически»** и **«Проверить подключение»**. Можно указать модель, например `sonnet` или `opus`.

### OpenAI API

Вставьте ключ, он хранится локально в зашифрованном виде (Windows DPAPI). Настраиваются:

| Параметр | По умолчанию | Назначение |
|---|---|---|
| Текстовая модель | `gpt-4.1` | Содержание и текст книги |
| Модель изображений | `gpt-image-1` | Обложки и иллюстрации к главам |
| Base URL | `https://api.openai.com/v1` | Любой совместимый сервер: LM Studio, OpenRouter и другие |

> 💡 Можно комбинировать: текст через Claude CLI, а обложки-изображения через OpenAI.

## 🏗️ Архитектура

```mermaid
flowchart LR
    subgraph R["Renderer (интерфейс)"]
        UI["Vanilla JS<br/>без сборки"]
        MD["marked + DOMPurify<br/>Markdown, SVG"]
    end
    subgraph M["Main process"]
        IPC["IPC API"]
        GEN["Генератор<br/>очередь кусков"]
        PROV["Провайдеры"]
        PDF["printToPDF"]
        DB[("sql.js<br/>SQLite")]
    end
    UI <-->|preload bridge| IPC
    IPC --> GEN --> PROV
    PROV --> CLI["Claude CLI"]
    PROV --> OAI["OpenAI API"]
    GEN --> DB
    IPC --> DB
    IPC --> PDF
```

```
bookich/
├── main.js              главный процесс: окно, IPC, настройки, журнал
├── preload.js           безопасный мост к интерфейсу
├── src/
│   ├── db.js            SQLite: книги, главы, разделы, история содержания
│   ├── export.js        PDF и Markdown
│   └── ai/
│       ├── providers.js Claude CLI, OpenAI, поиск claude, повторы
│       ├── prompts.js   промпты содержания, разделов, обложек
│       ├── generator.js очередь генерации по кускам, обложки
│       └── mock.js      демо-провайдер для разработки
├── renderer/
│   ├── index.html       оболочка приложения
│   ├── print.html       вёрстка книги для PDF
│   ├── styles.css       светлая голубая тема
│   └── js/views/        библиотека, книга, читалка, редактор, мастер, настройки
├── assets/              иконки
└── docs/                скриншоты и пример PDF
```

### Технологии

| Слой | Что используется | Почему |
|---|---|---|
| Оболочка | Electron 34 | Нативное окно Windows, Chromium для вёрстки и PDF |
| База | SQLite через sql.js (WebAssembly) | Без нативной компиляции, один файл `bookich.db` |
| Интерфейс | Vanilla JS, ES-модули | Нет сборщика, быстрый старт |
| Markdown | marked + DOMPurify | Безопасный рендер, встроенные SVG-схемы |
| PDF | `webContents.printToPDF` | Векторный текст и схемы, закладки по главам |
| ИИ | Claude CLI (`claude -p`), OpenAI Chat и Images | Подписка или ключ, на выбор |

## 🎨 Дизайн

- Светлая тема с голубым акцентом `#2479f2`
- Анимации 120-170 мс: плавные, но быстрые, не мешают при частом использовании
- Если в Windows отключены анимации, приложение тоже их отключает
- Типографика: Segoe UI Variable для интерфейса, засечки для чтения

## 🗂️ Где хранятся данные

| Что | Где |
|---|---|
| База книг | `%APPDATA%\Bookich\bookich.db` |
| Обложки и иллюстрации | `%APPDATA%\Bookich\media\` |
| Журнал запуска | `bookich-log.txt` рядом с `Bookich.exe` |

Папку данных можно открыть из **Настроек**.

## 🧪 Для разработчиков

Демо-режим подменяет ИИ локальной заглушкой, чтобы проверить интерфейс без затрат:

```powershell
$env:BOOKICH_MOCK=1; npm start
```

Автотест всего сценария (мастер, генерация, читалка, редактор, PDF):

```bash
BOOKICH_MOCK=1 BOOKICH_SELFTEST=1 npx electron .
```

Скриншоты для README:

```bash
BOOKICH_MOCK=1 BOOKICH_SCREENSHOTS=docs/screenshots npx electron . --force-device-scale-factor=2
```

## 🛣️ Планы

- [ ] Тёмная тема для чтения
- [ ] Экспорт в EPUB
- [ ] Импорт PDF и EPUB в библиотеку
- [ ] Anthropic API как третий провайдер
- [ ] Озвучка глав

## 📄 Лицензия

[MIT](LICENSE)

<div align="center">
<sub>Сделано с любовью к книгам и голубому цвету 💙</sub>
</div>
