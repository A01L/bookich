// Мини-фреймворк UI: создание элементов, тосты, модалки, меню.
import { icon } from './icons.js';

// null/false/undefined в append/replaceChildren просто пропускаются (а не выводятся как текст «null»)
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const m of ['append', 'prepend', 'replaceChildren']) {
    const orig = proto[m];
    proto[m] = function (...nodes) { return orig.apply(this, nodes.filter((n) => n != null && n !== false)); };
  }
}

/** h('div.card.pad', {onclick, html, ...attrs}, ...children) */
export function h(tag, props, ...children) {
  if (props == null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    if (props !== undefined) children.unshift(props);
    props = {};
  }
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'icon') el.insertAdjacentHTML('afterbegin', icon(v, props.iconSize || 18));
    else if (k === 'iconSize') continue;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const ic = (name, size, sw) => {
  const t = document.createElement('template');
  t.innerHTML = icon(name, size, sw);
  return t.content.firstChild;
};

export const debounce = (fn, ms = 500) => {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
};
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};
export const pagesStr = (n) => `${n} ${plural(n, 'страница', 'страницы', 'страниц')}`;
export const uid = () => crypto.randomUUID();

// ---------------- Тосты ----------------
export function toast(msg, type = 'ok', ms = 3200) {
  const box = document.getElementById('toasts');
  const el = h(`div.toast.${type}`, ic(type === 'err' ? 'alert' : 'check', 17), h('span', msg));
  box.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 200); }, type === 'err' ? Math.max(ms, 6000) : ms);
}
export const toastErr = (e) => toast(e?.message || String(e), 'err');

// ---------------- Модалки ----------------
export function modal({ title, body, actions = [], width, onClose }) {
  const overlay = h('div.overlay');
  const close = (v) => {
    overlay.classList.add('out');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 130);
    onClose?.(v);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(null); };
  const m = h('div.modal', { style: width ? { width: `min(${width}px, calc(100vw - 40px))` } : null },
    title ? h('div.modal-head', h('div.h2', title)) : null,
    h('div.modal-body', body),
    actions.length ? h('div.modal-foot', actions.map((a) => h(`button.btn${a.primary ? '.btn-primary' : ''}${a.danger ? '.btn-danger' : ''}`, {
      onclick: async () => {
        if (a.onClick) {
          const r = await a.onClick(close);
          if (r === false) return;
        }
        close(a.value ?? null);
      },
    }, a.label))) : null);
  overlay.append(m);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  setTimeout(() => m.querySelector('input, textarea')?.focus(), 30);
  return { close, el: m };
}

export function confirmDialog(title, text, { okLabel = 'Удалить', danger = true } = {}) {
  return new Promise((resolve) => {
    modal({
      title, body: h('div.muted', text), onClose: (v) => resolve(!!v),
      actions: [{ label: 'Отмена', value: false }, { label: okLabel, primary: !danger, danger, value: true }],
    });
  });
}

export function promptDialog(title, { label = '', value = '', placeholder = '', multiline = false, okLabel = 'Готово', hint = '' } = {}) {
  return new Promise((resolve) => {
    const input = multiline
      ? h('textarea.textarea', { rows: 4, placeholder, value })
      : h('input.input', { placeholder, value });
    let result = null;
    const m = modal({
      title,
      body: h('div.field', label ? h('label', label) : null, input, hint ? h('div.hint', hint) : null),
      onClose: () => resolve(result),
      actions: [{ label: 'Отмена' }, { label: okLabel, primary: true, onClick: () => { result = input.value.trim(); } }],
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (!multiline || e.ctrlKey)) { result = input.value.trim(); m.close(true); }
    });
  });
}

// ---------------- Контекстное меню ----------------
export function menu(anchor, items) {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  const el = h('div.menu', items.map((it) => it === '-' ? h('div.msep') :
    h(`button${it.danger ? '.danger' : ''}`, { onclick: () => { close(); it.onClick(); } }, it.icon ? ic(it.icon, 16) : null, it.label)));
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const mw = el.offsetWidth, mh = el.offsetHeight;
  el.style.left = `${Math.min(r.right - mw, window.innerWidth - mw - 8) < 8 ? r.left : Math.min(r.right - mw, window.innerWidth - mw - 8)}px`;
  el.style.top = `${r.bottom + mh + 6 > window.innerHeight ? r.top - mh - 6 : r.bottom + 6}px`;
  const close = () => { el.remove(); document.removeEventListener('mousedown', out, true); };
  const out = (e) => { if (!el.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('mousedown', out, true));
  return close;
}

/** Автоувеличение textarea по содержимому */
export function autosize(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return ta;
}

export const STATUS = {
  outline: ['Содержание', 'b-outline'],
  generating: ['Генерируется', 'b-generating'],
  partial: ['Частично', 'b-partial'],
  done: ['Готова', 'b-done'],
  manual: ['Моя книга', 'b-manual'],
};
export function statusBadge(status, live) {
  const [t, c] = STATUS[status] || STATUS.manual;
  return h(`span.badge.${c}`, h(`span.dot${live || status === 'generating' ? '.pulse' : ''}`), t);
}

export const CH_TAGS = {
  recommended: 'Рекомендуется', interesting: 'Интересно', basics: 'Основа', practice: 'Практика', advanced: 'Углублённо', optional: 'Необязательно',
};
export const chTag = (t) => h(`span.tag.t-${t}`, CH_TAGS[t] || t);
