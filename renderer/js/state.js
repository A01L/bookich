// Глобальное состояние и навигация
export const state = {
  info: { mediaUrl: '', maxPages: 200 },
  settings: {},
  jobs: new Map(), // bookId -> snapshot
  route: { name: 'library', params: {} },
};

const listeners = new Set();
export const onJobs = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const emitJobs = (p) => listeners.forEach((fn) => { try { fn(p); } catch (e) { console.error(e); } });

let router = null;
export const setRouter = (fn) => { router = fn; };
export const go = (name, params = {}) => router(name, params);
