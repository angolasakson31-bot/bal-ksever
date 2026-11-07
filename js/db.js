// Basit IndexedDB sarmalayıcısı. Tüm veriler telefonun içinde saklanır.
// Kişisel kayıtlar 'rastgele' veritabanında; her arkadaş grubunun kopyası ayrı bir veritabanında
// ('rastgele-g-<kod>'). İkisi hiç karışmaz.
let DB_NAME = 'rastgele';
const DB_VERSION = 3;
export const STORES = ['catches', 'spots', 'outbox', 'meta', 'trash'];
const KEYS = { outbox: 'k', meta: 'k', trash: 'k' };

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
    req.onsuccess = () => {
      const db = req.result;
      // Yeni sürüm başka sekmede açılırsa bu bağlantıyı bırak (yükseltme kilitlenmesin)
      db.onversionchange = () => { db.close(); if (dbPromise) dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { try { window.dispatchEvent(new CustomEvent('db-blocked')); } catch { /* yok */ } };
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    tx.onerror = () => reject(tx.error);
    // Depolama dolunca (QuotaExceededError) yalnız 'abort' gelir: beklemede kalmasın, hata versin
    tx.onabort = () => reject(tx.error || new DOMException('İşlem iptal edildi', 'AbortError'));
  }));
}

export const getAll = store => run(store, 'readonly', s => s.getAll());
export const get = (store, id) => run(store, 'readonly', s => s.get(id));
// silent: sunucudan gelen kaydı yazarken tekrar sunucuya gönderme
export const put = (store, value, { silent = false } = {}) => run(store, 'readwrite', s => s.put(value))
  .then(r => { if (!silent && writeHook && (store === 'spots' || store === 'catches')) writeHook(store, 'put', value); return r; });
export const remove = (store, id, { silent = false } = {}) => run(store, 'readwrite', s => s.delete(id))
  .then(r => { if (!silent && writeHook && (store === 'spots' || store === 'catches')) writeHook(store, 'delete', { id }); return r; });
// ——— Çöp kutusu: silinen mera/av 30 gün saklanır, geri alınabilir ———
const TRASH_DAYS = 30;
export const toTrash = (store, item, by = '') => item?.id
  ? put('trash', { k: `${store}:${item.id}`, store, item, by, deletedAt: Date.now() }, { silent: true }) : Promise.resolve();
export async function trashList() {
  const all = await getAll('trash');
  const old = all.filter(t => Date.now() - t.deletedAt > TRASH_DAYS * 864e5);
  for (const t of old) await remove('trash', t.k, { silent: true });
  return all.filter(t => !old.includes(t)).sort((a, b) => b.deletedAt - a.deletedAt);
}
export async function restoreTrash(k) {
  const t = await get('trash', k);
  if (!t) return null;
  await put(t.store, t.item);          // grupta: sunucuya da geri gönderilir
  await remove('trash', k, { silent: true });
  return t;
}
// Kaydı sil ama önce çöp kutusuna koy
export async function softRemove(store, id, by = '') {
  const old = await get(store, id);
  if (old) await toTrash(store, old, by);
  return remove(store, id);
}

// Başka bir veritabanındaki kayıt sayısı (ör. çıkılacak gruptaki gönderilmemiş kayıtlar)
export function countIn(name, store) {
  return new Promise(resolve => {
    const req = indexedDB.open(name);
    req.onsuccess = () => {
      const d = req.result;
      try {
        if (!d.objectStoreNames.contains(store)) { d.close(); return resolve(0); }
        const r = d.transaction(store, 'readonly').objectStore(store).count();
        r.onsuccess = () => { d.close(); resolve(r.result); };
        r.onerror = () => { d.close(); resolve(0); };
      } catch { d.close(); resolve(0); }
    };
    req.onerror = () => resolve(0);
  });
}

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
