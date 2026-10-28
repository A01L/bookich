// Настройки
import { h, ic, toast, toastErr, debounce } from '../ui.js';
import { state } from '../state.js';

export async function render(root) {
  let cfg = await window.api.settings.get();
  const page = h('div.settings');
  root.append(page);

  const save = debounce(async (patch) => {
    try { cfg = await window.api.settings.set(patch); state.settings = cfg; } catch (e) { toastErr(e); }
  }, 350);
  const pending = {};
  const set = (k, v) => { pending[k] = v; save({ ...pending }); };

  const input = (k, props = {}) => {
    const el = h('input.input', { value: cfg[k] ?? '', ...props });
    el.addEventListener('input', () => set(k, props.type === 'number' ? Number(el.value) : el.value.trim()));
    return el;
  };
  const select = (k, opts) => {
    const el = h('select.select', opts.map(([v, l]) => h('option', { value: v, selected: cfg[k] === v }, l)));
    el.addEventListener('change', () => set(k, el.value));
    return el;
  };
  const f = (label, el, hint) => h('div.field', h('label', label), el, hint ? h('div.hint', hint) : null);

  const draw = () => {
    const prov = (key, iconName, title, desc) => h(`div.prov${cfg.provider === key ? '.active' : ''}`, { onclick: async () => { cfg = await window.api.settings.set({ provider: key }); state.settings = cfg; draw(); } },
      h('div.pi', ic(iconName, 20)), h('div', h('div', { style: { fontWeight: 650 } }, title), h('div.small.muted', desc)));

    const testOut = h('div');
    const testBtn = h('button.btn', { onclick: async () => {
      await save.flush?.({ ...pending });
      testBtn.disabled = true; testBtn.replaceChildren(h('div.spinner'), 'Проверяю…');
      testOut.replaceChildren();
      try {
        const r = await window.api.settings.test();
        testOut.replaceChildren(h('div.test-out.ok', `Работает: «${r.reply}» · ${(r.ms / 1000).toFixed(1)} с`));
      } catch (e) { testOut.replaceChildren(h('div.test-out.err', e.message)); }
      testBtn.disabled = false; testBtn.replaceChildren(ic('check', 16), 'Проверить подключение');
    } }, ic('check', 16), 'Проверить подключение');

    const keyIn = h('input.input', { type: 'password', placeholder: cfg.hasOpenaiKey ? `Сохранён: ${cfg.openaiKeyHint}` : 'sk-…', autocomplete: 'off' });
    keyIn.addEventListener('change', async () => {
      cfg = await window.api.settings.set({ openaiKey: keyIn.value.trim() });
      state.settings = cfg; keyIn.value = ''; keyIn.placeholder = cfg.hasOpenaiKey ? `Сохранён: ${cfg.openaiKeyHint}` : 'sk-…';
      toast(cfg.hasOpenaiKey ? 'Ключ сохранён (зашифрован)' : 'Ключ удалён');
      draw();
    });

    const pathIn = input('claudePath', { placeholder: 'claude' });
    const findBtn = h('button.btn', { title: 'Найти установленный Claude CLI', onclick: async () => {
      const p = await window.api.settings.findClaude();
      if (p) { pathIn.value = p; set('claudePath', p); toast('Claude CLI найден'); }
      else toast('Claude CLI не найден. Установите Claude Code и войдите командой «claude».', 'err');
    } }, ic('search', 15), 'Найти автоматически');
    const claudeBox = h('div.form-grid',
      f('Команда Claude CLI', h('div.row', pathIn, findBtn), 'Обычно просто «claude». Можно указать полный путь, например C:\\Users\\…\\AppData\\Roaming\\npm\\claude.cmd'),
      f('Модель (необязательно)', input('claudeModel', { placeholder: 'по умолчанию' }), 'Например: sonnet, opus или полное имя модели'));
    const openaiBox = h('div.col', { style: { gap: '14px' } },
      h('div.form-grid',
        f('API key', h('div.row', keyIn, cfg.hasOpenaiKey ? h('button.icon-btn', { title: 'Удалить ключ', onclick: async () => { cfg = await window.api.settings.set({ openaiKey: '' }); state.settings = cfg; draw(); } }, ic('trash', 16)) : null), 'Хранится локально в зашифрованном виде (Windows DPAPI).'),
        f('Base URL', input('openaiBase'), 'Можно указать совместимый сервер (LM Studio, OpenRouter и т. п.)')),
      h('div.form-grid',
        f('Текстовая модель', input('openaiModel', { placeholder: 'gpt-4.1' })),
        f('Модель изображений', input('openaiImageModel', { placeholder: 'gpt-image-1' }), 'Для обложек и иллюстраций к главам')),
      h('div.form-grid', f('Качество изображений', select('imageQuality', [['low', 'Низкое (быстро, дёшево)'], ['medium', 'Среднее'], ['high', 'Высокое']])), h('div')));

    page.replaceChildren(
      h('div', { style: { padding: '6px 0 6px' } }, h('div.h1', 'Настройки'), h('div.muted', 'Подключение ИИ, параметры генерации и читалки')),
      cfg.mock ? h('div.test-out.ok', 'Включён демо-режим (BOOKICH_MOCK=1): ИИ имитируется локально.') : null,
      h('div.card.card-pad.col', { style: { gap: '16px' } },
        h('div.h3', 'Провайдер ИИ'),
        h('div.prov-grid',
          prov('claude', 'terminal', 'Claude CLI (локально)', 'Использует установленный Claude Code и вашу подписку. Без API-ключа.'),
          prov('openai', 'key', 'OpenAI API', 'Тексты через GPT, обложки и иллюстрации через OpenAI Images.')),
        cfg.provider === 'openai' ? openaiBox : claudeBox,
        cfg.provider === 'claude' ? h('details', h('summary.small.muted', { style: { cursor: 'pointer' } }, 'OpenAI для обложек-изображений (необязательно)'), h('div', { style: { marginTop: '12px' } }, openaiBox)) : null,
        h('div', testBtn, testOut)),
      h('div.card.card-pad.col', { style: { gap: '16px' } },
        h('div.h3', 'Генерация'),
        h('div.form-grid',
          f('Язык книг по умолчанию', select('language', [['ru', 'Русский'], ['en', 'English'], ['kk', 'Қазақша'], ['uk', 'Українська'], ['de', 'Deutsch'], ['es', 'Español'], ['fr', 'Français']])),
          f('Автор по умолчанию', input('author', { placeholder: 'Ваше имя' }))),
        h('div.form-grid',
          f('Размер куска (слов за запрос)', input('chunkWords', { type: 'number', min: 400, max: 2500, step: 100 }), 'Меньше — стабильнее и чаще сохраняется прогресс; больше — меньше запросов.'),
          f('Тайм-аут запроса, сек', input('timeoutSec', { type: 'number', min: 60, max: 1800, step: 30 }), 'Для Claude CLI на длинных кусках.'))),
      h('div.card.card-pad.row',
        h('div.grow', h('div.h3', 'Данные'), h('div.small.muted', 'База книг (SQLite) и изображения хранятся локально.')),
        h('button.btn', { onclick: () => window.api.settings.openData() }, ic('folder', 16), 'Открыть папку данных')),
      h('div.small.muted', { style: { textAlign: 'center' } }, `Bookich ${state.info.version}`));
  };
  draw();
  return () => save.flush?.({ ...pending });
}
