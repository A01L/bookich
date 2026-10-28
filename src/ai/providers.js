// Провайдеры ИИ: локальный Claude CLI и OpenAI API (или совместимый endpoint).
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

class AIError extends Error {
  constructor(msg, { retry = true } = {}) { super(msg); this.retry = retry; }
}

// ---------------- Поиск Claude CLI ----------------
const { execFileSync } = require('child_process');
const isWin = process.platform === 'win32';

function claudeCandidates() {
  const home = os.homedir();
  if (!isWin) return [path.join(home, '.local', 'bin', 'claude'), path.join(home, '.claude', 'local', 'claude'), '/usr/local/bin/claude', '/opt/homebrew/bin/claude'];
  const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  return [
    path.join(home, '.local', 'bin', 'claude.exe'),
    path.join(appdata, 'npm', 'claude.cmd'),
    path.join(home, '.claude', 'local', 'claude.cmd'),
    path.join(home, '.claude', 'local', 'claude.exe'),
    path.join(home, '.claude', 'local', 'node_modules', '.bin', 'claude.cmd'),
    path.join(local, 'Programs', 'claude', 'claude.exe'),
    path.join(local, 'Programs', 'claude-code', 'claude.exe'),
    path.join(local, 'pnpm', 'claude.cmd'),
    path.join(home, 'scoop', 'shims', 'claude.exe'),
    path.join(appdata, 'nvm', 'current', 'claude.cmd'),
    'C:\\Program Files\\nodejs\\claude.cmd',
  ];
}

/** Ищет установленный Claude CLI: PATH (where/which), затем стандартные папки. */
function findClaude() {
  try {
    const out = execFileSync(isWin ? 'where.exe' : 'which', ['claude'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const pick = lines.find((l) => /\.(exe|cmd)$/i.test(l)) || lines[0];
    if (pick && fs.existsSync(pick)) return pick;
  } catch { /* нет в PATH */ }
  const direct = claudeCandidates().find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (direct) return direct;
  // Claude Code, встроенный в десктопное приложение Claude: %APPDATA%\Claude\claude-code\<версия>\claude.exe
  if (isWin) {
    const roots = [path.join(process.env.APPDATA || '', 'Claude', 'claude-code'), path.join(process.env.LOCALAPPDATA || '', 'AnthropicClaude')];
    for (const root of roots) {
      try {
        const vers = fs.readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        for (const v of vers) {
          for (const rel of ['claude.exe', path.join('resources', 'claude.exe')]) {
            const p = path.join(root, v, rel);
            if (fs.existsSync(p)) return p;
          }
        }
      } catch { /* нет папки */ }
    }
  }
  return null;
}

/** Вывод консоли Windows часто в cp866 — декодируем корректно. */
function decodeOut(buf) {
  const utf = buf.toString('utf8');
  if (!isWin || !utf.includes('\uFFFD')) return utf;
  for (const enc of ['ibm866', 'windows-1251']) {
    try { return new TextDecoder(enc).decode(buf); } catch { /* */ }
  }
  return utf;
}

// ---------------- Claude CLI ----------------
function claudeCli({ system, prompt }, cfg, signal) {
  return new Promise((resolve, reject) => {
    let cmd = (cfg.claudePath || 'claude').trim().replace(/^"|"$/g, '');
    if (cmd === 'claude' || cmd === 'claude.cmd' || cmd === 'claude.exe') cmd = findClaude() || cmd;
    const args = ['-p', '--output-format', 'json'];
    if (cfg.claudeModel) args.push('--model', cfg.claudeModel.trim());
    const cwd = path.join(os.tmpdir(), 'bookich-cli');
    fs.mkdirSync(cwd, { recursive: true });
    // .exe запускаем напрямую; .cmd/.bat и «голую» команду — через shell
    const needShell = isWin && !/\.exe$/i.test(cmd);
    const quoted = needShell && /\s/.test(cmd) ? `"${cmd}"` : cmd;
    let child;
    try {
      child = spawn(quoted, args, { cwd, shell: needShell, windowsHide: true, env: { ...process.env } });
    } catch (e) {
      return reject(new AIError(`Не удалось запустить Claude CLI: ${e.message}`, { retry: false }));
    }
    const outB = [], errB = [];
    const timeoutMs = (cfg.timeoutSec || 600) * 1000;
    const timer = setTimeout(() => { child.kill(); reject(new AIError('Claude CLI: превышено время ожидания')); }, timeoutMs);
    const onAbort = () => { child.kill(); reject(new AIError('Отменено', { retry: false })); };
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (d) => outB.push(d));
    child.stderr.on('data', (d) => errB.push(d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new AIError(`Claude CLI не найден («${cmd}»). Установите Claude Code или укажите путь в настройках. ${e.message}`, { retry: false }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) return;
      const text = decodeOut(Buffer.concat(outB)).trim();
      const err = decodeOut(Buffer.concat(errB)).trim();
      let data = null;
      try { data = JSON.parse(text); } catch { /* текстовый вывод */ }
      if (data && typeof data === 'object') {
        if (data.is_error || data.subtype === 'error') return reject(new AIError(`Claude CLI: ${data.result || data.error || 'ошибка'}`));
        return resolve(String(data.result ?? ''));
      }
      if (code !== 0) {
        const msg = (err || text || `код ${code}`).slice(0, 600);
        const notFound = /not recognized|не является|не найден|not found|ENOENT|cannot find/i.test(msg) || code === 9009;
        return reject(new AIError(notFound
          ? 'Claude CLI не найден. Установите Claude Code (в PowerShell: irm https://claude.ai/install.ps1 | iex), выполните «claude» один раз для входа, затем нажмите «Найти автоматически» или укажите полный путь к claude.exe / claude.cmd.'
          : `Claude CLI: ${msg}`, { retry: !notFound }));
      }
      resolve(text);
    });
    const full = (system ? `${system}\n\n---\n\n` : '') + prompt;
    child.stdin.on('error', () => {});
    child.stdin.end(full, 'utf8');
  });
}

// ---------------- OpenAI ----------------
async function openaiChat({ system, prompt, json }, cfg, signal) {
  if (!cfg.openaiKey) throw new AIError('Не указан OpenAI API key (Настройки → Провайдер ИИ)', { retry: false });
  const base = (cfg.openaiBase || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const body = {
    model: cfg.openaiModel || 'gpt-4.1',
    messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
  };
  if (json) body.response_format = { type: 'json_object' };
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.openaiKey}` },
    body: JSON.stringify(body),
    signal,
  }).catch((e) => { throw new AIError(signal?.aborted ? 'Отменено' : `Сеть: ${e.message}`, { retry: !signal?.aborted }); });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    throw new AIError(`OpenAI ${res.status}: ${msg}`, { retry: res.status === 429 || res.status >= 500 });
  }
  return String(data.choices?.[0]?.message?.content ?? '');
}

async function openaiImage({ prompt, size = 'portrait' }, cfg, signal) {
  if (!cfg.openaiKey) throw new AIError('Для генерации изображений нужен OpenAI API key', { retry: false });
  const base = (cfg.openaiBase || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = cfg.openaiImageModel || 'gpt-image-1';
  const isDalle = model.startsWith('dall-e');
  const sizes = isDalle
    ? { portrait: '1024x1792', landscape: '1792x1024', square: '1024x1024' }
    : { portrait: '1024x1536', landscape: '1536x1024', square: '1024x1024' };
  const body = { model, prompt, n: 1, size: sizes[size] || sizes.portrait };
  if (isDalle) body.response_format = 'b64_json';
  else body.quality = cfg.imageQuality || 'medium';
  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.openaiKey}` },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError(`OpenAI Images ${res.status}: ${data?.error?.message || res.statusText}`, { retry: res.status >= 500 });
  const item = data.data?.[0] || {};
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item.url) {
    const r = await fetch(item.url, { signal });
    return Buffer.from(await r.arrayBuffer());
  }
  throw new AIError('OpenAI Images: пустой ответ');
}

// ---------------- Тестовый провайдер (BOOKICH_MOCK=1) ----------------
const mock = require('./mock');

// ---------------- Фасад ----------------
async function complete(req, cfg, signal) {
  const provider = process.env.BOOKICH_MOCK ? 'mock' : cfg.provider || 'claude';
  if (provider === 'mock') return mock.complete(req, signal);
  if (provider === 'openai') return openaiChat(req, cfg, signal);
  return claudeCli(req, cfg, signal);
}

async function withRetry(fn, { tries = 3, onRetry } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (e.retry === false || i === tries - 1) break;
      onRetry?.(e, i + 1);
      await new Promise((r) => setTimeout(r, 1500 * (i + 1) ** 2));
    }
  }
  throw last;
}

/** Достаёт JSON-объект из ответа модели (с учётом ```json и лишнего текста). */
function extractJson(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a === -1 || b === -1) throw new AIError('Модель вернула ответ не в формате JSON');
  const raw = t.slice(a, b + 1);
  try { return JSON.parse(raw); } catch {
    // мягкий ремонт: висячие запятые
    try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')); } catch (e) { throw new AIError(`Не удалось разобрать JSON: ${e.message}`); }
  }
}

module.exports = { complete, openaiImage, withRetry, extractJson, AIError, findClaude };
