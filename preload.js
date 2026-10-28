// Безопасный мост между интерфейсом и главным процессом
const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

const channels = [
  'app:info', 'settings:get', 'settings:set', 'settings:test', 'settings:openData', 'settings:findClaude',
  'books:list', 'books:get', 'books:create', 'books:update', 'books:opened', 'books:progress', 'books:delete',
  'chapters:add', 'chapters:update', 'chapters:delete', 'chapters:reorder',
  'sections:add', 'sections:update', 'sections:delete', 'sections:reorder',
  'outline:get', 'outline:save', 'outline:history', 'outline:restore',
  'ai:outline', 'ai:regenOutline', 'ai:refineChapter', 'ai:regenMeta', 'ai:cover', 'ai:rewriteSection',
  'gen:plan', 'gen:start', 'gen:pause', 'gen:dismiss', 'gen:status',
  'media:import', 'export:pdf', 'export:md', 'shell:showItem',
];

const api = {};
for (const ch of channels) {
  const [ns, fn] = ch.split(':');
  (api[ns] ||= {})[fn] = (...args) => call(ch, ...args);
}
api.onProgress = (cb) => {
  const h = (_e, p) => cb(p);
  ipcRenderer.on('gen:progress', h);
  return () => ipcRenderer.removeListener('gen:progress', h);
};

contextBridge.exposeInMainWorld('api', api);
