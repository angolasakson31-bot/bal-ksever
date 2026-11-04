// Arkadaş grubu: ortak meralar ve avlar.
// Grup linkiyle (…/?grup=KOD) açılınca uygulama grubun kendi veritabanına geçer.
// Telefonda yapılan her değişiklik önce telefona yazılır, sonra sıraya (outbox) girip sunucuya gönderilir;
// sunucudaki yenilikler düzenli aralıklarla çekilir. İnternet yokken de çalışır.
import * as db from './db.js';
import { API_URL, CLOUDINARY } from './config.js';

const ls = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* yok */ } };

export const apiUrl = () => (ls('apiUrl') || API_URL).replace(/\/+$/, '');
const cloud = () => ({ cloud: ls('cloudName') || CLOUDINARY.cloud, preset: ls('cloudPreset') || CLOUDINARY.preset });
export const groupReady = () => !!apiUrl();
export const photoReady = () => { const c = cloud(); return !!(c.cloud && c.preset); };

export const group = { code: null, name: null, online: false, pending: 0, lastSync: 0 };
// İsim her grup için ayrı saklanır (bir grupta 'Ahmet', diğerinde 'Kaptan' olabilir)
function groupNames() { try { return JSON.parse(ls('groupNames') || '{}'); } catch { return {}; } }
export const myName = (code = group.code) => (code ? groupNames()[code] : '') || '';
export const lastName = () => ls('myName') || ''; // son kullanılan isim (yeni grupta öneri)
export function setMyName(n, code = group.code) {
  const v = n.trim().slice(0, 30);
  if (!v) return;
  lsSet('myName', v);
  if (code) { const m = groupNames(); m[code] = v; lsSet('groupNames', JSON.stringify(m)); }
}

const CODE_RE = /^[A-Za-z0-9]{16,40}$/;
export const codeFromUrl = () => { const c = new URLSearchParams(location.search).get('grup'); return c && CODE_RE.test(c) ? c : null; };
export const groupLink = code => `${location.origin}${location.pathname}?grup=${code}`;

// Katılınan gruplar (bu telefonda)
export function joinedGroups() { try { return JSON.parse(ls('groups') || '[]'); } catch { return []; } }
function rememberGroup(code, name) {
  const list = joinedGroups().filter(g => g.code !== code);
  list.unshift({ code, name: name || 'Grup' });
  lsSet('groups', JSON.stringify(list.slice(0, 10)));
}
export async function leaveGroup(code) {
  lsSet('groups', JSON.stringify(joinedGroups().filter(g => g.code !== code)));
  const m = groupNames(); delete m[code]; lsSet('groupNames', JSON.stringify(m));
  await db.deleteDatabase('rastgele-g-' + code);
}

async function api(path, opts = {}) {
  const res = await fetch(apiUrl() + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Sunucu hatası (${res.status})`), { status: res.status });
  return body;
}

// Grup adı (katılırken isim sorulmadan önce; sunucu uyuyorsa en fazla 4 sn beklenir)
export async function groupInfo(code) {
  try { return await Promise.race([api(`/api/g/${code}`), new Promise(r => setTimeout(() => r(null), 4000))]); } catch { return null; }
}
export async function createGroup(name, by) {
  const r = await api('/api/groups', { method: 'POST', body: JSON.stringify({ name, by }) });
  rememberGroup(r.code, r.name);
  if (by) setMyName(by, r.code);
  return r;
}

// —— Gruba gir ——
let listener = () => {};
let timer = null;
export async function enterGroup(code, onChange) {
  listener = onChange || (() => {});
  group.code = code;
  group.name = joinedGroups().find(g => g.code === code)?.name || 'Grup';
  db.use('rastgele-g-' + code);
  db.onWrite(queueChange);
  group.pending = (await db.getAll('outbox')).length;
  // Grup adını sunucudan al (sunucu uyuyorsa sonra gelir)
  api(`/api/g/${code}`).then(info => { group.name = info.name; group.online = true; rememberGroup(code, info.name); listener({ info: true }); })
    .catch(e => { if (e.status === 404) listener({ error: e.message }); });
  rememberGroup(code, group.name);
  sync();
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden) sync(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  window.addEventListener('online', () => sync());
}

// Telefonda yapılan değişikliği sıraya koy
async function queueChange(store, op, value) {
  const item = { k: `${store}:${value.id}`, store, id: value.id, op, at: Date.now() };
  await db.put('outbox', item);
  group.pending = (await db.getAll('outbox')).length;
  listener({ queued: true });
  sync();
}

// Cloudinary'ye fotoğraf yükle (imzasız ayar ile)
async function uploadPhoto(blob, id) {
  const c = cloud();
  const fd = new FormData();
  fd.append('file', blob, `${id}.jpg`);
  fd.append('upload_preset', c.preset);
  fd.append('folder', `rastgele/${group.code}`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/image/upload`, { method: 'POST', body: fd });
  const j = await res.json();
  if (!res.ok || !j.secure_url) throw new Error(j.error?.message || 'Fotoğraf yüklenemedi');
  return j.secure_url.replace('/upload/', '/upload/c_limit,w_1280,q_auto,f_auto/');
}

// Sıradakileri gönder
async function flush() {
  const queue = (await db.getAll('outbox')).sort((a, b) => a.at - b.at);
  for (const q of queue) {
    if (q.op === 'delete') {
      await api(`/api/g/${group.code}/${q.store}/${encodeURIComponent(q.id)}?by=${encodeURIComponent(myName())}`, { method: 'DELETE' });
    } else {
      let doc = await db.get(q.store, q.id);
      if (!doc) { await db.remove('outbox', q.k, { silent: true }); continue; }
      if (q.store === 'catches' && doc.photo instanceof Blob && !doc.photoUrl && photoReady()) {
        const url = await uploadPhoto(doc.photo, doc.id);
        doc = { ...doc, photoUrl: url };
        await db.put('catches', doc, { silent: true });
      }
      const { photo, ...rest } = doc;
      await api(`/api/g/${group.code}/${q.store}/${encodeURIComponent(q.id)}`, { method: 'PUT', body: JSON.stringify({ doc: rest, by: myName() }) });
    }
    // Bu arada aynı kayıt yeniden değiştiyse sıradan silme
    const now = await db.get('outbox', q.k);
    if (now && now.at === q.at) await db.remove('outbox', q.k, { silent: true });
  }
  group.pending = (await db.getAll('outbox')).length;
}

// Sunucudaki yenilikleri al
async function pull() {
  const meta = (await db.get('meta', 'since')) || { k: 'since', v: 0 };
  const first = !meta.v;
  const pendingKeys = new Set((await db.getAll('outbox')).map(q => q.k));
  const fresh = [];
  let since = meta.v, more = true, changed = false;
  while (more) {
    const r = await api(`/api/g/${group.code}/changes?since=${since}`);
    for (const it of r.items) {
      if (pendingKeys.has(`${it.store}:${it.id}`)) continue; // telefondaki yeni hali gönderilmeyi bekliyor
      if (it.deleted) { if (await db.get(it.store, it.id)) { changed = true; await db.remove(it.store, it.id, { silent: true }); } continue; }
      const local = await db.get(it.store, it.id);
      if (local && local.updatedAt === it.updatedAt) continue; // zaten güncel
      const doc = { ...it.doc, by: it.createdBy || it.by, editedBy: it.by, updatedAt: it.updatedAt };
      if (local?.photo && doc.photoUrl === local.photoUrl) doc.photo = local.photo; // fotoğraf dosyası telefonda dursun
      await db.put(it.store, doc, { silent: true });
      changed = true;
      if (!first && it.by && it.by !== myName()) fresh.push({ ...it, doc, isNew: !local });
    }
    since = r.now; more = r.more;
  }
  await db.put('meta', { k: 'since', v: since }, { silent: true });
  return { changed, fresh };
}

let syncing = null;
export function sync() {
  if (!group.code || !groupReady()) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      await flush();
      const { changed, fresh } = await pull();
      group.online = true; group.lastSync = Date.now();
      listener({ changed, fresh });
    } catch (e) {
      group.online = false;
      listener({ offline: true, error: e.status === 404 ? e.message : null });
    } finally { syncing = null; }
  })();
  return syncing;
}
