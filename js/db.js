// Basit IndexedDB sarmalayıcısı. Tüm veriler telefonun içinde saklanır.
const DB_NAME = 'rastgele';
const DB_VERSION = 1;
export const STORES = ['catches', 'spots'];

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
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
export const put = (store, value) => run(store, 'readwrite', s => s.put(value));
export const remove = (store, id) => run(store, 'readwrite', s => s.delete(id));
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
