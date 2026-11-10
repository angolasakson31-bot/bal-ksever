// Kayıt doğrulama: gruptan, yedekten ya da eski sürümden gelen kayıtlar ekrana basılmadan önce
// beklenen tiplere çevrilir. Böylece bozuk ya da kötü niyetli bir kayıt uygulamayı çökertemez,
// sayfaya kod sokamaz (sayı beklenen yere metin, adres beklenen yere komut gelemez).
const str = (v, n) => (v == null ? '' : String(v)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').slice(0, n);
const num = (v, min = -Infinity, max = Infinity) => { const x = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(x) && x >= min && x <= max ? x : null; };
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
// Kimlik: harf, rakam, boşluk ve . _ : - (tırnak, < > gibi işaretler yok; sayfaya güvenle yazılabilir)
export const ID_RE = /^[\p{L}\p{N} ._:-]{1,80}$/u;
const stamp = v => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v.slice(0, 40) : undefined);
// Fotoğraf adresi: yalnız Cloudinary (https) — başka adres izleme/saldırı için kullanılamasın
const DEV = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname); // yerel test
export const safePhotoUrl = u => (DEV && typeof u === 'string' && /^http:\/\/localhost:\d+\/[\w./-]+$/.test(u) ? u : safePhotoUrl0(u));
const safePhotoUrl0 = u => (typeof u === 'string' && /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/[A-Za-z0-9_.,\/%:-]+$/.test(u) && u.length < 500 ? u : null);
const isBlob = b => typeof Blob !== 'undefined' && b instanceof Blob;

function common(d, out) {
  for (const k of ['by', 'editedBy']) if (d[k] != null) out[k] = str(d[k], 30);
  for (const k of ['createdAt', 'updatedAt']) { const s = stamp(d[k]); if (s !== undefined) out[k] = s; }
  return out;
}

export function cleanSpot(d) {
  if (!d || typeof d !== 'object' || !ID_RE.test(String(d.id ?? ''))) return null;
  const lat = num(d.lat, -90, 90), lng = num(d.lng, -180, 180);
  if (lat == null || lng == null) return null;
  const out = { id: String(d.id), name: str(d.name, 60).trim() || 'Mera', lat, lng, type: str(d.type, 30) || 'Diğer',
    water: oneOf(d.water, ['auto', 'sea', 'lake', 'river'], 'auto'), notes: str(d.notes, 2000) };
  const sm = d.shoreManual;
  out.shoreManual = sm === 'none' || sm === 'auto' ? sm : num(sm, 0, 360) != null ? String(num(sm, 0, 360)) : 'auto';
  out.lakeSize = oneOf(d.lakeSize, ['auto', 'small', 'medium', 'large'], 'auto');
  if (d.shore && typeof d.shore === 'object') out.shore = { bearing: num(d.shore.bearing, 0, 360), ...(d.shore.open ? { open: true } : {}) };
  return common(d, out);
}

export function cleanCatch(d) {
  if (!d || typeof d !== 'object' || !ID_RE.test(String(d.id ?? ''))) return null;
  const date = typeof d.date === 'string' && !Number.isNaN(Date.parse(d.date)) ? new Date(d.date).toISOString() : new Date().toISOString();
  const out = { id: String(d.id), species: str(d.species, 60).trim() || 'Balık', length: num(d.length, 0, 1000), weight: num(d.weight, 0, 1e6),
    count: Math.max(1, Math.min(9999, Math.round(num(d.count) ?? 1))), date, bait: str(d.bait, 60), method: str(d.method, 60),
    spotId: d.spotId != null && ID_RE.test(String(d.spotId)) ? String(d.spotId) : null, lat: num(d.lat, -90, 90), lng: num(d.lng, -180, 180),
    released: !!d.released, notes: str(d.notes, 2000) };
  if (out.lat == null || out.lng == null) { out.lat = null; out.lng = null; }
  if (Array.isArray(d.photos)) {
    out.photos = d.photos.slice(0, 6).map((p, i) => p && typeof p === 'object' ? {
      id: ID_RE.test(String(p.id ?? '')) ? String(p.id).slice(0, 40) : 'p' + i,
      ...(isBlob(p.blob) ? { blob: p.blob } : {}), ...(safePhotoUrl(p.url) ? { url: safePhotoUrl(p.url) } : {}), ...(p.failed ? { failed: true } : {}),
    } : null).filter(p => p && (p.blob || p.url));
  }
  out.photo = isBlob(d.photo) ? d.photo : (out.photos?.[0]?.blob || null);
  const pu = safePhotoUrl(d.photoUrl) || out.photos?.find(p => p.url)?.url || null;
  if (pu) out.photoUrl = pu;
  return common(d, out);
}
export const cleanDoc = (store, d) => (store === 'spots' ? cleanSpot(d) : store === 'catches' ? cleanCatch(d) : null);
