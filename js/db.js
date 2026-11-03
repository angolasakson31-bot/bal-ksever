// Basit IndexedDB sarmalayıcısı. Tüm veriler telefonun içinde saklanır.
// Kişisel kayıtlar 'rastgele' veritabanında; her arkadaş grubunun kopyası ayrı bir veritabanında
// ('rastgele-g-<kod>'). İkisi hiç karışmaz.
let DB_NAME = 'rastgele';
const DB_VERSION = 2;
export const STORES = ['catches', 'spots', 'outbox', 'meta'];
const KEYS = { outbox: 'k', meta: 'k' };

let dbPromise;
let writeHook = null; // grup modunda kayıtları sunucuya göndermek için

// Hangi veritabanı kullanılacak (kişisel / grup)
export function use(name) {
  if (name === DB_NAME) return;
  DB_NAME = name; dbPromise = null;
}
export const current = () => DB_NAME;
export function onWrite(fn) { writeHook = fn; }

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: KEYS[name] || 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    tx.onerror = () => reject(tx.error);
  }));
}

export const getAll = store => run(store, 'readonly', s => s.getAll());
export const get = (store, id) => run(store, 'readonly', s => s.get(id));
// silent: sunucudan gelen kaydı yazarken tekrar sunucuya gönderme
export const put = (store, value, { silent = false } = {}) => run(store, 'readwrite', s => s.put(value))
  .then(r => { if (!silent && writeHook && (store === 'spots' || store === 'catches')) writeHook(store, 'put', value); return r; });
export const remove = (store, id, { silent = false } = {}) => run(store, 'readwrite', s => s.delete(id))
  .then(r => { if (!silent && writeHook && (store === 'spots' || store === 'catches')) writeHook(store, 'delete', { id }); return r; });
export function deleteDatabase(name) {
  return new Promise(resolve => { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => resolve(); });
}
export const clear = store => run(store, 'readwrite', s => s.clear());

export function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// iOS/Safari verileri silmesin diye kalıcı depolama iste
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* desteklenmiyor */ }
  return false;
}
