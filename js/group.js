// Arkadaş grubu: ortak meralar ve avlar.
// Grup linkiyle (…/?grup=KOD) açılınca uygulama grubun kendi veritabanına geçer.
// Telefonda yapılan her değişiklik önce telefona yazılır, sonra sıraya (outbox) girip sunucuya gönderilir;
// sunucudaki yenilikler düzenli aralıklarla çekilir. İnternet yokken de çalışır.
import * as db from './db.js';
import { API_URL, CLOUDINARY } from './config.js';
import { cleanDoc, safePhotoUrl } from './clean.js';

const ls = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* yok */ } };

// Sunucu/Cloudinary adresi yalnız yerel testte değiştirilebilir (yayında telefondaki bir ayarla başka sunucuya yönlendirilemesin)
const DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const apiUrl = () => ((DEV && ls('apiUrl')) || API_URL).replace(/\/+$/, '');
const cloud = () => ({ cloud: (DEV && ls('cloudName')) || CLOUDINARY.cloud, preset: (DEV && ls('cloudPreset')) || CLOUDINARY.preset });
export const groupReady = () => !!apiUrl();
export const photoReady = () => { const c = cloud(); return !!(c.cloud && c.preset); };

export const group = { code: null, name: null, online: false, pending: 0, failed: 0, lastSync: 0 };
// İsim her grup için ayrı saklanır (bir grupta 'Ahmet', diğerinde 'Kaptan' olabilir)
function groupNames() { try { return JSON.parse(ls('groupNames') || '{}'); } catch { return {}; } }
export const myName = (code = group.code) => (code ? groupNames()[code] : '') || '';
export const lastName = () => ls('myName') || ''; // son kullanılan isim (yeni grupta öneri)
export function setMyName(n, code = group.code) {
  const v = n.trim().slice(0, 30);
  if (!v) return;
  lsSet('myName', v);
  if (code) { const m = groupNames(); m[code] = v; lsSet('groupNames', JSON.stringify(m)); }
  if (code && code === group.code) { lastHello = 0; hello(true); }
}

const CODE_RE = /^[A-Za-z0-9]{16,40}$/;
const ss = { get: () => { try { return sessionStorage.getItem('grup'); } catch { return null; } }, set: v => { try { v ? sessionStorage.setItem('grup', v) : sessionStorage.removeItem('grup'); } catch { /* yok */ } } };
// Grup kodu linkten alınır, sonra adres çubuğundan silinir (geçmişte, ekran görüntüsünde, paylaşımda görünmesin);
// sayfa yenilenince aynı sekmede grup açık kalsın diye sekme belleğinde tutulur.
export const codeFromUrl = () => {
  const c = new URLSearchParams(location.search).get('grup') || ss.get();
  return c && CODE_RE.test(c) ? c : null;
};
export function hideCodeInUrl(code) {
  ss.set(code);
  try { if (new URLSearchParams(location.search).has('grup')) history.replaceState(null, '', location.pathname); } catch { /* yok */ }
}
export const exitGroupTab = () => ss.set(null);
export const groupLink = code => `${location.origin}${location.pathname}?grup=${code}`;

// Katılınan gruplar (bu telefonda)
export function joinedGroups() { try { return JSON.parse(ls('groups') || '[]'); } catch { return []; } }
function rememberGroup(code, name) {
  const list = joinedGroups().filter(g => g.code !== code);
  list.unshift({ code, name: name || 'Grup' });
  lsSet('groups', JSON.stringify(list.slice(0, 10)));
}
// Bu grupta henüz sunucuya gönderilmemiş kayıt sayısı (gruptan çıkmadan önce uyarmak için)
export async function unsentCount(code) {
  if (code === group.code) return (await db.getAll('outbox')).length;
  return db.countIn('rastgele-g-' + code, 'outbox');
}
export async function leaveGroup(code) {
  lsSet('groups', JSON.stringify(joinedGroups().filter(g => g.code !== code)));
  const m = groupNames(); delete m[code]; lsSet('groupNames', JSON.stringify(m));
  await db.deleteDatabase('rastgele-g-' + code);
}

async function api(path, opts = {}) {
  // 30 sn'de cevap gelmezse vazgeç (uyuyan sunucu ~1 dk'da uyanır; sonraki denemede gelir)
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
  let res;
  try { res = await fetch(apiUrl() + path, { ...opts, signal: ctl.signal, headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } }); }
  catch { throw new Error('Grup sunucusuna ulaşılamadı (internet yok ya da sunucu uyanıyor)'); }
  finally { clearTimeout(to); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Sunucu hatası (${res.status})`), { status: res.status });
  return body;
}

// Bu telefonun kimliği (üye listesinde "sen" işareti ve isim değişince aynı kişi kalsın diye)
export function deviceId() {
  let id = ls('deviceId');
  if (!id || !/^[A-Za-z0-9-]{8,40}$/.test(id)) { id = (crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9-]/g, ''); lsSet('deviceId', id); }
  return id;
}
// "Buradayım": üye listesinde görünmek ve son görülme için
let lastHello = 0;
export async function hello(force = false) {
  if (!group.code || !myName() || (!force && Date.now() - lastHello < 5 * 60e3)) return;
  lastHello = Date.now();
  try { await api(`/api/g/${group.code}/members`, { method: 'POST', body: JSON.stringify({ id: deviceId(), name: myName() }) }); } catch { lastHello = 0; }
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
  hideCodeInUrl(code);
  group.name = joinedGroups().find(g => g.code === code)?.name || 'Grup';
  db.use('rastgele-g-' + code);
  db.onWrite(queueChange);
  await countQueue();
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
  await countQueue();
  listener({ queued: true });
  sync();
}

const folders = new Map();
async function folderFor(code) {
  if (!folders.has(code)) {
    let f = 'g';
    try { f = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('rastgele:' + code)))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(''); } catch { /* eski tarayıcı */ }
    folders.set(code, f);
  }
  return folders.get(code);
}
// Cloudinary'ye fotoğraf yükle (imzasız ayar ile)
async function uploadPhoto(blob, id) {
  const c = cloud();
  const fd = new FormData();
  fd.append('file', blob, `${id}.jpg`);
  fd.append('upload_preset', c.preset);
  fd.append('folder', `rastgele/${await folderFor(group.code)}`); // grup kodu fotoğraf adresinde görünmesin
  const res = await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/image/upload`, { method: 'POST', body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.secure_url) throw Object.assign(new Error(j.error?.message || 'Fotoğraf yüklenemedi'), { status: res.status });
  const url = safePhotoUrl(j.secure_url.replace('/upload/', '/upload/c_limit,w_1280,q_auto,f_auto/'));
  if (!url) throw Object.assign(new Error('Fotoğraf adresi geçersiz'), { status: 400 });
  return url;
}

// Kalıcı hata: tekrar denemenin anlamı yok (ör. kayıt çok büyük, geçersiz). Ağ hatası / sunucu uyuyor ise tekrar denenir.
const permanent = e => e?.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;
const photoList = d => (Array.isArray(d.photos) && d.photos.length ? d.photos : (d.photo || d.photoUrl ? [{ id: 'p0', blob: d.photo || null, url: d.photoUrl || null }] : []));

// Yüklenen fotoğrafın adresini kaydın EN GÜNCEL haline yaz (yükleme sürerken yapılan düzenleme kaybolmasın)
async function setPhoto(id, pid, patch) {
  const cur = await db.get('catches', id);
  if (!cur) return;
  const photos = photoList(cur).map(p => (p.id === pid ? { ...p, ...patch } : p));
  await db.put('catches', { ...cur, photos, photoUrl: photos.find(p => p.url)?.url || null }, { silent: true });
}

// Tek kaydı gönder
async function sendOne(q) {
  if (q.op === 'delete') {
    await api(`/api/g/${group.code}/${q.store}/${encodeURIComponent(q.id)}?by=${encodeURIComponent(myName())}`, { method: 'DELETE' });
    return;
  }
  let doc = await db.get(q.store, q.id);
  if (!doc) return;
  if (q.store === 'catches' && photoReady()) {
    // Fotoğrafları sırayla yükle; her başarılı yükleme hemen kaydedilir (yarıda kalırsa baştan yüklenmez)
    for (const p of photoList(doc)) {
      if (!(p.blob instanceof Blob) || p.url || p.failed) continue;
      try { await setPhoto(doc.id, p.id, { url: await uploadPhoto(p.blob, `${doc.id}-${p.id}`) }); }
      catch (e) { if (permanent(e)) await setPhoto(doc.id, p.id, { failed: true }); else throw e; }
    }
    doc = await db.get(q.store, q.id);
    if (!doc) return;
  }
  const { photo, ...rest0 } = doc;
  // Sunucuya fotoğraf dosyası değil, yalnız adresleri gider
  const rest = Array.isArray(rest0.photos) ? { ...rest0, photos: rest0.photos.map(({ blob, failed, ...p }) => p).filter(p => p.url) } : rest0;
  await api(`/api/g/${group.code}/${q.store}/${encodeURIComponent(q.id)}`, { method: 'PUT', body: JSON.stringify({ doc: rest, by: myName() }) });
}

// Sıradakileri gönder. Tek bir hatalı kayıt sırayı kilitlemez: kalıcı hatada kenara ayrılır ("gönderilemedi"),
// ağ hatasında durulur (sonra tekrar denenir).
async function flush() {
  const queue = (await db.getAll('outbox')).filter(q => !q.failed).sort((a, b) => a.at - b.at);
  let netErr = null;
  for (const q of queue) {
    try { await sendOne(q); }
    catch (e) {
      if (permanent(e)) { await db.put('outbox', { ...q, failed: true, error: e.message || String(e) }, { silent: true }); continue; }
      netErr = e; break;
    }
    // Bu arada aynı kayıt yeniden değiştiyse sıradan silme
    const now = await db.get('outbox', q.k);
    if (now && now.at === q.at) await db.remove('outbox', q.k, { silent: true });
  }
  await countQueue();
  if (netErr) throw netErr;
}
async function countQueue() {
  const all = await db.getAll('outbox');
  group.failed = all.filter(q => q.failed).length;
  group.pending = all.length - group.failed;
}
// Gönderilemeyen kayıtları tekrar dene (ör. not kısaltıldıktan sonra)
export async function retryFailed() {
  for (const q of await db.getAll('outbox')) if (q.failed) await db.put('outbox', { ...q, failed: false, error: null }, { silent: true });
  await countQueue();
  return sync();
}
export const failedItems = async () => (await db.getAll('outbox')).filter(q => q.failed);

// Sunucudaki yenilikleri al
const STORE_OK = new Set(['spots', 'catches']);
async function pull() {
  const meta = (await db.get('meta', 'since')) || { k: 'since', v: 0 };
  const first = !meta.v;
  const pendingKeys = new Set((await db.getAll('outbox')).filter(q => !q.failed).map(q => q.k));
  const fresh = [];
  let since = meta.v, after = '', more = true, changed = false;
  while (more) {
    const r = await api(`/api/g/${group.code}/changes?since=${since}${after ? `&after=${encodeURIComponent(after)}` : ''}`);
    for (const it of r.items) {
      if (!STORE_OK.has(it.store) || !it.id) continue;
      if (pendingKeys.has(`${it.store}:${it.id}`)) continue; // telefondaki yeni hali gönderilmeyi bekliyor
      if (it.deleted) {
        const old = await db.get(it.store, it.id);
        if (old) { changed = true; await db.toTrash(it.store, old, it.by); await db.remove(it.store, it.id, { silent: true }); }
        continue;
      }
      const local = await db.get(it.store, it.id);
      if (local && local.updatedAt === it.updatedAt) continue; // zaten güncel
      // Sunucudan gelen kayıt beklenen tiplere çevrilir; bozuksa atlanır
      const doc = cleanDoc(it.store, { ...it.doc, id: it.id, by: it.createdBy || it.by, editedBy: it.by, updatedAt: it.updatedAt });
      if (!doc) continue;
      if (local?.photo && doc.photoUrl === local.photoUrl) doc.photo = local.photo; // fotoğraf dosyası telefonda dursun
      if (Array.isArray(doc.photos) && Array.isArray(local?.photos)) {
        const mine = new Map(local.photos.filter(p => p.blob).map(p => [p.id, p]));
        doc.photos = doc.photos.map(p => (mine.get(p.id)?.url === p.url ? { ...p, blob: mine.get(p.id).blob } : p));
      }
      await db.put(it.store, doc, { silent: true });
      changed = true;
      if (!first && it.by && it.by !== myName()) fresh.push({ ...it, doc, isNew: !local });
    }
    since = r.now; after = r.after || ''; more = r.more;
  }
  await db.put('meta', { k: 'since', v: since }, { silent: true });
  return { changed, fresh };
}

let syncing = null, again = false;
export function sync() {
  if (!group.code || !groupReady()) return Promise.resolve();
  if (syncing) { again = true; return syncing; } // bu sırada gelen değişiklik bittikten hemen sonra gönderilir
  syncing = (async () => {
    const failedBefore = group.failed;
    try {
      // Gönderme hatası, yenilikleri almayı engellemesin
      let sendErr = null;
      try { await flush(); } catch (e) { sendErr = e; }
      const { changed, fresh } = await pull();
      group.online = true; group.lastSync = Date.now();
      hello();
      listener({ changed, fresh, failedNew: group.failed > failedBefore, sendErr: !!sendErr });
    } catch (e) {
      group.online = false;
      listener({ offline: true, error: e.status === 404 ? e.message : null });
    } finally {
      syncing = null;
      if (again) { again = false; setTimeout(sync, 0); }
    }
  })();
  return syncing;
}
