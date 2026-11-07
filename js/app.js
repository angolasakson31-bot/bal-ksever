import * as db from './db.js';
import { SPECIES, BAITS, METHODS, CHECKLIST, findSpecies } from './data.js';
import { getConditions, windName, arrow, weatherText, weatherIcon, weatherWord, TTL, detectShore, detectWater, cachedWater, prefetchConditions, condKey, netStatus, getAirDaily, prefetchAirDaily } from './weather.js';
import { scoreHours, windRelation, hourAt, moonPhase, solunar, scoreClass, scoreColor, scoreLabel, scoreShort, WATER_TYPES, LAKE_SIZES, lakeSizeFor, waterModel } from './fishscore.js';
import { speciesScores, adviceText, moonTimes } from './species-model.js';
import { rowAt, slots, tripSummary, roundQ } from './timeline.js';
import { renderKnots, renderRigs } from './guide.js';
import * as grp from './group.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' });
const fmtTime = d => new Date(d).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const DEFAULT_PLACE = { name: 'İstanbul – Boğaz', lat: 41.04, lng: 29.03 };

const state = { catches: [], spots: [], tab: 'catches', photoUrls: new Map() };

// ————————————————— Genel yardımcılar —————————————————
function toast(msg, ms = 2500) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

// Bir avın fotoğrafları: [{ id, blob?, url? }] (blob: telefonda, url: grupta internette)
// Eski kayıtlarda tek fotoğraf (photo / photoUrl) vardı; listenin ilk fotoğrafı sayılır.
const MAX_PHOTOS = 6;
function catchPhotos(c) {
  if (Array.isArray(c?.photos) && c.photos.length) return c.photos;
  if (c?.photo || c?.photoUrl) return [{ id: 'p0', blob: c.photo || null, url: c.photoUrl || null }];
  return [];
}
function photoSrc(c, p) {
  if (!p.blob) return p.url || null;
  const k = `${c.id}:${p.id}`;
  if (!state.photoUrls.has(k)) state.photoUrls.set(k, URL.createObjectURL(p.blob));
  return state.photoUrls.get(k);
}
const photoUrl = c => { const p = catchPhotos(c)[0]; return p ? photoSrc(c, p) : null; };
// Küçük resim: dokununca büyük açılır (birden çok fotoğrafta köşede sayı); yüklenemezse balık simgesine döner
const thumbImg = (url, c) => { const n = catchPhotos(c).length;
  return `<span class="thumb-wrap"><img class="catch-thumb" src="${url}" data-view="${c.id}" alt="${esc(c.species)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;catch-thumb&quot;>🐟</div>'">${n > 1 ? `<b class="pcount">${n}</b>` : ''}</span>`; };

// ——— Tam ekran fotoğraf görüntüleyici (sağa/sola kaydır) ———
const viewer = { items: [], i: 0 };
const capOf = c => `<b>${esc(c.species)}</b>${c.length ? ` · ${c.length} cm` : ''}${c.weight ? ` · ${c.weight} g` : ''}<br><small>${esc(fmtDate(c.date))} ${fmtTime(c.date)}${spotById(c.spotId) ? ` · ${esc(spotById(c.spotId).name)}` : ''}${c.by ? ` · 👤 ${esc(c.by)}` : ''}</small>`;
function openViewer(items, i = 0) {
  if (!items.length) return;
  viewer.items = items; viewer.i = Math.max(0, Math.min(items.length - 1, i));
  showViewer();
  if (!$('#photo-view').open) $('#photo-view').showModal();
}
function showViewer() {
  const it = viewer.items[viewer.i], n = viewer.items.length;
  $('#photo-img').src = it.src;
  $('#photo-cap').innerHTML = it.cap + (n > 1 ? `<div class="pv-count">${viewer.i + 1} / ${n}</div>` : '');
  $('#pv-prev').hidden = $('#pv-next').hidden = n < 2;
}
const viewerStep = d => { const n = viewer.items.length; if (n < 2) return; viewer.i = (viewer.i + d + n) % n; showViewer(); };
// Bir avın fotoğrafları
function openPhoto(id, i = 0) {
  const c = state.catches.find(x => x.id === id); if (!c) return;
  openViewer(catchPhotos(c).map(p => ({ src: photoSrc(c, p), cap: capOf(c) })).filter(x => x.src), i);
}
// Bir meradaki tüm fotoğraflar (yeniden eskiye)
const spotPhotos = list => list.flatMap(c => catchPhotos(c).map(p => ({ c, src: photoSrc(c, p) }))).filter(x => x.src);
function photoGrid(list, { max = 0, more = '' } = {}) {
  const all = spotPhotos(list);
  if (!all.length) return '';
  const shown = max ? all.slice(0, max) : all;
  return `<div class="pgrid">${shown.map((x, i) => `<button type="button" class="pcell" data-gallery="${i}"><img src="${x.src}" alt="${esc(x.c.species)}" loading="lazy" onerror="this.parentElement.remove()"><span>${esc(x.c.species)}${x.c.length ? ` ${x.c.length} cm` : ''}</span></button>`).join('')}
    ${max && all.length > max ? `<button type="button" class="pcell more" data-dtab="catches">+${all.length - max}<span>${more || 'tümü'}</span></button>` : ''}</div>`;
}

function dropPhotoUrl(id) {
  for (const [k, u] of state.photoUrls) if (k === id || k.startsWith(id + ':')) { URL.revokeObjectURL(u); state.photoUrls.delete(k); }
}

// Konum: birkaç saniye GPS'i dinleyip en hassas ölçümü al (ilk ölçüm çoğu zaman baz istasyonu/Wi-Fi'dan, kaba gelir)
// Konum: önce telefonun hazırdaki konumu (Wi-Fi/baz istasyonu, 1–3 sn), sonra GPS ile hassaslaştır.
// Hassas konum gecikirse beklemeden hazırdaki konumla devam edilir; daha iyisi gelince onBetter ile bildirilir.
function getPosition({ wantAcc = 30, maxWait = 6000, onBetter } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Konum desteklenmiyor'));
    let best = null, done = false, id = null, deniedErr = null;
    const toPos = p => ({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0) });
    const take = cur => {
      if (best && cur.acc > best.acc) return;
      best = cur;
      if (done) { onBetter?.(cur); return; }
      if (cur.acc <= wantAcc) finish();
    };
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(deniedErr || new Error('Konum alınamadı. Telefonun konum (GPS) ayarı açık mı? Açık alanda tekrar deneyin.'));
      // Bulunduktan sonra 20 sn daha GPS'i dinle (daha hassası gelirse güncellenir)
      setTimeout(() => { if (id != null) navigator.geolocation.clearWatch(id); }, best && onBetter ? 20000 : 0);
    };
    const timer = setTimeout(finish, maxWait);
    const onErr = err => { if (err.code === 1) { deniedErr = new Error('Konum izni yok. Tarayıcı ayarlarından bu siteye konum izni verin.'); finish(); } };
    // 1) Hızlı: hazırdaki (son 2 dk) konum
    navigator.geolocation.getCurrentPosition(p => { take(toPos(p)); if (best && best.acc <= 150 && !done) setTimeout(() => { if (!done) finish(); }, 1500); }, onErr,
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 4000 });
    // 2) Hassas: GPS
    id = navigator.geolocation.watchPosition(p => take(toPos(p)), onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 });
  });
}

// Fotoğrafı küçült (en fazla 1280 px, JPEG)
function compressImage(file, max = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Fotoğraf işlenemedi')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Fotoğraf okunamadı')); };
    img.src = url;
  });
}

const toLocalInput = d => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
// Basılı tutma (uzun basma) algılayıcı
function onLongPress(el, fn, ms = 550) {
  let t = null, sx = 0, sy = 0;
  el.addEventListener('pointerdown', e => {
    sx = e.clientX; sy = e.clientY; clearTimeout(t);
    t = setTimeout(() => { el.dataset.lp = Date.now(); try { navigator.vibrate?.(25); } catch { /* yok */ } fn(e); }, ms);
  });
  el.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(t); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
  el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); if (Date.now() - (+el.dataset.lp || 0) > 800) { el.dataset.lp = Date.now(); fn(e); } });
}
const justLongPressed = el => Date.now() - (+(el?.dataset.lp) || 0) < 800;

const ls = k => { try { return localStorage.getItem(k); } catch { return null; } };
const spotById = id => state.spots.find(s => s.id === id);

async function loadData() {
  [state.catches, state.spots] = await Promise.all([db.getAll('catches'), db.getAll('spots')]);
  state.catches.sort((a, b) => new Date(b.date) - new Date(a.date));
  state.spots.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

function refreshAll() {
  renderCatches();
  if (map) renderMapMarkers();
  if (state.tab === 'stats') renderStats();
  if (state.tab === 'map') renderRank();
}

// ————————————————— Sekmeler —————————————————
// Tam ekran harita için üst çubuğun (ve kurulum ipucunun) yüksekliği
function updateTopH() {
  const hint = $('#install-hint');
  const gb = $('#group-bar');
  const h = $('.topbar').offsetHeight + (hint && !hint.hidden ? hint.offsetHeight : 0) + (gb && !gb.hidden ? gb.offsetHeight : 0);
  document.documentElement.style.setProperty('--top-h', h + 'px');
  document.documentElement.style.setProperty('--topbar-h', $('.topbar').offsetHeight + 'px');
}

function setupResize() {
  window.addEventListener('resize', updateTopH);
  // Sağdaki yuvarlak düğmeler kartların hemen üstünde dursun
  try { new ResizeObserver(([e]) => $('#tab-map').style.setProperty('--card-h', Math.round(e.target.offsetHeight) + 'px')).observe($('.carousel-wrap')); } catch { /* yok */ }
  try { new ResizeObserver(updateTopH).observe($('#install-hint')); } catch { /* yok */ }
}
function showTab(name) {
  state.tab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === `tab-${name}`));
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $('#page-title').textContent = $(`#tab-${name}`).dataset.title;
  $('#fab').hidden = name === 'more' || name === 'map';
  document.body.classList.toggle('map-mode', name === 'map');
  updateTopH();
  if (name === 'map') { initMap(); renderRank(); }
  if (name === 'stats') renderStats();
  if (name === 'more') renderMore();
  window.scrollTo(0, 0);
}

// ————————————————— Av listesi —————————————————
function renderCatches() {
  const q = $('#catch-search').value.trim().toLocaleLowerCase('tr');
  const list = $('#catch-list');
  const items = state.catches.filter(c => !q ||
    [c.species, c.bait, c.method, c.notes, spotById(c.spotId)?.name].join(' ').toLocaleLowerCase('tr').includes(q));

  if (!state.catches.length) {
    list.innerHTML = `<div class="empty"><span class="big">🎣</span>Henüz av kaydı yok.<br>Sağ alttaki <b>＋</b> düğmesiyle ilk avınızı ekleyin.<br><br>Rastgele!</div>`;
    return;
  }
  if (!items.length) { list.innerHTML = `<div class="empty">“${esc(q)}” için sonuç yok.</div>`; return; }

  let html = '', lastDay = '';
  for (const c of items) {
    const day = fmtDate(c.date);
    if (day !== lastDay) { html += `<div class="day-head">${esc(day)}</div>`; lastDay = day; }
    const sp = findSpecies(c.species);
    const url = photoUrl(c);
    const thumb = url ? thumbImg(url, c) : `<div class="catch-thumb">${sp?.emoji || '🐟'}</div>`;
    const meta = [fmtTime(c.date), c.length && `${c.length} cm`, c.weight && `${c.weight} g`, c.bait, spotById(c.spotId)?.name, c.by && `👤 ${c.by}`]
      .filter(Boolean).map(esc).join(' · ');
    html += `<button class="catch-item" data-id="${c.id}">${thumb}<div class="catch-body">
      <div class="catch-title">${state.newIds?.has(c.id) ? '<span class="tag new">🆕</span> ' : ''}${esc(c.species)}${c.count > 1 ? ` <span class="tag">×${c.count}</span>` : ''}${c.released ? '<span class="tag">salındı</span>' : ''}</div>
      <div class="catch-meta">${meta}</div></div></button>`;
  }
  list.innerHTML = html;
}

// Bir meradaki avlar: o meraya kaydedilenler + meraya 300 m'den yakın, merası seçilmemiş avlar
const distM = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180));
function catchesAt(place) {
  const id = place.key && place.key !== 'me' ? place.key : place.id;
  return state.catches.filter(c => (id && c.spotId === id) || (!c.spotId && c.lat != null && distM(c, place) < 300))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}
function catchSummary(list) {
  const n = list.reduce((t, c) => t + (c.count || 1), 0);
  const top = (k) => { const m = new Map(); list.forEach(c => { if (c[k]) m.set(c[k], (m.get(c[k]) || 0) + (c.count || 1)); }); return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] || null; };
  const hours = Array(24).fill(0); list.forEach(c => { hours[new Date(c.date).getHours()] += (c.count || 1); });
  const bh = hours.indexOf(Math.max(...hours));
  const biggest = list.filter(c => c.length).sort((a, b) => b.length - a.length)[0];
  return { n, species: top('species'), bait: top('bait'), hour: n ? bh : null, biggest };
}

// ————————————————— Öneri düğmeleri (telefonun açılır listesi yerine) —————————————————
// Kutunun altında küçük düğmeler: yazdıkça süzülür, formu kapatmaz. Kendi girdiğiniz değerler de eklenir.
function suggItems(id) {
  const used = k => [...new Set(state.catches.map(c => c[k]).filter(Boolean))];
  const base = id === 'catch-species' ? SPECIES.filter(x => x.name !== 'Diğer').map(x => x.name)
    : id === 'catch-bait' ? BAITS : METHODS;
  const key = { 'catch-species': 'species', 'catch-bait': 'bait', 'catch-method': 'method' }[id];
  const mine = used(key).filter(v => !base.some(b => b.toLocaleLowerCase('tr') === v.toLocaleLowerCase('tr')));
  return [...mine, ...base];
}
function renderSugg(id) {
  const box = document.querySelector(`.sugg[data-for="${id}"]`);
  if (!box) return;
  const q = $('#' + id).value.trim().toLocaleLowerCase('tr');
  const items = suggItems(id).filter(v => !q || v.toLocaleLowerCase('tr').includes(q))
    .filter(v => v.toLocaleLowerCase('tr') !== q).slice(0, 14);
  box.innerHTML = items.map(v => `<button type="button" data-sugg="${esc(v)}">${esc(v)}</button>`).join('');
}
function bindSugg() {
  for (const id of ['catch-species', 'catch-bait', 'catch-method']) {
    const inp = $('#' + id);
    inp.addEventListener('input', () => renderSugg(id));
    inp.addEventListener('focus', () => renderSugg(id));
    document.querySelector(`.sugg[data-for="${id}"]`).addEventListener('click', e => {
      const b = e.target.closest('[data-sugg]'); if (!b) return;
      inp.value = b.dataset.sugg;
      renderSugg(id);
      if (id === 'catch-species') checkSize();
    });
  }
}

// ————————————————— Av ekleme / düzenleme —————————————————
let editing = null; // { id, photo, lat, lng }

function fillSpotSelect(sel, selected) {
  sel.innerHTML = '<option value="">— Seçilmedi —</option>' +
    state.spots.map(s => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}

function openCatchDialog(c = null, preset = {}) {
  editing = c ? { id: c.id, photos: catchPhotos(c).map(p => ({ ...p })), lat: c.lat, lng: c.lng, orig: c }
              : { id: null, photos: [], lat: preset.lat ?? null, lng: preset.lng ?? null };
  $('#catch-dialog-title').textContent = c ? 'Avı düzenle' : 'Yeni Av';
  $('#catch-species').value = c?.species || '';
  $('#catch-length').value = c?.length ?? '';
  $('#catch-weight').value = c?.weight ?? '';
  $('#catch-count').value = c?.count ?? 1;
  $('#catch-date').value = toLocalInput(c ? new Date(c.date) : new Date());
  $('#catch-bait').value = c?.bait || ls('lastBait') || '';
  $('#catch-method').value = c?.method || ls('lastMethod') || '';
  fillSpotSelect($('#catch-spot'), c?.spotId ?? preset.spotId ?? ls('lastSpot') ?? '');
  $('#catch-released').checked = !!c?.released;
  $('#catch-notes').value = c?.notes || '';
  $('#catch-delete').hidden = !c;
  renderEditPhotos();
  updateLocationText();
  checkSize();
  ['catch-species', 'catch-bait', 'catch-method'].forEach(renderSugg);
  $('#catch-dialog').showModal();
}

// Av penceresindeki fotoğraflar: küçük resimler + ✕ + "＋ ekle"
const editKeys = new Map();
function editSrc(p) {
  if (!p.blob) return p.url;
  if (!editKeys.has(p)) editKeys.set(p, URL.createObjectURL(p.blob));
  return editKeys.get(p);
}
function renderEditPhotos() {
  const ph = editing.photos;
  $('#catch-photos').innerHTML = ph.map((p, i) => `<div class="ptile"><img src="${editSrc(p)}" alt="" data-epv="${i}"><button type="button" class="prm" data-rm="${i}" aria-label="Fotoğrafı kaldır">✕</button>${i === 0 ? '<span class="pfirst">kapak</span>' : ''}</div>`).join('') +
    (ph.length < MAX_PHOTOS ? `<label class="ptile padd"><input type="file" id="catch-photo" accept="image/*" multiple hidden><span>📷<br>${ph.length ? 'Ekle' : 'Fotoğraf ekle'}</span></label>` : '');
  $('#catch-photo-count').textContent = ph.length ? `${ph.length}/${MAX_PHOTOS} fotoğraf · ilk fotoğraf kapak` : `En fazla ${MAX_PHOTOS} fotoğraf`;
}

function updateLocationText() {
  $('#catch-location-text').textContent = editing.lat != null ? `${editing.lat.toFixed(5)}, ${editing.lng.toFixed(5)}` : '';
}

function checkSize() {
  const sp = findSpecies($('#catch-species').value);
  const len = parseFloat($('#catch-length').value);
  const w = $('#catch-size-warning');
  if (sp?.minSize && len && len < sp.minSize) {
    w.textContent = `⚠️ ${sp.name} için asgari boy ${sp.minSize} cm. Bu balığı denize geri salmalısınız.`;
    w.hidden = false;
  } else if (sp?.minSize) {
    w.textContent = `Asgari boy: ${sp.minSize} cm`; w.hidden = false;
  } else w.hidden = true;
}

async function saveCatch(e) {
  e.preventDefault();
  const species = $('#catch-species').value.trim();
  if (!species) return;
  const sp = findSpecies(species);
  const spotId = $('#catch-spot').value || null;
  let { lat, lng } = editing;
  if (lat == null && spotId) { const s = spotById(spotId); lat = s?.lat ?? null; lng = s?.lng ?? null; }
  const rec = {
    id: editing.id || db.newId(),
    species: sp ? sp.name : species,
    length: parseFloat($('#catch-length').value) || null,
    weight: parseFloat($('#catch-weight').value) || null,
    count: Math.max(1, parseInt($('#catch-count').value, 10) || 1),
    date: new Date($('#catch-date').value).toISOString(),
    bait: $('#catch-bait').value.trim(),
    method: $('#catch-method').value.trim(),
    spotId, lat, lng,
    released: $('#catch-released').checked,
    notes: $('#catch-notes').value.trim(),
    photos: editing.photos.map(p => ({ id: p.id, ...(p.blob ? { blob: p.blob } : {}), ...(p.url ? { url: p.url } : {}) })),
    updatedAt: new Date().toISOString(),
  };
  // Eski sürümler için ilk fotoğraf ayrıca (photo / photoUrl)
  rec.photo = rec.photos[0]?.blob || null;
  if (rec.photos[0]?.url) rec.photoUrl = rec.photos[0].url;
  // Grup kaydı alanları (kim ekledi) düzenlemede kaybolmasın
  if (editing.orig) for (const k of ['by', 'editedBy', 'createdAt']) if (editing.orig[k] != null) rec[k] = editing.orig[k];
  dropPhotoUrl(rec.id);
  await db.put('catches', rec);
  try {
    localStorage.setItem('lastBait', rec.bait); localStorage.setItem('lastMethod', rec.method);
    localStorage.setItem('lastSpot', spotId || '');
  } catch { /* yok */ }
  $('#catch-dialog').close();
  await loadData(); refreshAll();
  if ($('#wx-dialog').open && detail) renderDetail();
  toast(editing.id ? 'Güncellendi' : 'Rastgele! Av kaydedildi 🎣');
}

async function deleteCatch() {
  if (!editing.id || !confirm('Bu av kaydı silinsin mi?')) return;
  await db.remove('catches', editing.id);
  dropPhotoUrl(editing.id);
  $('#catch-dialog').close();
  await loadData(); refreshAll();
  if ($('#wx-dialog').open && detail) renderDetail();
  toast('Silindi');
}

// ————————————————— Harita —————————————————
let map, spotLayer, catchLayer, meMarker, meAcc, mapFitted = false;
const rankInfo = new Map(); // mera id -> { rank, score, danger }

function initMap() {
  if (!window.L) { $('#map').innerHTML = '<div class="empty">Harita yüklenemedi. İnternet bağlantınızı kontrol edin.</div>'; return; }
  if (!map) {
    map = L.map('map', { zoomControl: false }).setView([DEFAULT_PLACE.lat, DEFAULT_PLACE.lng], 10);
    L.control.zoom({ position: 'topright' }).addTo(map);
    const bases = baseLayers();
    let baseName = ls('mapBase');
    if (!bases[baseName]) baseName = Object.keys(bases)[0];
    bases[baseName].addTo(map);
    spotLayer = L.layerGroup().addTo(map);
    catchLayer = L.layerGroup().addTo(map);
    const seamarks = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 19, maxNativeZoom: 18, attribution: '&copy; OpenSeaMap' });
    if (ls('seamarks') === '1') seamarks.addTo(map);
    L.control.layers(bases, { '⚓ Deniz işaretleri': seamarks, '📍 Meralar': spotLayer, '🐟 Avlar': catchLayer }, { collapsed: true, position: 'topright' }).addTo(map);
    map.on('baselayerchange', e => { try { localStorage.setItem('mapBase', e.name); } catch { /* yok */ } });
    map.on('overlayadd overlayremove', e => { if (e.layer === seamarks) try { localStorage.setItem('seamarks', e.type === 'overlayadd' ? '1' : '0'); } catch { /* yok */ } });
    const addAt = e => { if (Date.now() - lastMenuAt > 1200) openSpotDialog(null, e.latlng); };
    map.on('contextmenu', addAt); // boş yere basılı tut = yeni mera (çift dokunma = yakınlaştır)
    map.on('click', e => mapPointPopup(e.latlng));
    // Uzaklaştırınca isim etiketlerini gizle (üst üste binmesin)
    const farCheck = () => map.getContainer().classList.toggle('map-far', map.getZoom() < 11);
    map.on('zoomend', farCheck); farCheck();
  }
  // Harita sekmesi görünür olduktan sonra boyutu düzelt, sonra meraları sığdır
  requestAnimationFrame(() => setTimeout(() => {
    map.invalidateSize();
    renderMapMarkers();
    if (!mapFitted) { fitAll(); mapFitted = true; }
  }, 60));
}

// Ücretsiz, anahtarsız ve sürekli güncellenen harita katmanları
function baseLayers() {
  const esri = path => `https://server.arcgisonline.com/ArcGIS/rest/services/${path}/MapServer/tile/{z}/{y}/{x}`;
  return {
    '🧭 Standart (OSM, en güncel)': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap katkıcıları' }),
    '🛰️ Uydu + isimler': L.layerGroup([
      L.tileLayer(esri('World_Imagery'), { maxZoom: 19, maxNativeZoom: 18, attribution: 'Uydu &copy; Esri, Maxar, Earthstar Geographics' }),
      L.tileLayer(esri('Reference/World_Boundaries_and_Places'), { maxZoom: 19, maxNativeZoom: 18 }),
      L.tileLayer(esri('Reference/World_Transportation'), { maxZoom: 19, maxNativeZoom: 18, opacity: 0.7 }),
    ]),
    '⛰️ Topoğrafik (göl/dere)': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc', maxZoom: 19, maxNativeZoom: 17, attribution: '&copy; OpenTopoMap (CC-BY-SA), OpenStreetMap' }),
  };
}

// Dokunulan noktanın adı (göl, köy, iskele…) — OpenStreetMap Nominatim
async function placeName(lat, lng) {
  const url = layer => `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&accept-language=tr${layer ? `&layer=${layer}` : ''}`;
  const pick = j => {
    if (!j || j.error) return null;
    const ad = j.address || {};
    const main = j.name || ad.water || ad.natural || ad.bay || ad.village || ad.suburb || ad.town || ad.city_district || ad.city;
    const area = [ad.town || ad.city_district || ad.county, ad.province || ad.state].filter(x => x && x !== main).join(', ');
    return main ? { name: main, area } : null;
  };
  const get = async u => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000);
    try { return pick(await (await fetch(u, { signal: ctl.signal })).json()); } catch { return null; } finally { clearTimeout(t); }
  };
  // Su adı (göl, koy…) ile genel adres aynı anda; önce su adı
  const [nat, gen] = await Promise.all([get(url('natural')), get(url(''))]);
  return nat || gen;
}

function fitAll() {
  if (!map) return;
  const pts = state.spots.length ? state.spots : state.catches.filter(c => c.lat != null);
  if (!pts.length) return;
  if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 14);
  else map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 15 });
}

const spotMarkers = new Map(); // mera id -> işaret
function renderMapMarkers() {
  if (!map) return;
  spotLayer.clearLayers(); catchLayer.clearLayers(); spotMarkers.clear();
  for (const s of state.spots) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const info = rankInfo.get(s.id);
    // Yuvarlakta puan (uzaktan okunur), sol üst köşede sıra numarası
    const html = `<div class="mk${s.id === selKey ? ' sel' : ''}"><span class="mk-dot" style="background:${info ? scoreColor(info.score) : 'var(--muted)'}">${info ? fmt(info.score, 1) : '•'}</span>` +
      `${info ? `<span class="mk-rank">${info.rank}</span>` : ''}<span class="mk-name">${esc(s.name)}${(() => { const n = catchesAt({ ...s, key: s.id }).length; return n ? ` · 🐟${n}` : ''; })()}</span></div>`;
    const marker = L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: 'mk-wrap', html, iconSize: [34, 34], iconAnchor: [17, 17] }),
      zIndexOffset: info ? 1000 - info.rank : 0, title: s.name,
    });
    marker.on('click', () => {
      if (justLongPressed(marker.getElement())) return;
      // Kartı olan merada ilk dokunuş kartı getirir, ikinci dokunuş detayı açar
      if (selKey !== s.id && $(`#rank-list .rank-item[data-key="${CSS.escape(s.id)}"]`)) selectCard(s.id, { scroll: true, pan: false });
      else openDetail({ ...s, key: s.id });
    });
    spotMarkers.set(s.id, marker);
    marker.on('add', () => { const el = marker.getElement(); if (el && !el.dataset.lpBound) { el.dataset.lpBound = 1; onLongPress(el, () => openSpotMenu(s)); } });
    marker.addTo(spotLayer);
  }
  for (const c of state.catches) {
    if (c.lat == null) continue;
    const sp = c.spotId && spotById(c.spotId);
    if (sp && distM(c, sp) < 150) continue; // meranın kendi işaretinde gösteriliyor
    if (!sp && state.spots.some(x => Number.isFinite(x.lat) && distM(c, x) < 150)) continue; // meranın üstüne binmesin
    const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'fish-marker', html: findSpecies(c.species)?.emoji || '🐟', iconSize: [22, 22] }) });
    const url = photoUrl(c);
    m.bindPopup(`${url ? `<img class="pop-photo" src="${url}" data-view="${c.id}" alt="${esc(c.species)}" loading="lazy">` : ''}
      <b>${esc(c.species)}</b>${c.length ? ` · ${c.length} cm` : ''}<br><small>${esc(fmtDate(c.date))} ${fmtTime(c.date)}</small>
      <div class="popup-actions"><button data-act="edit-catch" data-id="${c.id}">Aç</button></div>`);
    catchLayer.addLayer(m);
  }
}

function showMe(p, move = true) {
  initMap();
  if (!map) return; // harita yüklenemese de konum kullanılabilsin
  if (move) map.setView([p.lat, p.lng], p.acc && p.acc > 150 ? 14 : 16);
  if (meMarker) meMarker.setLatLng([p.lat, p.lng]);
  else meMarker = L.circleMarker([p.lat, p.lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
  // Hassasiyet dairesi: gerçek konum bu dairenin içinde
  if (meAcc) map.removeLayer(meAcc);
  if (p.acc) meAcc = L.circle([p.lat, p.lng], { radius: p.acc, color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: 0.1, interactive: false }).addTo(map);
}
async function locateMe({ onBetter } = {}) {
  let p;
  try {
    p = await getPosition({ onBetter: q => { showMe(q, false); onBetter?.(q); } });
  } catch (e) { toast(e.message, 5000); return null; }
  showMe(p);
  if (p.acc > 300) toast(`📍 Yaklaşık konum (±${p.acc} m). GPS hassaslaştırıyor, birkaç saniye içinde düzelir.`, 4000);
  return p;
}

// ————————————————— Yer arama —————————————————
// İki ücretsiz OpenStreetMap servisi:
//  • Photon (komoot): yazarken öneri, haritada bakılan yere yakın sonuçlar önce
//  • Nominatim: "Ara"ya basınca ayrıntılı arama (Türkiye öncelikli)
// Sonuca dokununca iğne konmaz; harita oraya gider, tam yeri kullanıcı seçer.
const TR_BBOX = '25.5,35.7,45.0,42.2'; // Türkiye (batı, güney, doğu, kuzey)
let searchArea = null, searchTimer = null, searchSeq = 0;

const PLACE_TYPES = {
  city: 'şehir', town: 'ilçe', village: 'köy', hamlet: 'mezra', suburb: 'mahalle', neighbourhood: 'mahalle', quarter: 'mahalle',
  district: 'ilçe', county: 'ilçe', state: 'il', province: 'il', locality: 'yer',
  water: 'su', lake: 'göl', reservoir: 'baraj gölü', pond: 'gölet', river: 'nehir', stream: 'dere', canal: 'kanal', bay: 'koy',
  strait: 'boğaz', beach: 'plaj', coastline: 'kıyı', pier: 'iskele', harbour: 'liman', marina: 'marina', breakwater: 'mendirek',
  cape: 'burun', island: 'ada', islet: 'adacık', dam: 'baraj', park: 'park', peak: 'tepe',
};
const typeLabel = (k, v) => PLACE_TYPES[v] || PLACE_TYPES[k] || '';
const mapCenter = () => (map ? map.getCenter() : DEFAULT_PLACE);

async function photonSearch(q, worldwide = false) {
  const c = mapCenter();
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=12&lat=${c.lat.toFixed(4)}&lon=${(c.lng ?? c.lon).toFixed(4)}` +
    `&location_bias_scale=0.4${worldwide ? '' : `&bbox=${TR_BBOX}`}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('photon');
  const j = await r.json();
  return (j.features || []).map(f => {
    const p = f.properties || {};
    const [lng, lat] = f.geometry.coordinates;
    const ex = p.extent; // [minLon, maxLat, maxLon, minLat]
    return {
      name: p.name || p.street || p.city || '?', lat, lng,
      detail: [p.district || p.locality, p.city !== p.name ? p.city : null, p.county, p.state].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', '),
      kind: typeLabel(p.osm_key, p.osm_value),
      bbox: ex ? [ex[3], ex[1], ex[0], ex[2]] : null, // [güney, kuzey, batı, doğu]
    };
  });
}

async function nominatimSearch(q, worldwide = false) {
  let vb = '';
  if (map) { const b = map.getBounds(); vb = `&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}&bounded=0`; }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=15&addressdetails=1&accept-language=tr${worldwide ? '' : '&countrycodes=tr'}${vb}&q=${encodeURIComponent(q)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('nominatim');
  const j = await r.json();
  return j.map(x => {
    const ad = x.address || {};
    return {
      name: x.name || x.display_name.split(',')[0], lat: +x.lat, lng: +x.lon,
      detail: [ad.suburb || ad.village || ad.neighbourhood, ad.town || ad.city_district || ad.county, ad.province || ad.state].filter(Boolean).filter(v => v !== x.name).join(', ') || x.display_name,
      kind: typeLabel(x.category, x.type),
      bbox: x.boundingbox ? x.boundingbox.map(Number) : null,
    };
  });
}

// İki kaynağı birleştir, aynı yerleri ayıkla, haritadaki merkeze yakın olanı öne al
function mergeResults(lists) {
  const c = mapCenter(), out = [];
  for (const p of lists.flat()) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (out.some(o => o.name.toLocaleLowerCase('tr') === p.name.toLocaleLowerCase('tr') && Math.abs(o.lat - p.lat) < 0.01 && Math.abs(o.lng - p.lng) < 0.01)) continue;
    out.push(p);
  }
  // ~150 km'den yakın olanlar önce (servislerin kendi sıralaması korunur), uzaktakiler sonra
  const d = p => Math.hypot(p.lat - c.lat, (p.lng - (c.lng ?? c.lon)) * Math.cos(c.lat * Math.PI / 180));
  const near = out.filter(p => d(p) <= 1.5), far = out.filter(p => d(p) > 1.5);
  return [...near, ...far].slice(0, 15);
}

async function searchPlaces(q, { quick = false } = {}) {
  const run = async ww => {
    const jobs = [photonSearch(q, ww).catch(() => [])];
    if (!quick) jobs.push(nominatimSearch(q, ww).catch(() => []));
    return mergeResults(await Promise.all(jobs));
  };
  let res = await run(false);
  if (!res.length && !quick) res = await run(true); // Türkiye'de yoksa dünya geneli
  if (!res.length && !quick) {
    // Son çare: Open-Meteo yer araması
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=tr`);
    if (r.ok) res = ((await r.json()).results || []).map(x => ({ name: x.name, detail: [x.admin2, x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lng: x.longitude, bbox: null, kind: '' }));
  }
  return res;
}


function showResults(res, q) {
  const box = $('#map-results');
  state.searchResults = res;
  box.hidden = false;
  box.parentElement.classList.add('open');
  box.innerHTML = res.length
    ? res.map((p, i) => `<button type="button" class="result" data-result="${i}"><b>${esc(p.name)}${p.kind ? ` <span class="tag">${esc(p.kind)}</span>` : ''}</b><small>${esc(p.detail || '')}</small></button>`).join('') +
      '<button type="button" class="result close" data-result="close">✕ Kapat</button>'
    : `<div class="result">“${esc(q)}” bulunamadı. İl/ilçe ekleyerek deneyin (örn. “Değirmendere Gölcük”).</div>`;
}

// Oraya git ama konum seçme: kullanıcı haritada tam yeri seçer
function goToPlace(p) {
  initMap();
  if (!map) return;
  $('#map-results').hidden = true;
  $('#map-results').parentElement.classList.remove('open');
  $('#map-q').blur();
  if (p.bbox && p.bbox.every(Number.isFinite) && (p.bbox[1] - p.bbox[0]) > 0.0005) {
    map.fitBounds([[p.bbox[0], p.bbox[2]], [p.bbox[1], p.bbox[3]]], { maxZoom: 15, padding: [30, 30] });
  } else map.setView([p.lat, p.lng], 15);
  if (searchArea) map.removeLayer(searchArea);
  searchArea = L.circle([p.lat, p.lng], { radius: 250, color: '#e11d48', weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(map);
  setTimeout(() => { if (searchArea) { map.removeLayer(searchArea); searchArea = null; } }, 15000);
  toast(`📍 ${p.name}: tam yere dokunun = tahmin, basılı tutun = mera ekle`, 5000);
}

async function onMapSearch(e) {
  e.preventDefault();
  clearTimeout(searchTimer);
  const q = $('#map-q').value.trim();
  if (q.length < 2) return;
  $('#map-q').blur();
  const seq = ++searchSeq;
  const box = $('#map-results');
  box.hidden = false;
  box.innerHTML = '<div class="result muted">Aranıyor…</div>';
  try {
    const res = await searchPlaces(q);
    if (seq === searchSeq) showResults(res, q);
  } catch { box.innerHTML = '<div class="result warn">Yer araması yapılamadı. İnternet bağlantınızı kontrol edin.</div>'; }
}

// Yazarken öneri (Photon, 3+ harf, 400 ms bekleyerek)
function onMapTyping() {
  clearTimeout(searchTimer);
  const q = $('#map-q').value.trim();
  if (q.length < 3) { if (!q) { $('#map-results').hidden = true; $('#map-results').parentElement.classList.remove('open'); } return; }
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    try {
      const res = await searchPlaces(q, { quick: true });
      if (seq === searchSeq && $('#map-q').value.trim() === q) showResults(res, q);
    } catch { /* sessiz */ }
  }, 400);
}

// ————————————————— Mera ekleme —————————————————
let editingSpot = null;
function openSpotDialog(s, latlng, water, name = '') {
  editingSpot = s ? { ...s } : { id: null, lat: latlng.lat, lng: latlng.lng };
  $('#spot-dialog-title').textContent = s ? 'Merayı düzenle' : 'Yeni Mera';
  $('#spot-name').value = s?.name || name;
  $('#spot-type').value = s?.type || 'İskele';
  $('#spot-water').value = s?.water || water || 'auto';
  $('#spot-shore').value = s?.shoreManual ?? 'auto';
  $('#spot-lake').value = s?.lakeSize || 'auto';
  $('#spot-lake-row').hidden = !['auto', 'lake'].includes($('#spot-water').value);
  $('#spot-notes').value = s?.notes || '';
  $('#spot-coords').textContent = `📍 ${editingSpot.lat.toFixed(5)}, ${editingSpot.lng.toFixed(5)}`;
  $('#spot-delete').hidden = !s;
  $('#spot-dialog').showModal();
  showAutoWater(editingSpot.lat, editingSpot.lng);
}

// "Otomatik" seçeneğinde ne bulunduğunu göster (yanlışsa kaydetmeden önce değiştirilebilsin)
async function showAutoWater(lat, lng) {
  const opt = $('#spot-water option[value="auto"]');
  opt.textContent = 'Otomatik algıla (bakılıyor…)';
  const g = await detectWater(lat, lng, { urgent: true }).catch(() => null);
  if (editingSpot?.lat !== lat || editingSpot?.lng !== lng) return;
  opt.textContent = g && !g.noWater
    ? `Otomatik: ${WATER_TYPES[g.type].icon} ${WATER_TYPES[g.type].label}${g.name ? ` · ${g.name}` : ''}`
    : 'Otomatik algıla (su bulunamadı, elle seçin)';
  const lk = lakeSizeFor({ name: $('#spot-name').value }, g);
  $('#spot-lake option[value="auto"]').textContent = `Otomatik: ${LAKE_SIZES[lk.size].label}${lk.source === 'default' ? ' (bilinmiyor)' : ''}`;
  if ($('#spot-water').value === 'auto') $('#spot-lake-row').hidden = g?.type ? g.type !== 'lake' : false;
}

async function saveSpot(e) {
  e.preventDefault();
  const rec = { ...editingSpot, id: editingSpot.id || db.newId(), name: $('#spot-name').value.trim(),
    lat: Number(editingSpot.lat), lng: Number(editingSpot.lng),
    type: $('#spot-type').value, water: $('#spot-water').value, shoreManual: $('#spot-shore').value, lakeSize: $('#spot-lake').value, notes: $('#spot-notes').value.trim(), createdAt: editingSpot.createdAt || new Date().toISOString() };
  if (!rec.name) return;
  await db.put('spots', rec);
  $('#spot-dialog').close();
  map?.closePopup();
  await loadData(); refreshAll();
  toast('Mera kaydedildi 📍');
}

async function deleteSpot() {
  if (!editingSpot.id || !confirm('Bu mera silinsin mi? (Avlar silinmez)')) return;
  await db.remove('spots', editingSpot.id);
  rankInfo.delete(editingSpot.id);
  $('#spot-dialog').close();
  await loadData(); refreshAll();
}

// ————————————————— Tahmin: hava + balık skoru —————————————————
const fmt = (v, d = 0) => v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d);
const hh = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const dayShort = d => d.toLocaleDateString('tr-TR', { weekday: 'short' });
const effectiveType = (place, cond, guess) => place.water && place.water !== 'auto' ? place.water : (guess?.type || (cond.seaDetected ? 'sea' : 'lake'));

// Suya bakış yönü: elle seçildiyse o, yoksa kayıtlı otomatik sonuç, o da yoksa yükseltiden bul ve kaydet
const DIR8 = ['Kuzey', 'Kuzeydoğu', 'Doğu', 'Güneydoğu', 'Güney', 'Güneybatı', 'Batı', 'Kuzeybatı'];
const dirName8 = deg => DIR8[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
async function shoreFor(place) {
  if (place.shoreManual === 'none') return { bearing: null, manual: true };
  if (place.shoreManual != null && place.shoreManual !== 'auto') return { bearing: +place.shoreManual, manual: true };
  if (place.shore && 'bearing' in place.shore) return place.shore;
  const res = await detectShore(place.lat, place.lng);
  const sp = spotById(place.key) || spotById(place.id);
  if (sp && res) { sp.shore = res; db.put('spots', { ...sp }).catch(() => {}); }
  return res;
}

let waterT = null;
function waterFound() { clearTimeout(waterT); waterT = setTimeout(() => { if (state.tab === 'map') renderRank(); }, 1500); }
async function analyze(place, opts = {}) {
  // Hava, su tipi (göl/deniz/dere) ve kıyı yönü AYNI ANDA istenir; birbirini beklemez.
  const auto = !place.water || place.water === 'auto';
  let guess = auto ? cachedWater(place.lat, place.lng) : null; // önceden bulunduysa hemen
  const isSpot = !!(spotById(place.key) || spotById(place.id));
  const waterP = auto && !guess ? detectWater(place.lat, place.lng, { urgent: !!opts.waitWater }).catch(() => null) : null;
  const wantSea0 = place.water === 'sea' || guess?.type === 'sea';
  // Göl/dere suyu sıcaklığı için son 60 günün havası (küçük ayrı istek, önbellekten gelir)
  const airP = place.water === 'sea' ? null : getAirDaily(place.lat, place.lng, { force: !!opts.force }).catch(() => null);
  const [cond0, shoreInfo] = await Promise.all([
    getConditions(place.lat, place.lng, { ...opts, wantSea: wantSea0 }),
    shoreFor(place).catch(() => null),
  ]);
  let cond = cond0;
  if (waterP) {
    // Hava geldi; su tipi için en fazla 2.5 sn daha bekle (waitWater), gelmezse sonra haber ver
    const g = opts.waitWater ? await Promise.race([waterP, new Promise(r => setTimeout(() => r(undefined), 1200))]) : undefined;
    if (g !== undefined) guess = g;
    else waterP.then(g2 => { if (!g2) return; if (isSpot) waterFound(); opts.onWater?.(g2); });
  }
  // Su tipi deniz çıktı ama noktada dalga verisi yok (kıyı): en yakın deniz verisini al
  if (guess?.type === 'sea' && !wantSea0 && !cond.seaDetected) cond = await getConditions(place.lat, place.lng, { wantSea: true }).catch(() => cond);
  const type = effectiveType(place, cond, guess);
  const shore = shoreInfo?.bearing ?? null;
  const air = type !== 'sea' && airP ? await airP : null;
  const lake = type === 'lake' ? lakeSizeFor(place, guess || cachedWater(place.lat, place.lng)) : null;
  const env = { size: lake?.size || null, lake, model: waterModel(air, type, lake?.size) };
  return { place, cond, type, guess, shore, shoreInfo, env, rows: scoreHours(cond, type, place.lat, place.lng, shore, env) };
}

// Su sıcaklığı nasıl tahmin edildi
function waterNote(a) {
  if (a.type === 'sea') return 'tahmini (yakın deniz noktası)';
  if (!a.env?.model) return 'tahmini (son 5 gün hava ort.)';
  if (a.type === 'river') return 'tahmini (dere: son günlerin havası)';
  return `tahmini · ${LAKE_SIZES[a.env.size].label.toLocaleLowerCase('tr')} göl, son 60 günün havası`;
}
const lakeSourceText = l => ({ manual: 'elle seçildi', known: 'bilinen göl', auto: `haritadan${l.areaKm2 != null ? ` ~${l.areaKm2 < 10 ? l.areaKm2 : Math.round(l.areaKm2)} km²` : ''}`, default: 'bilinmiyor, orta sayıldı' })[l.source];

function summaryLine(r, type) {
  return [
    `${windName(r.windDir, true)} ${fmt(r.wind)} km/s`,
    type === 'sea' && r.wave != null ? `dalga ${fmt(r.wave, 1)} m` : null,
    r.waterTemp != null ? `su ${r.waterTempEstimated ? '~' : ''}${fmt(r.waterTemp)} °C` : null,
    weatherText(r.code),
  ].filter(Boolean).join(' · ');
}

// Köşedeki küçük rüzgar puanı rozeti
const windBadge = r => r.windScore == null ? '' : `<span class="wind-badge" title="Rüzgar puanı: ${esc((r.windNotes || []).join(' · '))}">` +
  `${arrow(r.windDir)} 💨 rüzgar <i class="wdot" style="background:${scoreColor(r.windScore)}"></i><b>${fmt(r.windScore, 1)}</b></span>`;
// Sıralama türü: balık puanı (ilk puanlama) veya birleşik (balık + rüzgar yönü/bölge etkisi)
let rankMode = ['combo', 'wind'].includes(ls('rankMode')) ? 'combo' : 'fish';
const modeVal = r => (rankMode === 'combo' ? (r.comboScore ?? r.score) : r.score) ?? 0;
const MODE_HELP = {
  fish: '🎣 <b>Balık puanı</b>: o anda balık tutma ihtimali. Su sıcaklığı, ışık (alacakaranlık/gece), dalga, rüzgar hızı, yağış, basınç ve ay hesaba katılır. Köşedeki 💨 rozet ayrıca rüzgar puanıdır.',
  combo: '🎣💨 <b>Balık + rüzgar</b>: balık puanına rüzgarın <b>yönü ve bölge etkisi</b> eklenir: Boğaz/Marmara\'da sert lodos (−), uzun lodosta akıntı (−), gölde soğuk mevsimde soğuk kuzey rüzgarı (−) / ılık güney rüzgarı (+), 24 saat aynı yön (+). Rüzgar hızı balık puanında zaten olduğu için iki kez sayılmaz.',
};

// Kart içinde küçük 6 saatlik hava şeridi
function miniWx(a, from, hours = 24) {
  const cells = [];
  // 24 saat: ilk bakışta 6 saat görünür, sola kaydırınca devamı (kartlarda yalnız 6 saat)
  for (let k = 0; k < hours; k++) {
    const r = rowAt(a, new Date(from.getTime() + k * 3600e3));
    if (!r) break;
    const newDay = k > 0 && r.date.getHours() === 0;
    const sv = modeVal(r); // o saatin balık puanı (seçili puan türüne göre)
    cells.push(`<span class="mc${newDay ? ' day' : ''}"><span class="mt">${newDay ? dayShort(r.date) : hh(r.date)}</span>` +
      `<span class="ms" style="background:${scoreColor(sv)}" title="Bu saatin balık puanı">${r.danger ? '⚠' : ''}${fmt(sv, 1)}</span><span class="mi" title="${weatherWord(r.code)}">${weatherIcon(r.code, r.isDay)}${(r.rainProb ?? 0) >= 50 && !isRainCode(r.code) ? '<sup class="drop">💧</sup>' : ''}</span>` +
      `<span class="mtp">${fmt(r.temp)}°</span><span class="mw">${arrow(r.windDir)}${fmt(r.wind)}</span>` +
      `<span class="mr" title="Yağmur ihtimali">💧${fmt(r.rainProb ?? 0)}%</span></span>`);
  }
  return cells.length ? `<span class="mini-wx${hours <= 6 ? ' fixed' : ''}"${hours > 6 ? ' title="Sola kaydırın: 24 saat"' : ''}>${cells.join('')}</span>${hours > 6 ? '<span class="wx-hint">⟵ 24 saat için kaydır · renkli sayı = balık puanı · 💧 = yağmur ihtimali</span>' : ''}` : '';
}
const topReasons = r => (rankMode === 'combo' ? [...r.reasons, ...(r.dirNotes || [])] : r.reasons)
  .filter(([v]) => v !== 0).sort((x, y) => Math.abs(y[0]) - Math.abs(x[0])).slice(0, 3)
  .map(([v, t]) => `${v > 0 ? '＋' : '－'} ${esc(t)}`).join('<br>');
function renderModeToggle() {
  document.querySelectorAll('#rank-mode [data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === rankMode));
  $('#rank-mode-help').innerHTML = MODE_HELP[rankMode];
}

// Simge yağmur göstermiyor ama ihtimal yüksekse küçük damla ekle
const isRainCode = c => c != null && (c >= 51 && c <= 67 || c >= 80);
const wxIcon = r => weatherIcon(r.code, r.isDay) + ((r.rainProb ?? 0) >= 50 && !isRainCode(r.code) ? '<sup class="drop">💧</sup>' : '');
const rainText = (r, unit) => `💧%${fmt(r.rainProb ?? 0)}${r.precip >= 0.1 ? `<br>${fmt(r.precip, 1)}${unit}` : ''}`;
const scorePill = r => `<span class="score-pill" style="background:${scoreColor(r.score)}">${fmt(r.score, 1)}</span>`;

// —— Sıralama ——
let rankWhen = 'now';
const WHEN_LABEL = { now: 'şu an', trip: 'gidiş–dönüş aralığı', 'o0.5': 'yarım saat sonra', o1: '1 saat sonra', o2: '2 saat sonra', o3: '3 saat sonra', o4: '4 saat sonra', o5: '5 saat sonra', o6: '6 saat sonra', o12: '12 saat sonra',
  evening: 'bu akşam', morning: 'yarın sabah', tomorrowEvening: 'yarın akşam', best24: '24 saatin en iyisi', custom: 'seçilen zaman' };

function targetRow(a) {
  const now = new Date();
  const { rows, cond } = a;
  const sunOn = offset => cond.suns.find(s => s.rise.toDateString() === new Date(now.getTime() + offset * 864e5).toDateString());
  if (rankWhen.startsWith('o')) return rowAt(a, new Date(now.getTime() + parseFloat(rankWhen.slice(1)) * 3600e3));
  if (rankWhen === 'evening') {
    let s = sunOn(0);
    if (s && now > new Date(s.set.getTime() + 3600e3)) s = sunOn(1);
    return s && hourAt(rows, s.set);
  }
  if (rankWhen === 'morning') { const s = sunOn(1); return s && hourAt(rows, s.rise); }
  if (rankWhen === 'tomorrowEvening') { const s = sunOn(1); return s && hourAt(rows, s.set); }
  if (rankWhen === 'best24') {
    const win = rows.filter(r => r.date >= new Date(now.getTime() - 3600e3) && r.date <= new Date(now.getTime() + 24 * 3600e3));
    return win.reduce((b, r) => (!b || r.score > b.score ? r : b), null);
  }
  if (rankWhen === 'custom') {
    const v = $('#rank-custom').value;
    return v ? hourAt(rows, new Date(v)) : null;
  }
  return rowAt(a, now) || hourAt(rows, now);
}

// —— Gidip gelme (aralık) ——
const trip = { go: 1, stay: 4 };
try { Object.assign(trip, JSON.parse(ls('trip') || '{}')); } catch { /* yok */ }
function tripWindow() {
  const start = roundQ(new Date(Date.now() + trip.go * 3600e3));
  return { start, end: new Date(start.getTime() + trip.stay * 3600e3) };
}
function renderTripRow() {
  $('#trip-go').textContent = String(trip.go).replace('.', ',');
  $('#trip-stay').textContent = String(trip.stay).replace('.', ',');
  const { start, end } = tripWindow();
  $('#trip-text').textContent = `Çıkış ${dayShort(start)} ${hh(start)} → dönüş ${dayShort(end)} ${hh(end)}. Meralar bu aralığın ortalama skoruna göre sıralanır.`;
}

let rankSeq = 0;
// Sıralama çiziliyor mu (yenile düğmesi tüm çizimler bitene kadar bekler)
let rankBusy = 0;
let rankWater = ['sea', 'lake', 'river'].includes(ls('rankWater')) ? ls('rankWater') : 'all';
const WATER_FILTER = { all: 'Hepsi', sea: '🌊 Deniz', lake: '🏞️ Göl', river: '🏔️ Nehir' };
async function renderRank(force = false) {
  rankBusy++;
  try { return await renderRankNow(force); } finally { rankBusy--; }
}
async function renderRankNow(force = false) {
  const box = $('#rank-list');
  const places = state.spots.filter(s => Number.isFinite(s.lat)).map(s => ({ ...s, key: s.id }));
  if (!places.length) {
    box.innerHTML = `<div class="rank-item empty">🎯 Henüz mera yok. Haritada balık tuttuğunuz yere <b>basılı tutun</b>
      ya da oraya dokunup <b>📍 Mera kaydet</b>'e basın. Meralar burada en iyiden kötüye sıralanır.</div>`;
    $('#rank-dots').innerHTML = '';
    return;
  }
  const seq = ++rankSeq;
  if (!box.querySelector('.rank-item')) box.innerHTML = '<div class="rank-item empty">Meralar hesaplanıyor… 🎣</div>';
  const tw = rankWhen === 'trip' ? tripWindow() : null;
  // Tüm meraların havası tek istekte (çok sayıda ayrı istek servis sınırına takılıyordu)
  const pts = places.map(p => ({ lat: p.lat, lng: p.lng,
    wantSea: p.water === 'sea' || ((!p.water || p.water === 'auto') && cachedWater(p.lat, p.lng)?.type === 'sea') }));
  const [fresh] = await Promise.all([
    prefetchConditions(pts, { force }).catch(() => new Set()),
    prefetchAirDaily(places.filter((p, i) => p.water !== 'sea' && !pts[i].wantSea), { force }).catch(() => null),
  ]);
  if (seq !== rankSeq) return;
  // Elle yenilemede toplu istek başarısızsa her mera tek tek denenir (olmazsa son kayıt "eski veri" olarak gösterilir)
  const results = await Promise.all(places.map((p, i) => analyze(p, { force: force && !fresh.has(condKey(pts[i].lat, pts[i].lng, pts[i].wantSea)) }).then(a => {
    if (!tw) return { a, r: targetRow(a) };
    const t = tripSummary(a, tw.start, tw.end);
    return t ? { a, trip: t, r: { ...t.best, score: t.avg, danger: t.danger, reasons: t.best.reasons } } : { a, r: null };
  }, err => ({ place: p, err }))));
  if (seq !== rankSeq) return;
  state.analyses = new Map(results.filter(x => x.a).map(x => [x.a.place.key, x.a]));
  const combo = rankMode === 'combo';
  for (const x of results) {
    if (!x.r) continue;
    if (x.trip) {
      const L = x.trip.list;
      x.show = L.reduce((b, r) => (modeVal(r) > modeVal(b) ? r : b));       // aralıktaki en iyi an
      x.v = Math.round(L.reduce((t, r) => t + modeVal(r), 0) / L.length * 10) / 10;
    } else { x.show = x.r; x.v = modeVal(x.r); }
  }
  const typeOf = x => x.a?.type ?? (x.place?.water !== 'auto' ? x.place?.water : null);
  const shown = rankWater === 'all' ? results : results.filter(x => typeOf(x) === rankWater);
  const ok = shown.filter(x => x.r).sort((x, y) => (x.r.danger - y.r.danger) || ((y.v ?? -1) - (x.v ?? -1)));
  const bad = shown.filter(x => !x.r);
  rankInfo.clear();
  ok.forEach((x, i) => { if (x.a.place.key !== 'me') rankInfo.set(x.a.place.key, { rank: i + 1, score: x.v ?? 0, danger: x.r.danger }); });
  renderMapMarkers();
  const offline = results.some(x => x.a?.cond.offline);
  state.rankStale = offline || results.some(x => x.err);
  if (offline && !state.staleTold) { state.staleTold = true; toast('⚠️ Bazı meraların güncel verisi alınamadı, son kaydedilen veri gösteriliyor. ↻ ile tekrar deneyebilirsin.', 5000); }
  if (!offline) state.staleTold = false;
  const total = ok.length;
  if (!shown.length) {
    box.innerHTML = `<div class="rank-item empty">${WATER_FILTER[rankWater]} türünde meran yok. "Değiştir"den <b>Hepsi</b>'ni seç ya da bu türde bir mera ekle.</div>`;
    $('#rank-dots').innerHTML = '';
    $('#when-label').textContent = WHEN_SHORT[rankWhen] + ` · ${WATER_FILTER[rankWater]}`;
    return;
  }
  box.innerHTML =
    ok.map((x, i) => (x.trip ? tripCard(x, i, total) : spotCard(x, i, total))).join('') +
    bad.map(x => `<div class="rank-item bad"><b>${esc((x.a?.place || x.place).name)}</b><p class="warn">${esc(x.err?.message || 'Bu zaman için tahmin yok (en fazla 7 gün ileri).')}</p></div>`).join('');
  $('#when-label').textContent = WHEN_SHORT[rankWhen] + (rankWater !== 'all' ? ` · ${WATER_FILTER[rankWater]}` : '') + (combo ? ' · 💨' : '');
  $('.map-bar').classList.toggle('offline', offline);
  $('#rank-refresh').title = `Yenile · son güncelleme ${fmtTime(Math.min(...results.filter(x => x.a).map(x => x.a.cond.fetchedAt)))}${offline ? ' (çevrimdışı)' : ''}`;
  renderDots();
  if (!$('#here-card').hidden && state.hereA) toggleHereCard(true);
  // Önceki seçili kart duruyorsa ona dön, yoksa ilk kart
  const keep = selKey && box.querySelector(`.rank-item[data-key="${CSS.escape(selKey)}"]`);
  selectCard(keep ? selKey : ok[0]?.a.place.key, { scroll: true, pan: false, instant: true });
}

// —— Kart ↔ harita eşleşmesi ——
let selKey = null;
const WHEN_SHORT = { now: 'Şimdi', trip: 'Gidip geleceğim', 'o0.5': '+½ saat', o1: '+1 saat', o2: '+2 saat', o3: '+3 saat', o4: '+4 saat', o5: '+5 saat', o6: '+6 saat', o12: '+12 saat',
  evening: 'Bu akşam', morning: 'Yarın sabah', tomorrowEvening: 'Yarın akşam', best24: '24 saatin en iyisi', custom: 'Seçilen zaman' };
const cards = () => [...$('#rank-list').querySelectorAll('.rank-item[data-key]')];
function renderDots() {
  const n = cards().length;
  $('#rank-dots').innerHTML = n > 1 && n <= 12 ? cards().map(c => `<i data-dot="${esc(c.dataset.key)}"></i>`).join('') : '';
}
function selectCard(key, { scroll = false, pan = true, instant = false } = {}) {
  if (!key) return;
  const card = cards().find(c => c.dataset.key === key);
  if (!card) return;
  const changed = selKey !== key;
  selKey = key;
  cards().forEach(c => c.classList.toggle('sel', c === card));
  document.querySelectorAll('#rank-dots i').forEach(d => d.classList.toggle('on', d.dataset.dot === key));
  if (scroll) {
    const list = $('#rank-list');
    programmatic = Date.now();
    list.scrollTo({ left: card.offsetLeft - (list.clientWidth - card.offsetWidth) / 2, behavior: instant ? 'auto' : 'smooth' });
  }
  for (const [id, m] of spotMarkers) m.getElement()?.querySelector('.mk')?.classList.toggle('sel', id === key);
  if (pan && changed && map) {
    const a = state.analyses?.get(key);
    if (a) map.panTo([a.place.lat, a.place.lng], { animate: true });
  }
}
let programmatic = 0;
function onCarouselScroll() {
  if (Date.now() - programmatic < 700) return; // kendi kaydırmamız
  const list = $('#rank-list');
  const mid = list.scrollLeft + list.clientWidth / 2;
  const best = cards().reduce((b, c) => {
    const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
    return !b || d < b.d ? { c, d } : b;
  }, null);
  if (best) selectCard(best.c.dataset.key);
}

function spotCard(x, i, total, no = `${i + 1}<small>/${total}</small>`) {
  const { a, r } = x;
  const sp = speciesScores(r, a.type).slice(0, 3).map(s => s.name).join(', ');
  return `<button class="rank-item" data-key="${esc(a.place.key)}">${windBadge(r)}
    <span class="rank-top">
      <span class="rank-no">${no}</span>${catchBadge(a.place)}
      ${scorePill({ score: x.v })}<span class="rank-lbl">${scoreShort(x.v, r.danger)}</span>
    </span>
    <span class="rank-name">${state.newIds?.has(a.place.key) ? '<span class="tag new">🆕</span> ' : ''}${esc(a.place.name)} <span class="tag">${WATER_TYPES[a.type].icon} ${WATER_TYPES[a.type].label}</span>${a.place.by ? ` <span class="by">👤 ${esc(a.place.by)}</span>` : ''}</span>
    <span class="rank-time">${a.cond.offline ? `<b class="stale">⚠️ ${hh(new Date(a.cond.fetchedAt))} verisi</b> · ` : ''}${r.danger ? '⚠️ Güvenlik uyarısı · ' : ''}${dayShort(r.date)} ${hh(r.date)} · ${esc(summaryLine(r, a.type))}</span>
    ${miniWx(a, r.date)}
    <span class="rank-meta">🐟 ${esc(sp)}</span>
  </button>`;
}

// Seçili zamana göre bir yerin kart verisi (sıralamadaki hesapla aynı)
function cardData(a) {
  if (rankWhen === 'trip') {
    const { start, end } = tripWindow();
    const t = tripSummary(a, start, end);
    if (!t) return null;
    const L = t.list;
    return { a, trip: t, r: { ...t.best, score: t.avg, danger: t.danger, reasons: t.best.reasons },
      show: L.reduce((b, r) => (modeVal(r) > modeVal(b) ? r : b)), v: Math.round(L.reduce((s2, r) => s2 + modeVal(r), 0) / L.length * 10) / 10 };
  }
  const r = targetRow(a);
  return r ? { a, r, show: r, v: modeVal(r) } : null;
}

// —— Bulunduğum yer kartı (🎣 düğmesi: aç / kapat) ——
let hereSeq = 0;
// Bulunduğun yerde deniz/göl/dere yoksa: balık puanı yerine en yakın meraları göster
function noWaterCard(a) {
  const near = state.spots.filter(sp => Number.isFinite(sp.lat)).map(sp => ({ sp, d: distM(a.place, sp) })).sort((x, y) => x.d - y.d).slice(0, 2);
  const km = d => d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`;
  return `<div class="rank-item nowater">
    <span class="rank-top"><span class="rank-no">${hereNo(a)}</span></span>
    <span class="rank-name">${esc(a.place.name)}</span>
    <span class="rank-meta">🚫 Yakında deniz, göl ya da dere görünmüyor. Su kenarına gidince 📍'ye tekrar bas.</span>
    ${near.length ? `<span class="rank-meta">En yakın meraların: ${near.map(n => `<b>${esc(n.sp.name)}</b> (${km(n.d)})`).join(', ')}</span>` : ''}
  </div>`;
}
const hereNo = a => `📍${a.place.acc ? `<small> ±${a.place.acc} m</small>` : ''}`;
async function toggleHereCard(refresh = false) {
  const box = $('#here-card');
  if (!refresh && !box.hidden) { box.hidden = true; hereSeq++; $('#map-here').classList.remove('on'); return; }
  const seq = ++hereSeq;
  box.hidden = false; $('#map-here').classList.add('on');
  if (!refresh) box.innerHTML = '<div class="rank-item empty">📍 Konum bulunuyor…</div>';
  const p = refresh && state.hereA ? state.hereA.place : await locateMe({ onBetter: q => {
    // GPS daha hassas konum verdi: ±m'yi güncelle; 150 m'den fazla kaydıysa kartı yeniden hesapla
    if (seq !== hereSeq || !state.hereA) return;
    const moved = distM(q, state.hereA.place);
    state.hereA.place = { ...state.hereA.place, lat: q.lat, lng: q.lng, acc: q.acc };
    if (moved > 150) toggleHereCard(true); else { const el = box.querySelector('.rank-no small'); if (el) el.textContent = ` ±${q.acc} m`; }
  } });
  if (seq !== hereSeq) return;
  if (!p) { box.hidden = true; $('#map-here').classList.remove('on'); return; }
  if (!refresh) box.innerHTML = `<div class="rank-item empty">🌤️ Hava ve su bilgisi alınıyor… <small>(📍 ±${p.acc} m)</small></div>`;
  try {
    const nm = refresh ? null : await Promise.race([placeName(p.lat, p.lng), new Promise(r => setTimeout(() => r(null), 2500))]);
    const place = refresh ? { ...state.hereA.place, water: 'auto' } : { lat: p.lat, lng: p.lng, acc: p.acc, key: 'here', water: 'auto', name: nm?.name || 'Bulunduğun yer' };
    const a = await analyze(place, { waitWater: true, onWater: () => { if (seq === hereSeq && !$('#here-card').hidden) toggleHereCard(true); } });
    if (seq !== hereSeq) return;
    state.hereA = a;
    const x = cardData(a);
    if (a.guess?.noWater) { box.innerHTML = '<button class="here-close" aria-label="Kapat">✕</button>' + noWaterCard(a); return; }
    box.innerHTML = '<button class="here-close" aria-label="Kapat">✕</button>' +
      (x ? (x.trip ? tripCard(x, 0, 1, hereNo(a)) : spotCard(x, 0, 1, hereNo(a))) : '<div class="rank-item empty">Bu zaman için tahmin yok.</div>');
  } catch (e) {
    if (seq === hereSeq) box.innerHTML = `<button class="here-close" aria-label="Kapat">✕</button><div class="rank-item empty">${esc(e.message)}</div>`;
  }
}

// Kartta küçük rozet: bu meradaki av sayısı (kartın boyunu değiştirmez; ayrıntısı merayı açınca)
function catchBadge(place) {
  const list = catchesAt(place);
  if (!list.length) return '';
  const n = catchSummary(list).n;
  return `<span class="fish-badge" title="Bu merada ${n} balık tutuldu">🐟${n}</span>`;
}

function tripCard(x, i, total, no = `${i + 1}<small>/${total}</small>`) {
  const { a, trip: t } = x;
  const b = x.show;
  const val = modeVal;
  const sp = speciesScores(b, a.type).slice(0, 3).map(s => s.name).join(', ');
  return `<button class="rank-item" data-key="${esc(a.place.key)}">${windBadge({ ...b, windScore: t.avgWind })}
    <span class="rank-top">
      <span class="rank-no">${no}</span>${catchBadge(a.place)}
      ${scorePill({ score: x.v })}<span class="rank-lbl">ortalama</span>
    </span>
    <span class="rank-name">${esc(a.place.name)} <span class="tag">${WATER_TYPES[a.type].icon} ${WATER_TYPES[a.type].label}</span></span>
    <span class="rank-time">${t.danger ? '⚠️ Aralıkta tehlikeli saat var · ' : ''}En iyi an: <b>${hh(b.date)}</b> (${fmt(val(b), 1)})</span>
    <span class="trip-strip">${t.list.map(r => `<i style="background:${scoreColor(val(r))}" title="${hh(r.date)} · ${fmt(val(r), 1)}"></i>`).join('')}</span>
    <span class="trip-axis"><span>${hh(t.list[0].date)}</span><span>${hh(t.list[t.list.length - 1].date)}</span></span>
    <span class="rank-meta">${esc(summaryLine(b, a.type))}</span>
    <span class="rank-meta">🐟 ${esc(sp)}</span>
  </button>`;
}

// —— Grafikler (SVG, tek eksen, dokununca değer) ——
const chartData = new Map();
function lineChart(id, rows, series, { unit = '', decimals = 0, min0 = true, sel, bars = false } = {}) {
  const W = 340, H = 130, pl = 32, pr = 8, pt = 10, pb = 20;
  const vals = series.flatMap(s => rows.map(r => r[s.key])).filter(v => v != null);
  if (!vals.length || rows.length < 2) return '';
  if (bars && !vals.some(v => v > 0)) return `<p class="muted">Bu gün ${esc(series[0].label.toLocaleLowerCase('tr'))} beklenmiyor.</p>`;
  let lo = min0 ? 0 : Math.floor(Math.min(...vals) - 1);
  let hi = min0 ? Math.ceil(Math.max(...vals) * (decimals ? 10 : 1)) / (decimals ? 10 : 1) : Math.ceil(Math.max(...vals) + 1);
  if (hi - lo < 1e-6) hi = lo + 1;
  if (!min0 && (hi - lo) % 2) hi += 1; // orta çizgi tam sayı olsun
  const n = rows.length, iw = W - pl - pr, ih = H - pt - pb;
  const x = i => pl + (i * iw) / (n - 1);
  const y = v => pt + ih * (1 - (v - lo) / (hi - lo));
  const grid = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="grid"/>
    <text x="${pl - 4}" y="${y(v) + 3}" class="ax" text-anchor="end">${Math.abs(v - Math.round(v)) < 1e-6 ? Math.round(v) : v.toFixed(1)}</text>`).join('');
  const xl = rows.map((r, i) => (r.date.getHours() % 6 === 0 ? `<text x="${x(i)}" y="${H - 5}" class="ax" text-anchor="middle">${String(r.date.getHours()).padStart(2, '0')}</text>` : '')).join('');
  let marks = '';
  series.forEach(s => {
    if (bars) {
      const bw = Math.max(2, iw / n - 2);
      marks += rows.map((r, i) => r[s.key] ? `<rect x="${x(i) - bw / 2}" y="${y(r[s.key])}" width="${bw}" height="${y(lo) - y(r[s.key])}" rx="2" fill="${s.color}"/>` : '').join('');
    } else {
      let d = '', pen = false;
      rows.forEach((r, i) => { const v = r[s.key]; if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      marks += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
  });
  const si = sel ? rows.indexOf(sel) : -1;
  const selLine = si >= 0 ? `<line x1="${x(si)}" x2="${x(si)}" y1="${pt}" y2="${H - pb}" class="sel"/>` : '';
  chartData.set(id, { rows, series, unit, decimals, pl, iw, W });
  const legend = series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>` : '';
  return `<div class="chart" data-chart="${id}">${legend}
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(series.map(s => s.label).join(', '))} grafiği">
      ${grid}${xl}${selLine}${marks}<line class="xh" x1="0" x2="0" y1="${pt}" y2="${H - pb}" visibility="hidden"/>
      <rect x="${pl}" y="0" width="${iw}" height="${H}" fill="transparent" class="hit"/>
    </svg><div class="chart-note" id="tip-${id}">Grafiğe dokunun</div></div>`;
}

function chartIndex(chartEl, clientX) {
  const d = chartData.get(chartEl.dataset.chart);
  const svg = chartEl.querySelector('svg');
  const rect = svg.getBoundingClientRect();
  const vx = ((clientX - rect.left) / rect.width) * d.W;
  const i = Math.round(((vx - d.pl) / d.iw) * (d.rows.length - 1));
  return { d, svg, i: Math.max(0, Math.min(d.rows.length - 1, i)) };
}

function onChartMove(e) {
  const el = e.target.closest('.chart');
  if (!el) return;
  const { d, svg, i } = chartIndex(el, e.clientX);
  const r = d.rows[i];
  const xh = svg.querySelector('.xh');
  const xx = d.pl + (i * d.iw) / (d.rows.length - 1);
  xh.setAttribute('x1', xx); xh.setAttribute('x2', xx); xh.setAttribute('visibility', 'visible');
  el.querySelector('.chart-note').textContent = `${hh(r.date)} · ` +
    d.series.map(s => `${s.label} ${fmt(r[s.key], d.decimals)}${d.unit}`).join(' · ');
}

function dayInfo(rows, date) {
  const dr = rows.filter(r => r.date.toDateString() === date.toDateString());
  const daytime = dr.filter(r => r.isDay !== 0);
  const code = Math.max(...(daytime.length ? daytime : dr).map(r => r.code ?? 0));
  return {
    icon: weatherIcon(code, 1),
    max: Math.max(...dr.map(r => r.temp)), min: Math.min(...dr.map(r => r.temp)),
    rain: dr.reduce((a, r) => a + (r.precip || 0), 0), wind: Math.max(...dr.map(r => r.wind ?? 0)),
  };
}

// —— Meraya basılı tutunca menü ——
let menuSpot = null, lastMenuAt = 0;
function openSpotMenu(s) {
  const dlg = $('#spot-menu');
  lastMenuAt = Date.now();
  map?.closePopup();
  if (dlg.open) return;
  menuSpot = spotById(s.id) || s;
  $('#spot-menu-title').textContent = menuSpot.name;
  $('#spot-rename').value = menuSpot.name;
  dlg.showModal();
}

async function onSpotMenu(e) {
  if (e.target === $('#spot-menu')) { $('#spot-menu').close(); return; } // arka plana dokununca kapat
  const b = e.target.closest('[data-menu]');
  if (!b || !menuSpot) return;
  const s = menuSpot, act = b.dataset.menu;
  $('#spot-menu').close();
  if (act === 'detail') openDetail({ ...s, key: s.id });
  if (act === 'catch') openCatchDialog(null, { spotId: s.id });
  if (act === 'edit') openSpotDialog(s);
  if (act === 'directions') window.open(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`, '_blank', 'noopener');
  if (act === 'delete' && confirm(`“${s.name}” silinsin mi? (Bu meradaki av kayıtları silinmez)`)) {
    await db.remove('spots', s.id);
    rankInfo.delete(s.id);
    await loadData(); refreshAll();
    toast('Mera silindi');
  }
}

async function renameSpot(e) {
  e.preventDefault();
  const name = $('#spot-rename').value.trim();
  if (!name || !menuSpot) return;
  await db.put('spots', { ...menuSpot, name });
  $('#spot-menu').close();
  await loadData(); refreshAll();
  toast('Adı değiştirildi');
}

// —— Nokta detayı ——
let detail = null; // { a, day, sel }
let isTripOpen = false;
async function openDetail(place, fromTrip = false) {
  isTripOpen = fromTrip;
  const dlg = $('#wx-dialog');
  $('#wx-title').textContent = place.name;
  $('#wx-sub').textContent = `${Number(place.lat).toFixed(4)}, ${Number(place.lng).toFixed(4)}`;
  $('#wx-body').innerHTML = '<div class="empty">Yükleniyor… 🌊</div>';
  if (!dlg.open) dlg.showModal();
  try {
    const a = await analyze(place, { waitWater: true });
    const now = rowAt(a, new Date()) || hourAt(a.rows, new Date()) || a.rows[0];
    const tw = rankWhen === 'trip' && isTripOpen ? tripWindow() : null;
    const best = tw ? tripSummary(a, tw.start, tw.end)?.best : null;
    const sel = best || now;
    detail = { a, day: sel.date.toDateString(), sel, step: detail?.step || 30, trip: tw, tab: 'hourly' };
    renderDetail();
    $('#wx-dialog').scrollTop = 0;
  } catch (e) {
    $('#wx-body').innerHTML = `<div class="empty"><span class="big">⚠️</span>${esc(e.message)}</div>`;
  }
}

function metric(label, value, sub = '') {
  return `<div class="metric"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
}

function renderDetail() {
  const { a, sel } = detail;
  const { place, type, rows, cond } = a;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = cond.suns.filter(s => s.rise >= today).slice(0, 7);
  const dayRows = rows.filter(r => r.date.toDateString() === detail.day);
  const sun = cond.suns.find(s => s.rise.toDateString() === detail.day);
  const moon = moonPhase(sel.date);
  const mt = moonTimes(sel.date, place.lat, place.lng);
  const sol = solunar(new Date(sel.date.getTime() + 30 * 60000), place.lat, place.lng);
  const isNow = Math.abs(sel.date - Date.now()) < 15 * 60000;
  const selH = dayRows.includes(sel) ? sel : hourAt(dayRows, sel.date);
  // Şu andan itibaren (veya gidiş–dönüş aralığı) ayrıntılı zaman şeridi
  const fineFrom = detail.trip ? detail.trip.start : new Date();
  const fineMin = detail.trip ? (detail.trip.end - detail.trip.start) / 60000 : 6 * 60;
  const fine = slots(a, fineFrom, fineMin, detail.step);
  const fineAvg = fine.length ? fine.reduce((x, r) => x + modeVal(r), 0) / fine.length : null;
  const fineBest = fine.length ? fine.reduce((b, r) => (modeVal(r) > modeVal(b) ? r : b)) : null;
  const combo = rankMode === 'combo';
  const ringV = modeVal(sel);
  const spotId = place.key && place.key !== 'me' ? place.key : place.id;
  const isSpot = !!spotById(spotId);
  const p3 = hourAt(rows, new Date(sel.date.getTime() - 3 * 3600e3))?.pressure;
  const trend = p3 == null ? '' : sel.pressure - p3 <= -0.6 ? '↘ düşüyor' : sel.pressure - p3 >= 0.6 ? '↗ yükseliyor' : '→ sabit';
  const species = speciesScores(sel, type);
  // Bugün için sadece önümüzdeki saatleri öner
  const ahead = dayRows.filter(r => r.date.getTime() >= Date.now() - 3600e3);
  const pool = ahead.length ? ahead : dayRows;
  const advice = adviceText({ dayRows: pool, sel, type, place });
  // En iyi puanlar: yüksekten düşüğe; tehlikeli saatler hariç; 3. sıradaki puanla eşit olanlar da (en fazla 6)
  const safePool = pool.filter(r => !r.danger).length ? pool.filter(r => !r.danger) : pool;
  const ranked = [...safePool].sort((x, y) => (modeVal(y) - modeVal(x)) || (x.date - y.date));
  const cut = ranked[Math.min(2, ranked.length - 1)] ? Math.round(modeVal(ranked[Math.min(2, ranked.length - 1)]) * 10) : 0;
  const best = ranked.filter((r, i) => i < 3 || Math.round(modeVal(r) * 10) >= cut).slice(0, 6);
  const C1 = 'var(--s1)', C2 = 'var(--s2)';
  const tm = d => (d ? fmtTime(d) : '—');

  const myCatches = catchesAt(place);
  const TABS = [['hourly', '⏱️ Saatlik'], ['catches', `📒 Avlarım (${myCatches.length})`], ['species', '🐟 Türler'], ['charts', '📈 Grafikler'], ['detail', '🌤️ Ayrıntı']];
  const tab = TABS.some(([k]) => k === detail.tab) ? detail.tab : 'hourly';
  const tabHtml = {
    catches: () => {
      if (!myCatches.length) return `<div class="empty"><span class="big">📒</span>Bu merada henüz kayıtlı av yok.<br>Av eklerken "Mera" kısmından bu merayı seçin.</div>
        ${spotById(place.key || place.id) ? `<div class="popup-actions big"><button data-act="catch-spot" data-id="${esc(place.key || place.id)}">＋ Bu meraya av ekle</button></div>` : ''}`;
      const sm = catchSummary(myCatches);
      const nPh = spotPhotos(myCatches).length;
      return `${nPh ? `<h3 class="sec-h">📷 Fotoğraflar <small>(${nPh})</small></h3>${photoGrid(myCatches)}` : ''}
        <h3 class="sec-h">📒 Avlar</h3>
        <div class="tiles">
          <div class="tile"><div class="label">Toplam balık</div><div class="value">${sm.n}</div><div class="sub">${myCatches.length} kayıt</div></div>
          <div class="tile"><div class="label">En çok</div><div class="value" style="font-size:1.15rem">${esc(sm.species || '—')}</div><div class="sub">tür</div></div>
          <div class="tile"><div class="label">En iyi yem</div><div class="value" style="font-size:1.15rem">${esc(sm.bait || '—')}</div><div class="sub">bu merada</div></div>
          <div class="tile"><div class="label">En verimli saat</div><div class="value">${sm.hour != null ? String(sm.hour).padStart(2, '0') + ':00' : '—'}</div><div class="sub">${sm.biggest ? `en büyük ${esc(sm.biggest.species)} ${sm.biggest.length} cm` : ''}</div></div>
        </div>
        <div class="catch-list">${myCatches.map(c => {
          const url = photoUrl(c);
          return `<button class="catch-item" data-catch="${c.id}">${url ? thumbImg(url, c) : `<div class="catch-thumb">${findSpecies(c.species)?.emoji || '🐟'}</div>`}
            <div class="catch-body"><div class="catch-title">${esc(c.species)}${c.count > 1 ? ` <span class="tag">×${c.count}</span>` : ''}${c.released ? '<span class="tag">salındı</span>' : ''}</div>
            <div class="catch-meta">${esc([fmtDate(c.date), fmtTime(c.date), c.length && c.length + ' cm', c.bait].filter(Boolean).join(' · '))}</div></div></button>`;
        }).join('')}</div>
        ${spotById(place.key || place.id) ? `<div class="popup-actions big"><button data-act="catch-spot" data-id="${esc(place.key || place.id)}">＋ Bu meraya av ekle</button></div>` : ''}`;
    },
    hourly: () => `    <div class="card now-card">
      <div class="now-ico">${weatherIcon(sel.code, sel.isDay)}</div>
      <div class="now-main"><div class="now-t">${fmt(sel.temp)}°<small> hissedilen ${fmt(sel.feels)}°</small></div>
        <div class="now-w">${weatherWord(sel.code)} · ${sel.date.toLocaleDateString('tr-TR', { weekday: 'short' })} ${hh(sel.date)}</div></div>
      <div class="now-side"><div>${arrow(sel.windDir)} <b>${fmt(sel.wind)}</b> km/s</div><div class="muted">${windName(sel.windDir, true)} · hamle ${fmt(sel.gust)}</div>
        <div>💧 %${fmt(sel.rainProb)} · ${fmt(sel.precip, 1)} mm</div></div>
    </div>

    <div class="card fine-card"><h3>⏱️ ${detail.trip ? `Gidiş–dönüş: ${hh(detail.trip.start)} → ${hh(detail.trip.end)}` : 'Şu andan itibaren 6 saat'}</h3>
      <div class="fine-head">
        <span class="seg-mini">${[30, 15].map(m => `<button data-step="${m}" class="${detail.step === m ? 'active' : ''}">${m} dk</button>`).join('')}</span>
        ${fineAvg != null ? `<span class="muted">ortalama <b>${fmt(fineAvg, 1)}</b> · en iyi an <b>${hh(fineBest.date)}</b> (${fmt(fineBest.score, 1)})</span>` : ''}
      </div>
      <div class="hours wx-strip">${fine.map(r => `<button class="hour wxh ${sel.slot && r.date.getTime() === sel.date.getTime() ? 'now' : ''}" data-slot="${r.date.getTime()}">
        <div class="h">${hh(r.date)}</div>
        <div class="ico">${wxIcon(r)}</div><div class="wword">${weatherWord(r.code)}</div>
        <div class="t">${fmt(r.temp)}°</div>
        <div class="rain" title="Yağmur ihtimali %${fmt(r.rainProb)}"><span style="height:${Math.max(0, Math.min(100, r.rainProb ?? 0))}%"></span></div>
        <div class="rp">${rainText(r, 'mm/sa')}</div>
        <div class="w">${arrow(r.windDir)} ${fmt(r.wind)}</div>
        <div class="g">hamle ${fmt(r.gust)}</div>
        ${type === 'sea' && r.wave != null ? `<div class="g">🌊 ${fmt(r.wave, 1)}m</div>` : ''}
        <div class="sc ${scoreClass(modeVal(r))}">${combo ? '🎣💨' : '🎣'} ${fmt(modeVal(r), 1)}</div>
        ${r.danger ? '<div>⚠️</div>' : ''}
      </button>`).join('')}</div>
      <p class="chart-note">${fine.some(r => r.fine) ? '15 dakikalık model verisi kullanılıyor.' : 'Saatlik verilerin arası hesaplanarak gösteriliyor.'} Bir ana dokunarak seçin.</p>
    </div>

    <div class="card"><h3>🌤️ Saat saat hava</h3>
      <div class="hours wx-strip" id="wx-hours">${dayRows.map(r => `<button class="hour wxh ${r === selH && !sel.slot ? 'now' : ''}" data-t="${r.date.getTime()}">
        <div class="h">${hh(r.date)}</div>
        <div class="ico">${wxIcon(r)}</div><div class="wword">${weatherWord(r.code)}</div>
        <div class="t">${fmt(r.temp)}°</div>
        <div class="rain" title="Yağmur ihtimali %${fmt(r.rainProb)}"><span style="height:${Math.max(0, Math.min(100, r.rainProb ?? 0))}%"></span></div>
        <div class="rp">${rainText(r, 'mm')}</div>
        <div class="w">${arrow(r.windDir)} ${fmt(r.wind)}</div>
        <div class="g">hamle ${fmt(r.gust)}</div>
        ${type === 'sea' && r.wave != null ? `<div class="g">🌊 ${fmt(r.wave, 1)}m</div>` : ''}
        <div class="sc ${scoreClass(modeVal(r))}">${combo ? '🎣💨' : '🎣'} ${fmt(modeVal(r), 1)}</div>
        ${r.danger ? '<div>⚠️</div>' : ''}
      </button>`).join('')}</div>
      <p class="chart-note">Simge: o saatin <b>en olası</b> havası (🌫️ = sis). Mavi sütun ve 💧%: yağmur <b>ihtimali</b>. %50 üstü büyük ihtimalle yağar, %20–50 yağabilir. mm: yağarsa miktarı. Simge yağmur göstermese de ihtimal yüksekse köşesine 💧 eklenir. Ok: rüzgarın estiği yön, rakam km/s. 🎣: balık skoru. Bir saate dokunarak seçin.</p>
    </div>

    <div class="card"><h3>Günün en iyi saatleri <small class="muted">(en yüksek puandan)</small></h3><ul class="best-list">
      ${best.map((r, i) => `<li${i === 0 ? ' class="top"' : ''}><span>${i === 0 ? '🏆 ' : ''}${hh(r.date)} ${r.danger ? '⚠️' : ''}</span><b class="${scoreClass(modeVal(r))}">${fmt(modeVal(r), 1)}</b></li>`).join('')}
    </ul>${detail.day === new Date().toDateString() && ahead.length && ahead.length < 6 ? '<p class="chart-note">Bugün az saat kaldı; yarını görmek için üstten günü değiştir.</p>' : ''}</div>

`,
    species: () => `    <div class="card"><h3>🐟 Türlere göre tahmin (${hh(sel.date)})</h3>
      <div class="hbars species-bars">${species.map(s => `<div class="hbar">
        <span class="name">${esc(s.name)}</span>
        <span class="track"><span class="fill" style="display:block;width:${s.score * 10}%"></span></span>
        <span class="val">${fmt(s.score, 1)}</span>
        <span class="sp-note">${esc(s.notes.join(' · '))}</span></div>`).join('')}</div>
      <p class="chart-note">Tür puanı: genel skor + sezon + o türün sevdiği su sıcaklığı + aktif olduğu saat${type === 'sea' ? ' + dalga tercihi' : ''}.</p>
    </div>

`,
    charts: () => `    <div class="card"><h3>📈 Grafikler (${dayRows[0]?.date.toLocaleDateString('tr-TR', { weekday: 'long' }) || ''})</h3>
      <h4>${combo ? 'Balık + rüzgar puanı' : 'Balık puanı'}</h4>${lineChart('score', dayRows, [{ key: combo ? 'comboScore' : 'score', label: 'Puan', color: C1 }], { decimals: 1, sel: selH })}
      <h4>Rüzgar (km/s)</h4>${lineChart('wind', dayRows, [{ key: 'wind', label: 'Rüzgar', color: C1 }, { key: 'gust', label: 'Hamle', color: C2 }], { unit: ' km/s', sel: selH })}
      ${type === 'sea' && dayRows.some(r => r.wave != null)
        ? `<h4>Dalga (m)</h4>${lineChart('wave', dayRows, [{ key: 'wave', label: 'Dalga', color: C1 }, ...(dayRows.some(r => r.swell != null) ? [{ key: 'swell', label: 'Soluğan', color: C2 }] : [])], { unit: ' m', decimals: 1, sel: selH })}`
        : `<h4>Yağış (mm)</h4>${lineChart('rain', dayRows, [{ key: 'precip', label: 'Yağış', color: C1 }], { unit: ' mm', decimals: 1, sel, bars: true })}`}
      <h4>Sıcaklık (°C)</h4>${lineChart('temp', dayRows, [{ key: 'temp', label: 'Hava', color: C1 }, { key: 'waterTemp', label: type === 'sea' ? 'Deniz' : 'Su (tahmini)', color: C2 }], { unit: ' °C', min0: false, sel: selH })}
      <h4>Basınç (hPa)</h4>${lineChart('pres', dayRows, [{ key: 'pressure', label: 'Basınç', color: C1 }], { unit: ' hPa', min0: false, sel: selH })}
    </div>

`,
    detail: () => `<div class="card"><h3>Su tipi ve kıyı yönü</h3><div class="filter-row">
      <select id="wx-water">
        <option value="auto">Su tipi: otomatik (${WATER_TYPES[effectiveType({ water: 'auto' }, cond, a.guess)].label}${a.guess?.name ? ` · ${esc(a.guess.name)}` : ''})</option>
        ${Object.entries(WATER_TYPES).map(([k, v]) => `<option value="${k}" ${place.water === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
      </select>
      ${type === 'lake' && a.env?.lake ? `<select id="wx-lake">
        <option value="auto">Göl büyüklüğü: otomatik (${esc(LAKE_SIZES[(a.env.lake.source === 'manual' ? lakeSizeFor({ ...place, lakeSize: 'auto' }, a.guess || cachedWater(place.lat, place.lng)) : a.env.lake).size].label)})</option>
        ${Object.entries(LAKE_SIZES).map(([k, v]) => `<option value="${k}" ${place.lakeSize === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
      </select>` : ''}
    </div>
      ${type === 'lake' && a.env?.lake ? `<p class="shore-line">🏞️ Göl: <b>${esc(LAKE_SIZES[a.env.size].label)}</b> (${esc(lakeSourceText(a.env.lake))}). ${{ small: 'Küçük gölet havaya çabuk tepki verir: hava soğuyunca su da hızla serinler.', medium: 'Orta göl havayı birkaç gün geriden izler.', large: 'Büyük ve derin göl havaya yavaş tepki verir: ani soğumada su az serinler, sonbaharda havadan ılık kalır.' }[a.env.size]}</p>` : ''}
      <p class="shore-line">🧭 Suya bakış yönü: <b>${a.shoreInfo?.bearing != null ? dirName8(a.shoreInfo.bearing) : a.shoreInfo?.open ? 'her yanı su' : 'bulunamadı'}</b>${a.shoreInfo?.manual ? ' (elle seçildi)' : a.shoreInfo ? ' (otomatik)' : ''}
        ${a.shore != null && sel.windDir != null ? `<br>💨 Rüzgar şu an: <b>${{ onshore: 'sudan kıyınıza doğru', offshore: 'arkanızdan, karadan suya', cross: 'yandan' }[windRelation(sel.windDir, a.shore)]}</b> (${esc(windName(sel.windDir, true))})` : ''}
        <br><small>Yanlışsa meraya basılı tutup "Tüm bilgileri düzenle"den değiştirebilirsiniz.</small></p></div>
    <div class="card"><h3>🌤️ Ayrıntılı hava (${hh(sel.date)})</h3><div class="metrics">
      ${metric('Rüzgar', `${arrow(sel.windDir)} ${fmt(sel.wind)} km/s`, `${windName(sel.windDir)} · hamle ${fmt(sel.gust)}`)}
      ${metric('Hava', `${fmt(sel.temp)} °C`, `hissedilen ${fmt(sel.feels)} °C`)}
      ${metric('Su sıcaklığı', sel.waterTemp == null ? '—' : `${sel.waterTempEstimated ? '~' : ''}${fmt(sel.waterTemp)} °C`, sel.waterTempEstimated ? waterNote(a) : 'ölçülen deniz suyu')}
      ${type === 'sea' ? metric('Dalga', sel.wave == null ? '—' : `${fmt(sel.wave, 1)} m`, `periyot ${fmt(sel.wavePeriod, 0)} sn · soluğan ${fmt(sel.swell, 1)} m`) : ''}
      ${type === 'sea' ? metric('Akıntı', sel.current == null ? '—' : `${fmt(sel.current, 1)} km/s`, sel.currentDir == null ? '' : `yönü ${windName(sel.currentDir, true)} tarafı`) : ''}
      ${metric('Gökyüzü', `<span style="font-size:1rem">${weatherText(sel.code) || '—'}</span>`, `bulut %${fmt(sel.cloud)}`)}
      ${metric('Yağış', `${fmt(sel.precip, 1)} mm`, `ihtimal %${fmt(sel.rainProb)}`)}
      ${metric('Nem', `%${fmt(sel.humidity)}`, '')}
      ${metric('Görüş', sel.visibility == null ? '—' : `${fmt(sel.visibility / 1000, sel.visibility < 10000 ? 1 : 0)} km`, sel.visibility != null && sel.visibility < 1000 ? 'sis var' : '')}
      ${metric('UV indeksi', fmt(sel.uv, 1), sel.uv >= 6 ? 'yüksek, şapka/krem' : '')}
      ${metric('Basınç', `${fmt(sel.pressure)} hPa`, trend)}
      ${metric('Güneş', `<span style="font-size:1rem">${sun ? `${tm(sun.rise)} – ${tm(sun.set)}` : '—'}</span>`, 'doğuş – batış')}
      ${metric('Ay', `${moon.icon} %${moon.illum}`, moon.name)}
      ${metric('Ay doğuş/batış', `<span style="font-size:1rem">${tm(mt.rise)} / ${tm(mt.set)}</span>`, sol === 'major' ? 'şu an solunar büyük dönem' : sol === 'minor' ? 'şu an solunar küçük dönem' : '')}
    </div></div>

    <details class="res-note"><summary>ℹ️ Veriler ne kadar yerel?</summary>
      <p>Koordinat tam bu nokta. Güneş, ay ve alacakaranlık saatleri bu noktaya göre hesaplanıyor. Rüzgar, yağmur ve sıcaklık ise hava modelinin yaklaşık 7 km'lik bölge tahmini; sıcaklık yükseltiye göre düzeltiliyor. Dalga ve deniz suyu sıcaklığı yaklaşık 5–8 km'lik bölge tahmini; dar boğaz ve koylarda daha az hassas. Göl ve dere suyu sıcaklığı ölçülmüyor, son 5 günün havasından tahmin ediliyor (~). Yerel sağanakları ve rüzgarı kesen tepe ya da koyları model göremez.</p></details>`,
  };
  $('#wx-body').innerHTML = `
    ${cond.offline ? `<p class="warn">Çevrimdışı: ${new Date(cond.fetchedAt).toLocaleString('tr-TR')} tarihli veri.</p>` : ''}

    <p class="muted fresh">🕒 Güncel: ${fmtTime(cond.fetchedAt)} · ${WATER_TYPES[type].icon} ${WATER_TYPES[type].label} <button id="wx-refresh" class="btn small">↻ Yenile</button></p>
    ${cond.marineDist ? `<p class="warn">🌊 Bu noktada deniz modeli boş döndüğü için dalga ve deniz suyu sıcaklığı ~${cond.marineDist} km uzaktaki en yakın deniz noktasından alındı.</p>` : ''}
    ${type === 'sea' && !cond.seaDetected ? `<p class="warn">🌊 Bu nokta için dalga verisi bulunamadı. Puan dalgasız hesaplandı.</p>` : ''}

    <div class="chips day-chips">${days.map(s => { const di = dayInfo(rows, s.rise); return `<button data-day="${s.rise.toDateString()}" class="${s.rise.toDateString() === detail.day ? 'active' : ''}">
      <span class="dn">${s.rise.toDateString() === new Date().toDateString() ? 'Bugün' : s.rise.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })}</span>
      <span class="di">${di.icon}</span><span class="dt">${fmt(di.max)}° / ${fmt(di.min)}°</span>
      <span class="dr">${di.rain >= 0.5 ? `💧${fmt(di.rain, 0)} mm` : '💧0'} · 💨${fmt(di.wind)}</span></button>`; }).join('')}</div>

    <div class="card score-card">${windBadge(sel)}
      <div class="score-ring" style="border-color:${scoreColor(ringV)}">${fmt(ringV, 1)}<small>/ 10</small><small class="ring-kind">${combo ? '🎣💨' : '🎣'}</small></div>
      <div class="score-text"><strong>${scoreLabel(ringV, sel.danger)}</strong>
        <div class="muted">${sel.date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} ${hh(sel.date)}${isNow ? ' · şu an' : ''}</div>
        <ul>${sel.reasons.map(([v, t]) => `<li>${v > 0 ? '＋' : '－'} ${esc(t)}</li>`).join('')}</ul>
        ${sel.windScore != null ? `<p class="wind-line">💨 Rüzgar puanı <b>${fmt(sel.windScore, 1)}</b>: ${esc(windName(sel.windDir, true))} ${fmt(sel.wind)} km/s · ${esc(sel.windNotes.join(' · '))}</p>
        ${combo ? `<p class="wind-line">🎣💨 Halkadaki puan: <b>balık + rüzgar</b>. Rüzgar yönü etkisi: ${(sel.dirNotes || []).length ? esc(sel.dirNotes.map(([v, t]) => `${v > 0 ? '+' : '−'}${Math.abs(v)} ${t}`).join(' · ')) : 'yok'}</p>
          <p class="wind-line">🎣 Sadece balık puanı: <b>${fmt(sel.score, 1)}</b></p>` : ''}
        ${!combo && sel.comboScore != null ? `<p class="wind-line">🎣💨 Balık + rüzgar puanı <b>${fmt(sel.comboScore, 1)}</b>${(sel.dirNotes || []).length ? ': ' + esc(sel.dirNotes.map(([v, t]) => `${v > 0 ? '+' : '−'}${Math.abs(v)} ${t}`).join(' · ')) : ' (yön etkisi yok)'}</p>` : ''}` : ''}
      </div>
    </div>

    <div class="card advice"><h3>💡 Öneri</h3>${advice.map(t => `<p>${t}</p>`).join('')}</div>

    <div class="dtabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-dtab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div class="dtab-body">${tabHtml[tab]()}${tab === 'hourly' && myCatches.length ? `
      <div class="card spot-catches"><h3>📒 Bu meradaki avlar <small>(${catchSummary(myCatches).n} balık)</small></h3>
        ${photoGrid(myCatches, { max: 5, more: 'fotoğraf' })}
        <div class="catch-list mini">${myCatches.slice(0, 3).map(c => `<button class="catch-item" data-catch="${c.id}">${photoUrl(c) ? thumbImg(photoUrl(c), c) : `<div class="catch-thumb">${findSpecies(c.species)?.emoji || '🐟'}</div>`}
          <div class="catch-body"><div class="catch-title">${esc(c.species)}${c.count > 1 ? ` <span class="tag">×${c.count}</span>` : ''}</div>
          <div class="catch-meta">${esc([fmtDate(c.date), c.length && c.length + ' cm', c.bait, c.by && '👤 ' + c.by].filter(Boolean).join(' · '))}</div></div></button>`).join('')}</div>
        <button type="button" class="btn small block" data-dtab="catches">Tüm avlar ve fotoğraflar (${myCatches.length}) ›</button>
      </div>` : ''}</div>
    <div class="popup-actions big">
      <a href="https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}" target="_blank" rel="noopener">🧭 Google yol tarifi</a>
      <a href="https://maps.apple.com/?daddr=${place.lat},${place.lng}" target="_blank" rel="noopener">🍎 Apple Haritalar</a>
      ${isSpot ? `<button data-act="catch-spot" data-id="${esc(spotId)}">＋ Bu meraya av ekle</button>
                  <button data-act="edit-spot" data-id="${esc(spotId)}">✏️ Merayı düzenle</button>`
               : `<button id="wx-save-spot">📍 Mera olarak kaydet</button>`}
    </div>
    <p class="muted">Skor ve tür tahminleri, hava verisi ve balıkçılık bilgisine dayalı tahminlerdir; kesinlik içermez.</p>`;
  const cur = $('#wx-hours .hour.now');
  if (cur) cur.parentElement.scrollLeft = cur.offsetLeft - cur.parentElement.offsetLeft - 8;
}

async function onDetailClick(e) {
  const day = e.target.closest('[data-day]');
  if (day) {
    detail.day = day.dataset.day;
    const rows = detail.a.rows.filter(r => r.date.toDateString() === detail.day);
    detail.sel = rows.reduce((b, r) => (!b || r.score > b.score ? r : b), null) || detail.sel;
    renderDetail(); return;
  }
  const h = e.target.closest('.hour[data-t]');
  if (h) { detail.sel = detail.a.rows.find(r => r.date.getTime() === +h.dataset.t); renderDetail(); return; }
  const ci = e.target.closest('[data-catch]');
  if (ci) { openCatchDialog(state.catches.find(c => c.id === ci.dataset.catch)); return; }
  const gal = e.target.closest('[data-gallery]');
  if (gal) { const list = spotPhotos(catchesAt(detail.a.place)); openViewer(list.map(x => ({ src: x.src, cap: capOf(x.c) })), +gal.dataset.gallery); return; }
  const dt = e.target.closest('[data-dtab]');
  if (dt) { detail.tab = dt.dataset.dtab; renderDetail(); return; }
  const sl = e.target.closest('[data-slot]');
  if (sl) { detail.sel = rowAt(detail.a, new Date(+sl.dataset.slot)); detail.day = detail.sel.date.toDateString(); renderDetail(); return; }
  const st = e.target.closest('.seg-mini [data-step]');
  if (st) { detail.step = +st.dataset.step; renderDetail(); return; }
  if (e.target.id === 'wx-refresh') {
    const t = detail.sel.date.getTime();
    e.target.textContent = 'Yenileniyor…';
    try { detail.a = await analyze(detail.a.place, { force: true, waitWater: true }); } catch (err) { toast(err.message); }
    detail.sel = (detail.sel.slot ? rowAt(detail.a, new Date(t)) : detail.a.rows.find(r => r.date.getTime() === t)) || hourAt(detail.a.rows, new Date()) || detail.a.rows[0];
    renderDetail(); toast('Güncellendi'); return;
  }
  const ch = e.target.closest('.chart');
  if (ch) { const { d, i } = chartIndex(ch, e.clientX); detail.sel = d.rows[i]; renderDetail(); return; }
  if (e.target.id === 'wx-save-spot') {
    const { lat, lng, water } = detail.a.place;
    $('#wx-dialog').close();
    openSpotDialog(null, { lat, lng }, water);
  }
}

async function onDetailWaterChange(e) {
  if (e.target.id !== 'wx-water' && e.target.id !== 'wx-lake') return;
  const field = e.target.id === 'wx-water' ? 'water' : 'lakeSize';
  const place = { ...detail.a.place, [field]: e.target.value };
  const spot = spotById(place.key) || spotById(place.id);
  if (spot) { await db.put('spots', { ...spot, [field]: e.target.value }); await loadData(); refreshAll(); }
  const t = detail.sel.date.getTime();
  detail.a = await analyze(place, { waitWater: true });
  detail.sel = (detail.sel.slot ? rowAt(detail.a, new Date(t)) : detail.a.rows.find(r => r.date.getTime() === t)) || detail.a.rows[0];
  renderDetail();
}

// Haritada boş bir noktaya dokununca hızlı özet
async function mapPointPopup(latlng) {
  const pop = L.popup().setLatLng(latlng).setContent('Hesaplanıyor… 🎣').openOn(map);
  const place = { lat: latlng.lat, lng: latlng.lng, name: 'Seçilen nokta', water: 'auto' };
  const nameP = placeName(latlng.lat, latlng.lng);
  let nm = null;
  const draw = a => {
    const pname = nm?.name || 'Seçilen nokta';
    a.place.name = pname;
    const r = rowAt(a, new Date()) || hourAt(a.rows, new Date());
    const best = a.rows.filter(x => x.date >= new Date() && x.date <= new Date(Date.now() + 864e5)).reduce((b, x) => (!b || x.score > b.score ? x : b), null);
    pop.setContent(`<div class="pt-pop">${nm ? `<div class="pt-name">📍 <b>${esc(nm.name)}</b>${nm.area ? `<br><small>${esc(nm.area)}</small>` : ''}</div>` : ''}
      ${scorePill(r)} <b>${esc(scoreLabel(r.score, r.danger))}</b> ${windBadge(r)}<br>
      <small>${WATER_TYPES[a.type].icon} ${WATER_TYPES[a.type].label}${a.guess ? '' : ' <i>(su tipi bakılıyor…)</i>'} · şu an</small><br>
      <small>${esc(summaryLine(r, a.type))}</small><br>
      ${best ? `<small>24 saatin en iyisi: <b>${dayShort(best.date)} ${hh(best.date)}</b> (${fmt(best.score, 1)})</small>` : ''}
      <div class="popup-actions"><button data-act="wx-point" data-lat="${latlng.lat}" data-lng="${latlng.lng}" data-name="${esc(pname)}">Ayrıntılı tahmin</button>
      <button data-act="spot-here" data-lat="${latlng.lat}" data-lng="${latlng.lng}" data-name="${esc(nm?.name || '')}">📍 Mera kaydet</button></div></div>`);
  };
  try {
    let last = null;
    const onWater = async () => { if (!pop.isOpen()) return; try { last = await analyze(place, {}); draw(last); } catch { /* yok */ } };
    const a = await analyze(place, { waitWater: true, onWater });
    nm = await Promise.race([nameP, new Promise(r => setTimeout(() => r(null), 800))]); // ad hazırsa ekle
    if (!pop.isOpen()) return;
    last = a; draw(a);
    if (!nm) nameP.then(n => { if (n && pop.isOpen()) { nm = n; draw(last); } });
  } catch (e) { pop.setContent(esc(e.message)); }
}

// ————————————————— İstatistik —————————————————
let statsRange = 'all';
let statsWho = 'all';
function renderStats() {
  const since = statsRange === '30' ? Date.now() - 30 * 86400000
    : statsRange === 'year' ? new Date(new Date().getFullYear(), 0, 1).getTime() : 0;
  const mine = grp.group.code && statsWho === 'me';
  const cs = state.catches.filter(c => new Date(c.date).getTime() >= since && (!mine || c.by === grp.myName()));
  const box = $('#stats-content');
  const seg = (grp.group.code ? `<div class="seg">${[['all', '👥 Herkes'], ['me', `👤 Ben${grp.myName() ? ` (${esc(grp.myName())})` : ''}`]]
    .map(([k, l]) => `<button data-who="${k}" class="${statsWho === k ? 'active' : ''}">${l}</button>`).join('')}</div>` : '') +
    `<div class="seg">${[['all', 'Tümü'], ['year', 'Bu yıl'], ['30', 'Son 30 gün']]
    .map(([k, l]) => `<button data-range="${k}" class="${statsRange === k ? 'active' : ''}">${l}</button>`).join('')}</div>`;
  if (!cs.length) { box.innerHTML = seg + '<div class="empty"><span class="big">📊</span>Bu dönemde av kaydı yok.</div>'; return; }

  const n = c => c.count || 1;
  const total = cs.reduce((a, c) => a + n(c), 0);
  const days = new Set(cs.map(c => new Date(c.date).toDateString())).size;
  const biggest = cs.filter(c => c.length).sort((a, b) => b.length - a.length)[0];
  const group = keyFn => {
    const m = new Map();
    for (const c of cs) { const k = keyFn(c); if (k) m.set(k, (m.get(k) || 0) + n(c)); }
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const bySpecies = group(c => c.species);
  const byBait = group(c => c.bait);
  const bySpot = group(c => spotById(c.spotId)?.name);
  const byHour = Array(24).fill(0); cs.forEach(c => { byHour[new Date(c.date).getHours()] += n(c); });
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const byMonth = Array(12).fill(0); cs.forEach(c => { byMonth[new Date(c.date).getMonth()] += n(c); });
  const bestHour = byHour.indexOf(Math.max(...byHour));
  const released = cs.filter(c => c.released).reduce((a, c) => a + n(c), 0);

  const hbars = (rows, unit = 'av') => {
    if (!rows.length) return '<p class="muted">Henüz veri yok.</p>';
    const max = rows[0][1];
    return `<div class="hbars">${rows.slice(0, 8).map(([k, v]) => `<div class="hbar" title="${esc(k)}: ${v} ${unit}">
      <span class="name">${esc(k)}</span><span class="track"><span class="fill" style="display:block;width:${v / max * 100}%"></span></span>
      <span class="val">${v}</span></div>`).join('')}</div>`;
  };
  const vbars = (vals, labels, id, labelFn) => {
    const max = Math.max(...vals, 1);
    return `<div class="vbars" data-note="${id}">${vals.map((v, i) => `<div class="col" tabindex="0" data-tip="${esc(labelFn(i))}: ${v} av" title="${esc(labelFn(i))}: ${v} av">
      <div class="fill" style="height:${v / max * 100}%"></div></div>`).join('')}</div>
      <div class="vaxis">${labels.map(l => `<span>${l}</span>`).join('')}</div><p class="chart-note" id="${id}">Çubuğa dokunun.</p>`;
  };

  box.innerHTML = seg + `
    <div class="tiles">
      <div class="tile"><div class="label">Toplam balık</div><div class="value">${total}</div><div class="sub">${released} tanesi salındı</div></div>
      <div class="tile"><div class="label">Avlı gün</div><div class="value">${days}</div><div class="sub">gün başına ${(total / days).toFixed(1)}</div></div>
      <div class="tile"><div class="label">En büyük</div><div class="value">${biggest ? biggest.length + ' cm' : '—'}</div><div class="sub">${esc(biggest?.species || '')}</div></div>
      <div class="tile"><div class="label">En verimli saat</div><div class="value">${String(bestHour).padStart(2, '0')}:00</div><div class="sub">favori: ${esc(bySpecies[0][0])}</div></div>
    </div>
    <div class="card"><h3>Türlere göre</h3>${hbars(bySpecies)}</div>
    <div class="card"><h3>Saate göre</h3>${vbars(byHour, byHour.map((_, i) => i % 3 === 0 ? i : ''), 'note-hour', i => `${String(i).padStart(2, '0')}:00`)}</div>
    <div class="card"><h3>Aylara göre</h3>${vbars(byMonth, months.map(m => m[0]), 'note-month', i => months[i])}</div>
    <div class="card"><h3>En iyi yemler</h3>${hbars(byBait)}</div>
    <div class="card"><h3>En iyi meralar</h3>${hbars(bySpot)}</div>
    <div class="card"><h3>Rekorlar (en uzun)</h3><table class="records"><tr><th>Tür</th><th>Boy</th><th>Tarih</th></tr>
      ${bySpecies.map(([sp]) => cs.filter(c => c.species === sp && c.length).sort((a, b) => b.length - a.length)[0]).filter(Boolean)
        .map(c => `<tr><td>${esc(c.species)}</td><td>${c.length} cm</td><td>${new Date(c.date).toLocaleDateString('tr-TR')}</td></tr>`).join('')}
    </table></div>`;
}

// ————————————————— Rehber & Ayarlar —————————————————
let moreTab = 'settings', rigKind = 'sea';
function renderMore() {
  let checked = [];
  try { checked = JSON.parse(localStorage.getItem('checklist') || '[]'); } catch { /* yok */ }
  const TABS = [['settings', '⚙️ Ayarlar'], ['fish', '🐟 Balıklar'], ['knots', '🪢 Düğümler'], ['rigs', '🎣 Takımlar'], ['list', '🎒 Liste']];
  const body = {
    fish: () => `    <div class="card"><h3>🐟 Marmara balık rehberi</h3>
      ${SPECIES.filter(s => s.name !== 'Diğer').map(s => `<details class="species-card card">
        <summary>${s.emoji} ${esc(s.name)} ${s.minSize ? `<span class="min-size">min ${s.minSize} cm</span>` : ''}</summary>
        <dl><dt>Sezon</dt><dd>${esc(s.season)}</dd><dt>Nerede</dt><dd>${esc(s.where)}</dd>
        <dt>Yem</dt><dd>${esc(s.bait)}</dd><dt>Yöntem</dt><dd>${esc(s.method)}</dd>
        ${s.tip ? `<dt>İpucu</dt><dd>${esc(s.tip)}</dd>` : ''}</dl></details>`).join('')}
      <p class="muted">Asgari boylar amatör balıkçılık mevzuatına göre yaklaşık değerlerdir ve değişebilir.
      Amatör balıkçılıkta kişi başı günlük toplam av sınırı vardır. Güncel kurallar için Tarım ve Orman Bakanlığı'nın amatör avcılık tebliğini kontrol edin.</p>
    </div>

`,
    knots: () => `<p class="muted guide-intro">Her düğüme dokunun: adım adım çizimli anlatım. Mavi çizgi ana misina, turuncu çizgi misinanın ucu.</p>${renderKnots()}`,
    rigs: () => `<div class="seg-mini rig-kind">${[['sea', '🌊 Deniz'], ['lake', '🏞️ Göl / dere']].map(([k, l]) => `<button data-rig="${k}" class="${rigKind === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <p class="muted guide-intro">Takıma dokunun: şema, ölçüler ve kullanım. Ölçüler başlangıç içindir; balığın büyüklüğüne, akıntıya ve kamışınızın atar değerine göre ayarlayın.</p>${renderRigs(rigKind)}`,
    list: () => `    <div class="card checklist"><h3>🎒 Çıkmadan önce kontrol listesi</h3>
      ${CHECKLIST.map((item, i) => `<label class="check"><input type="checkbox" data-check="${i}" ${checked.includes(i) ? 'checked' : ''}> ${esc(item)}</label>`).join('')}
      <button class="btn small" id="check-reset" style="margin-top:10px">Listeyi sıfırla</button>
    </div>

`,
    settings: () => `${groupCard()}${installCard()}    <div class="card"><h3>💾 Yedekleme</h3>
      <p class="muted">${grp.group.code ? 'Bu yedek grubun kayıtlarını içerir.' : 'Verileriniz sadece bu telefonda saklanıyor.'} Telefonu değiştirmeden önce veya ara ara yedek alın.</p>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn" id="export-btn">⬇️ Yedek indir</button>
        <label class="btn" style="margin:0;color:var(--text)">⬆️ Yedek yükle<input type="file" id="import-file" accept="application/json,.json" hidden></label>
      </div>
      <p class="muted">${state.catches.length} av, ${state.spots.length} mera kayıtlı.</p>
    </div>

    <div class="card"><h3>ℹ️ Hakkında</h3>
      <p class="muted">Rastgele v1 · Kıyı balıkçıları için av günlüğü. Harita: © OpenStreetMap katkıcıları. Hava: Open-Meteo.</p>
    </div>`,
  };
  setTimeout(fillMembers, 0);
  $('#more-content').innerHTML = `<div class="dtabs more-tabs">${TABS.map(([k, l]) => `<button data-more="${k}" class="${k === moreTab ? 'active' : ''}">${l}</button>`).join('')}</div>${body[moreTab]()}`;
}

// ————————————————— Arkadaş grubu —————————————————
state.newIds = new Set();
async function setupGroup() {
  const code = grp.codeFromUrl();
  if (!code) return;
  if (!grp.groupReady()) { toast('Grup özelliği henüz kurulmadı. Kişisel kayıtlar gösteriliyor.', 5000); return; }
  if (!grp.myName(code)) {
    const gname = grp.joinedGroups().find(x => x.code === code)?.name || (await grp.groupInfo(code))?.name;
    const n = await askName(`👥 ${gname ? `"${gname}" grubuna` : 'Gruba'} hoş geldin! Bu grupta adın ne?`, grp.lastName(),
      { required: true, note: 'Bu grupta eklediğin meralarda ve avlarda bu ad görünür. Her grupta farklı ad kullanabilirsin.' });
    grp.setMyName(n, code);
  }
  document.body.classList.add('group-mode');
  $('#group-bar').hidden = false;
  await grp.enterGroup(code, onGroupEvent);
  grp.hello(true);
  renderGroupBar();
  updateTopH();
}

let reloadT = null;
function onGroupEvent(ev) {
  renderGroupBar();
  if (ev.error) toast('👥 ' + ev.error, 6000);
  if (ev.fresh?.length) {
    ev.fresh.forEach(f => { if (f.isNew) state.newIds.add(f.id); });
    const by = new Map();
    for (const f of ev.fresh.filter(x => x.isNew)) {
      const k = f.by; const o = by.get(k) || { spots: [], catches: 0 }; by.set(k, o);
      if (f.store === 'spots') o.spots.push(f.doc.name); else o.catches += 1;
    }
    const msg = [...by].map(([n, o]) => `${n}: ${[o.spots.length ? `yeni mera ${o.spots.slice(0, 2).join(', ')}${o.spots.length > 2 ? '…' : ''}` : '', o.catches ? `${o.catches} yeni av` : ''].filter(Boolean).join(', ')}`).join(' · ');
    if (msg) toast('👥 ' + msg, 6000);
  }
  if (ev.changed) {
    clearTimeout(reloadT);
    reloadT = setTimeout(async () => { await loadData(); refreshAll(); if (state.tab === 'map') renderRank(); if (state.tab === 'more') renderMore(); }, 150);
  }
}

function renderGroupBar() {
  const g = grp.group;
  if (!g.code) return;
  $('#group-name').textContent = g.name || 'Grup';
  $('#group-status').textContent = g.pending ? `⏳ ${g.pending} kayıt gönderilecek` : g.online ? '● güncel' : '○ sunucu uyanıyor / internet yok';
  $('#group-status').className = 'gb-status' + (g.online && !g.pending ? ' ok' : '');
}

function groupCard() {
  if (!grp.groupReady()) return `<div class="card"><h3>👥 Arkadaş grubu</h3><p class="muted">Grup özelliği henüz kurulmadı (sunucu adresi ayarlanınca açılacak).</p></div>`;
  const g = grp.group, list = grp.joinedGroups();
  const row = x => `<div class="group-row"><span><b>${esc(x.name)}</b>${x.code === g.code ? ' <span class="tag">şu an açık</span>' : ''}
    <br><small class="muted">Adın: <b>${esc(grp.myName(x.code) || '—')}</b> <button class="link-btn" data-gact="name" data-code="${x.code}">değiştir</button></small></span>
    <span class="row">${x.code === g.code ? '' : `<button class="btn small" data-gact="open" data-code="${x.code}">Aç</button>`}
    <button class="btn small" data-gact="share" data-code="${x.code}">📋 Link</button>
    <button class="btn small danger" data-gact="leave" data-code="${x.code}">Çık</button></span>
    <details class="members" data-members="${x.code}"${x.code === g.code ? ' open' : ''}><summary>👥 Gruptakiler</summary><div class="mem-list">yükleniyor…</div></details></div>`;
  return `<div class="card"><h3>👥 Arkadaş grubu</h3>
    <p class="group-what"><b>Ne işe yarar?</b> Arkadaşlarınla <b>ortak mera ve av defteri</b>. Biri mera ya da av eklediğinde hepiniz görürsünüz.</p>
    <ol class="group-steps"><li>Aşağıya grup adını yaz, <b>Oluştur</b>'a bas.</li><li>Link kopyalanır; WhatsApp grubunuza yapıştırın (sonra da <b>📋 Link</b> ya da üstteki <b>📋 Davet</b> ile kopyalayabilirsin).</li><li>Linke giren herkes aynı meraları ve avları görür, ekler, düzenler.</li></ol>
    <p class="muted">Kendi kişisel kayıtların ayrı kalır, grupla karışmaz.</p>
    ${list.length ? list.map(row).join('') : ''}
    <form id="group-create" class="row" style="margin-top:8px"><input id="group-new-name" placeholder="Yeni grup adı (ör. Bağırganlı Ekibi)" maxlength="40"><button class="btn primary small" type="submit">Oluştur</button></form>
  </div>`;
}

// Davet: sadece grup linkini kopyala (WhatsApp'a yönlendirme yok); kullanıcı istediği yere yapıştırır
// Ayarlar: her grubun üyeleri (ad, eklediği mera/av, son görülme)
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'şimdi' : m < 60 ? `${m} dk önce` : m < 1440 ? `${Math.round(m / 60)} sa önce` : `${Math.round(m / 1440)} gün önce`; };
async function fillMembers() {
  for (const el of document.querySelectorAll('[data-members]')) {
    const box = el.querySelector('.mem-list');
    const info = await grp.groupInfo(el.dataset.members);
    if (!el.isConnected) continue;
    if (!info) { box.textContent = 'Sunucuya ulaşılamadı (uyuyor olabilir), biraz sonra tekrar bak.'; continue; }
    const me = grp.deviceId();
    const list = info.members || [];
    el.querySelector('summary').textContent = `👥 Gruptakiler (${list.length})`;
    box.innerHTML = list.length ? list.map(m => `<div class="mem"><span class="mem-av">${esc((m.name || '?').slice(0, 1).toUpperCase())}</span>
      <span class="mem-main"><b>${esc(m.name)}</b>${m.id === me ? ' <span class="tag">sen</span>' : ''}<br><small class="muted">📍 ${m.spots} mera · 🐟 ${m.catches} av · ${ago(m.lastSeen)}</small></span></div>`).join('')
      : '<span class="muted">Henüz kimse görünmüyor. Linke girenler burada listelenir.</span>';
  }
}

async function shareGroup(code, name) {
  const url = grp.groupLink(code);
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch {
    // Eski tarayıcılar: gizli kutudan kopyala
    try { const t = document.createElement('textarea'); t.value = url; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch { /* yok */ }
  }
  if (ok) toast(`📋 "${name || 'Grup'}" linki kopyalandı. WhatsApp grubuna yapıştırabilirsin.`, 4000);
  else prompt('Linki kopyalayın:', url);
}

async function onGroupAction(act, code) {
  if (act === 'create') {
    const name = $('#group-new-name').value.trim() || 'Balık grubu';
    const by = await askName(`"${name}" grubunda adın ne?`, grp.lastName(), { required: true, note: 'Grupta eklediğin meralarda ve avlarda bu ad görünür.' });
    try {
      toast('Grup oluşturuluyor… (sunucu uyuyorsa 30 sn sürebilir)', 4000);
      const r = await grp.createGroup(name, by);
      renderMore();
      await shareGroup(r.code, r.name); // oluşturunca link kopyalanır
    } catch (e) { toast('Grup oluşturulamadı: ' + e.message, 5000); }
  }
  if (act === 'open') location.href = grp.groupLink(code);
  if (act === 'share') shareGroup(code, grp.joinedGroups().find(x => x.code === code)?.name);
  if (act === 'leave') {
    if (!confirm('Bu gruptan çıkılsın mı? Gruptaki kayıtlar silinmez, sadece bu telefondan kaldırılır. Link ile tekrar girebilirsin.')) return;
    if (code === grp.group.code) { await grp.leaveGroup(code); location.href = location.pathname; return; }
    await grp.leaveGroup(code); renderMore();
  }
  if (act === 'name') {
    const gname = grp.joinedGroups().find(x => x.code === code)?.name || 'Grup';
    const n = await askName(`"${gname}" grubundaki adın`, grp.myName(code) || grp.lastName(), { note: 'Sadece bu grupta, bundan sonra eklediklerinde görünür.' });
    if (n) { grp.setMyName(n, code); renderMore(); renderGroupBar(); }
  }
}

// Ad sorma penceresi (tarayıcının kutusu yerine)
function askName(title, value = '', { required = false, note = '' } = {}) {
  return new Promise(resolve => {
    const dlg = $('#name-dialog'), inp = $('#name-input'), err = $('#name-error');
    $('#name-title').textContent = title;
    $('#name-note').textContent = note || 'Eklediğin meralarda ve avlarda gruptakiler bu adı görür.';
    inp.value = value; err.hidden = true;
    $('#name-cancel').hidden = required; // zorunluysa vazgeçilemez
    const done = v => { dlg.close(); resolve(v); };
    $('#name-form').onsubmit = e => {
      e.preventDefault();
      const v = inp.value.trim();
      if (v.length < 2) { err.hidden = false; inp.focus(); return; }
      done(v);
    };
    $('#name-cancel').onclick = () => done(null);
    dlg.oncancel = e => { e.preventDefault(); if (!required) done(null); };
    dlg.showModal();
    setTimeout(() => inp.focus(), 50);
  });
}

const blobToDataUrl = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });

async function backupPayload() {
  const catches = await Promise.all(state.catches.map(async c => ({ ...c, photo: c.photo ? await blobToDataUrl(c.photo) : null,
    photos: await Promise.all(catchPhotos(c).map(async p => ({ id: p.id, url: p.url || null, data: p.blob ? await blobToDataUrl(p.blob) : null }))) })));
  const keep = {};
  for (const k of ['checklist', 'trip', 'rankMode', 'mapBase']) { const v = ls(k); if (v != null) keep[k] = v; }
  return { app: 'rastgele', version: 1, exportedAt: new Date().toISOString(), catches, spots: state.spots, settings: keep };
}
async function importPayload(data) {
  if (data?.app !== 'rastgele') throw new Error('Bu bir Rastgele yedeği değil');
  for (const s2 of data.spots || []) await db.put('spots', s2);
  for (const c of data.catches || []) {
    const photo = c.photo ? await (await fetch(c.photo)).blob() : null;
    const photos = Array.isArray(c.photos) ? await Promise.all(c.photos.map(async p => ({ id: p.id, ...(p.url ? { url: p.url } : {}),
      ...(p.data ? { blob: await (await fetch(p.data)).blob() } : {}) }))) : undefined;
    dropPhotoUrl(c.id);
    await db.put('catches', { ...c, photo, ...(photos ? { photos } : {}) });
  }
  for (const [k, v] of Object.entries(data.settings || {})) { try { if (ls(k) == null) localStorage.setItem(k, v); } catch { /* yok */ } }
  await loadData(); refreshAll();
}

async function exportBackup() {
  const blob = new Blob([JSON.stringify(await backupPayload())], { type: 'application/json' });
  const name = `rastgele-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Rastgele yedeği' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'rastgele') throw new Error('Bu bir Rastgele yedeği değil');
    const msg = grp.group.code
      ? `⚠️ Şu an GRUP açık (${grp.group.name}).\n\nBu yedekteki ${data.catches.length} av ve ${data.spots.length} mera GRUBA eklenecek ve gruptaki herkes görecek.\n\nKişisel yedeğini kendi kayıtlarına yüklemek istiyorsan önce "👤 Kişisel"e geç.\n\nYine de gruba eklensin mi?`
      : `${data.catches.length} av ve ${data.spots.length} mera eklensin mi? (Aynı kayıtlar güncellenir)`;
    if (!confirm(msg)) return;
    await importPayload(data);
    renderMore();
    toast('Yedek yüklendi');
  } catch (e) { toast('Yedek yüklenemedi: ' + e.message, 4000); }
}

// ————————————————— Kurulum ipucu (ana ekrana ekle) —————————————————
// Ana ekrana ekleme: tarayıcı destekliyorsa tek dokunuşla yükler, yoksa adım adım anlatır
let deferredInstall = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Tarayıcıyı tanı: hangi menüden ana ekrana eklenir?
// menu: 'tr' sağ üst ⋮, 'br' sağ alt ☰, 'bc' alt orta, 'share-b' altta Paylaş, 'share-t' üstte Paylaş
function detectBrowser() {
  const ua = navigator.userAgent;
  const android = /android/i.test(ua);
  if (isIOS()) {
    if (/CriOS/i.test(ua)) return { name: 'iPhone · Chrome', menu: 'share-t', steps: ['Adres çubuğunun sağındaki <b>Paylaş ⬆️</b> düğmesine dokunun.', 'Listeyi kaydırıp <b>“Ana Ekrana Ekle”</b>yi seçin.', 'Sağ üstte <b>Ekle</b>ye dokunun.', 'Bu seçenek yoksa (iOS 16.4 öncesi) sayfayı <b>Safari</b> ile açın.'] };
    if (/FxiOS/i.test(ua)) return { name: 'iPhone · Firefox', menu: 'br', steps: ['Sağ alttaki <b>☰ menü</b>ye dokunun.', '<b>Paylaş</b>ı seçin.', '<b>“Ana Ekrana Ekle”</b>ye dokunun, sonra <b>Ekle</b>.', 'Seçenek yoksa sayfayı <b>Safari</b> ile açın.'] };
    if (/EdgiOS/i.test(ua)) return { name: 'iPhone · Edge', menu: 'bc', steps: ['Alttaki <b>⋯ menü</b>ye dokunun.', '<b>Paylaş</b>ı seçin.', '<b>“Ana Ekrana Ekle”</b>ye dokunun, sonra <b>Ekle</b>.', 'Seçenek yoksa sayfayı <b>Safari</b> ile açın.'] };
    return { name: 'iPhone · Safari', menu: 'share-b', steps: ['Alttaki <b>Paylaş</b> düğmesine dokunun (⬆️ kare içinde ok).', 'Listeyi aşağı kaydırıp <b>“Ana Ekrana Ekle”</b>yi seçin.', 'Sağ üstte <b>Ekle</b>ye dokunun.'] };
  }
  const base = { android };
  if (/SamsungBrowser/i.test(ua)) return { ...base, name: 'Samsung Internet', menu: 'br', steps: ['Sağ alttaki <b>☰ menü</b>ye dokunun.', '<b>“Sayfayı ekle”</b> → <b>“Ana ekran”</b>ı seçin.', '<b>Ekle</b>ye dokunun.'] };
  if (/EdgA/i.test(ua)) return { ...base, name: 'Edge', menu: 'bc', steps: ['Alttaki <b>⋯ menü</b>ye dokunun.', '<b>“Telefona ekle”</b> ya da <b>“Ana ekrana ekle”</b>yi seçin.', '<b>Ekle / Yükle</b>ye dokunun.'] };
  if (/OPR|Opera/i.test(ua)) return { ...base, name: 'Opera', menu: 'tr', steps: ['Sağ üstteki <b>⋮ menü</b>ye dokunun.', '<b>“Ana ekrana ekle”</b>yi seçin.', '<b>Ekle</b>ye dokunun.'] };
  if (/YaBrowser/i.test(ua)) return { ...base, name: 'Yandex', menu: 'tr', steps: ['<b>⋮ menü</b>ye dokunun.', '<b>“Ana ekrana kısayol ekle”</b>yi seçin.', '<b>Ekle</b>ye dokunun.'] };
  if (/MiuiBrowser|XiaoMi/i.test(ua)) return { ...base, name: 'Xiaomi (Mi) Tarayıcı', menu: 'br', steps: ['Sağ alttaki <b>☰ menü</b>ye dokunun.', '<b>“Kısayol ekle”</b> ya da <b>“Ana ekrana ekle”</b>yi seçin.', 'Telefon izin isterse <b>izin verin</b>.'] };
  if (/HuaweiBrowser|HuaweiBrowser/i.test(ua)) return { ...base, name: 'Huawei Tarayıcı', menu: 'tr', steps: ['<b>⋮ menü</b>ye dokunun.', '<b>“Kısayol ekle”</b> / <b>“Ana ekrana ekle”</b>yi seçin.', '<b>Ekle</b>ye dokunun.'] };
  if (/Firefox/i.test(ua)) return { ...base, name: 'Firefox', menu: 'tr', steps: ['Adres çubuğunun yanındaki <b>⋮ menü</b>ye dokunun.', '<b>“Yükle”</b> ya da <b>“Ana ekrana ekle”</b>yi seçin.', '<b>Ekle</b>ye dokunun.'] };
  if (/Chrome/i.test(ua) && /Google Inc/.test(navigator.vendor) && !/wv\)/.test(ua)) return { ...base, name: 'Chrome', chrome: true, menu: 'tr', steps: ['Sağ üstteki <b>⋮ menü</b>ye dokunun.', '<b>“Uygulamayı yükle”</b> ya da <b>“Ana ekrana ekle”</b>yi seçin.', '<b>Yükle / Ekle</b>ye dokunun.'] };
  return { ...base, name: android ? 'Bu tarayıcı' : 'Bilgisayar', menu: 'tr', steps: android
    ? ['Tarayıcı menüsünü (genelde <b>⋮</b> ya da <b>☰</b>) açın.', '<b>“Ana ekrana ekle”</b>, <b>“Kısayol ekle”</b> ya da <b>“Uygulamayı yükle”</b>yi arayın.', 'Bu seçenek yoksa aşağıdaki <b>“Chrome’da aç”</b> düğmesine dokunun; Chrome’da tek dokunuşla eklenir.']
    : ['Adres çubuğunun sağındaki <b>yükle</b> simgesine (⊕ ya da 🖥️) tıklayın.', 'Yoksa tarayıcı menüsünden <b>“Uygulamayı yükle”</b>yi seçin.'] };
}

// Menünün yerini gösteren küçük telefon çizimi
function installFig(menu) {
  const spots = { tr: [104, 34, '⋮'], br: [104, 186, '☰'], bc: [64, 186, '⋯'], 'share-b': [64, 186, '⬆️'], 'share-t': [96, 34, '⬆️'] };
  const [x, y, ic] = spots[menu] || spots.tr;
  return `<svg viewBox="0 0 128 210" class="install-svg" aria-hidden="true">
    <rect x="4" y="4" width="120" height="202" rx="16" class="ph-body"/>
    <rect x="12" y="22" width="104" height="24" rx="6" class="ph-bar"/><text x="20" y="38" class="ph-url">🔒 rastgele</text>
    <rect x="12" y="172" width="104" height="28" rx="6" class="ph-bar"/>
    <rect x="18" y="58" width="92" height="10" rx="3" class="ph-line"/><rect x="18" y="76" width="70" height="10" rx="3" class="ph-line"/><rect x="18" y="94" width="84" height="10" rx="3" class="ph-line"/>
    <circle cx="${x}" cy="${y}" r="13" class="ph-hit"/><text x="${x}" y="${y + 5}" class="ph-ic" text-anchor="middle">${ic}</text>
    <circle cx="${x}" cy="${y}" r="13" class="ph-pulse"/>
  </svg>`;
}

const chromeIntent = () => `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end`;

async function installApp() {
  if (isStandalone()) { toast('Rastgele zaten ana ekranınızda ✅'); return; }
  if (deferredInstall) {
    deferredInstall.prompt();
    const r = await deferredInstall.userChoice.catch(() => null);
    deferredInstall = null;
    if (r?.outcome === 'accepted') { toast('Ana ekrana eklendi 🎣'); updateInstallUI(); }
    return;
  }
  const br = detectBrowser();
  $('#install-browser').textContent = br.name;
  $('#install-fig').innerHTML = installFig(br.menu);
  $('#install-steps').innerHTML = br.steps.map(t => `<li>${t}</li>`).join('');
  const chromeBtn = $('#install-chrome');
  chromeBtn.hidden = !(br.android && !br.chrome);
  chromeBtn.href = chromeIntent();
  $('#install-dialog').showModal();
}
function installCard() {
  if (isStandalone()) return `<div class="card"><h3>📲 Ana ekran</h3><p class="muted">Rastgele ana ekranınızda, uygulama olarak açık ✅</p></div>`;
  return `<div class="card install-card"><h3>📲 Ana ekrana ekle</h3>
    <p class="muted">Rastgele'yi telefonunuza uygulama gibi ekleyin: simgesine dokunup tek dokunuşla açılır, tam ekran çalışır, internet yokken de açılır ve kayıtlarınız silinmez.</p>
    <button class="btn primary" id="install-btn2">📲 Ana ekrana ekle</button></div>`;
}
function updateInstallUI() {
  const top = $('#top-install');
  if (top) top.hidden = isStandalone() || !!ls('hideInstall');
}
function setupInstallHint() {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; updateInstallUI(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; updateInstallUI(); toast('Ana ekrana eklendi 🎣'); });
  $('#top-install').addEventListener('click', installApp);
  $('#install-dialog-close').addEventListener('click', () => $('#install-dialog').close());
  $('#install-copy').addEventListener('click', async () => {
    const url = location.origin + location.pathname;
    try { await navigator.clipboard.writeText(url); toast('Bağlantı kopyalandı 📋'); }
    catch { prompt('Bağlantıyı kopyalayın:', url); }
  });
  updateInstallUI();
  const standalone = isStandalone();
  if (standalone || ls('hideInstall')) return;
  const hint = $('#install-hint');
  $('#install-text').textContent = 'Rastgele’yi ana ekrana ekleyin: uygulama gibi açılır.';
  $('#install-btn').hidden = false; hint.hidden = false;
  $('#install-btn').onclick = installApp;
  $('#install-close').onclick = () => {
    hint.hidden = true;
    try { localStorage.setItem('hideInstall', '1'); } catch { /* yok */ }
    updateInstallUI(); updateTopH();
    toast('Gizlendi. İstersen Rehber → ⚙️ Ayarlar\'dan yine ana ekrana ekleyebilirsin.', 4000);
  };
}

// ————————————————— Olaylar —————————————————
function bindEvents() {
  document.querySelectorAll('.bottom-nav button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#fab').addEventListener('click', () => openCatchDialog());
  document.addEventListener('click', e => {
    const v = e.target.closest('img[data-view]');
    if (!v) return;
    e.preventDefault(); e.stopPropagation();
    openPhoto(v.dataset.view);
  }, true);
  const pv = $('#photo-view');
  $('#pv-prev').addEventListener('click', e => { e.stopPropagation(); viewerStep(-1); });
  $('#pv-next').addEventListener('click', e => { e.stopPropagation(); viewerStep(1); });
  let pvX = null;
  pv.addEventListener('pointerdown', e => { pvX = e.clientX; });
  pv.addEventListener('pointerup', e => {
    if (pvX == null) return;
    const dx = e.clientX - pvX; pvX = null;
    if (Math.abs(dx) > 40) { viewerStep(dx < 0 ? 1 : -1); pv.dataset.swiped = Date.now(); }
  });
  pv.addEventListener('click', e => { if (e.target.closest('.pv-nav')) return; if (Date.now() - (+pv.dataset.swiped || 0) < 400) return; pv.close(); });
  pv.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') viewerStep(-1); if (e.key === 'ArrowRight') viewerStep(1); });
  $('#catch-search').addEventListener('input', renderCatches);
  $('#catch-list').addEventListener('click', e => {
    const item = e.target.closest('.catch-item');
    if (item) openCatchDialog(state.catches.find(c => c.id === item.dataset.id));
  });

  // Av formu
  $('#catch-form').addEventListener('submit', saveCatch);
  $('#catch-cancel').addEventListener('click', () => $('#catch-dialog').close());
  $('#catch-delete').addEventListener('click', deleteCatch);
  $('#catch-species').addEventListener('input', checkSize);
  $('#catch-length').addEventListener('input', checkSize);
  // Fotoğraf ekle (birden çok seçilebilir), kaldır, büyüt
  $('#catch-photos').addEventListener('change', async e => {
    if (e.target.id !== 'catch-photo') return;
    const files = [...e.target.files].slice(0, MAX_PHOTOS - editing.photos.length);
    if (e.target.files.length > files.length) toast(`En fazla ${MAX_PHOTOS} fotoğraf eklenebilir`);
    for (const f of files) {
      try { editing.photos.push({ id: db.newId().slice(0, 12), blob: await compressImage(f) }); } catch (err) { toast(err.message); }
    }
    renderEditPhotos();
  });
  $('#catch-photos').addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { e.preventDefault(); editing.photos.splice(+rm.dataset.rm, 1); renderEditPhotos(); return; }
    const v = e.target.closest('[data-epv]');
    if (v) openViewer(editing.photos.map(p => ({ src: editSrc(p), cap: '' })), +v.dataset.epv);
  });
  $('#catch-use-location').addEventListener('click', async () => {
    $('#catch-location-text').textContent = 'Konum alınıyor…';
    try { Object.assign(editing, await getPosition()); } catch (err) { toast(err.message); }
    updateLocationText();
  });

  // Mera formu
  $('#spot-form').addEventListener('submit', saveSpot);
  $('#spot-water').addEventListener('change', e => { $('#spot-lake-row').hidden = !['auto', 'lake'].includes(e.target.value); });
  $('#spot-cancel').addEventListener('click', () => $('#spot-dialog').close());
  $('#spot-delete').addEventListener('click', deleteSpot);
  $('#map-here').addEventListener('click', () => toggleHereCard());
  $('#here-card').addEventListener('click', e => {
    if (e.target.closest('.here-close')) { toggleHereCard(); return; }
    if (e.target.closest('.rank-item[data-key]') && state.hereA) openDetail(state.hereA.place, rankWhen === 'trip');
  });
  $('#map-search').addEventListener('submit', onMapSearch);
  $('#map-q').addEventListener('input', onMapTyping);
  $('#map-results').addEventListener('click', e => {
    const b = e.target.closest('[data-result]'); if (!b) return;
    if (b.dataset.result === 'close') { $('#map-results').hidden = true; $('#map-results').parentElement.classList.remove('open'); return; }
    goToPlace(state.searchResults[+b.dataset.result]);
  });
  try { localStorage.removeItem('recentSearches'); } catch { /* yok */ } // eski aramaları sil
  $('#map-fit').addEventListener('click', () => { initMap(); fitAll(); });


  // Harita popup düğmeleri
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const { act, id } = b.dataset;
    map?.closePopup();
    if (act === 'edit-spot' && $('#wx-dialog').open) $('#wx-dialog').close();
    if (act === 'edit-spot') openSpotDialog(spotById(id));
    if (act === 'edit-catch') openCatchDialog(state.catches.find(c => c.id === id));
    if (act === 'catch-spot') openCatchDialog(null, { spotId: id });
    if (act === 'wx-spot') { const sp = spotById(id); openDetail({ ...sp, key: sp.id }); }
    if (act === 'wx-point') openDetail({ lat: +b.dataset.lat, lng: +b.dataset.lng, name: b.dataset.name || 'Seçilen nokta', water: 'auto' });
    if (act === 'spot-here') openSpotDialog(null, { lat: +b.dataset.lat, lng: +b.dataset.lng }, 'auto', b.dataset.name || '');
  });

  // Tahmin
  $('#rank-when').addEventListener('click', e => {
    const b = e.target.closest('[data-when]');
    if (!b) return;
    rankWhen = b.dataset.when;
    document.querySelectorAll('#rank-when button').forEach(x => x.classList.toggle('active', x === b));
    $('#rank-custom-row').hidden = rankWhen !== 'custom';
    $('#trip-row').hidden = rankWhen !== 'trip';
    if (rankWhen === 'trip') renderTripRow();
    if (rankWhen === 'custom' && !$('#rank-custom').value) {
      const d = new Date(Date.now() + 864e5); d.setHours(18, 0, 0, 0);
      $('#rank-custom').value = toLocalInput(d);
    }
    renderRank();
    // Basit seçimlerde pencere kendiliğinden kapansın (gidip gelme / takvimde ayar gerekiyor)
    if (!['trip', 'custom'].includes(rankWhen)) setTimeout(() => $('#rank-dialog').close(), 180);
  });
  $('#rank-custom').addEventListener('change', () => renderRank());
  renderModeToggle();
  $('#rank-mode').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    rankMode = b.dataset.mode;
    try { localStorage.setItem('rankMode', rankMode); } catch { /* yok */ }
    renderModeToggle(); renderRank();
  });
  $('#trip-row').addEventListener('click', e => {
    const b = e.target.closest('[data-step]'); if (!b) return;
    const [k, d] = b.dataset.step.split(':');
    trip[k] = Math.round(Math.max(k === 'go' ? 0 : 0.5, Math.min(k === 'go' ? 48 : 24, trip[k] + parseFloat(d))) * 2) / 2;
    try { localStorage.setItem('trip', JSON.stringify(trip)); } catch { /* yok */ }
    renderTripRow(); renderRank();
  });
  // Hangi sular: Hepsi / Deniz / Göl / Nehir
  const paintWater = () => document.querySelectorAll('#rank-water [data-water]').forEach(b => b.classList.toggle('active', b.dataset.water === rankWater));
  paintWater();
  $('#rank-water').addEventListener('click', e => {
    const b = e.target.closest('[data-water]'); if (!b) return;
    rankWater = b.dataset.water;
    try { localStorage.setItem('rankWater', rankWater); } catch { /* yok */ }
    paintWater(); renderRank();
  });
  // Yenile: dönen simge, bitince sonuç yazısı
  $('#rank-refresh').addEventListener('click', async () => {
    const btn = $('#rank-refresh');
    if (btn.classList.contains('spin')) return;
    btn.classList.add('spin');
    const t0 = Date.now();
    try {
      await renderRank(true);
      while (rankBusy) await new Promise(r => setTimeout(r, 150)); // araya giren yeniden çizimler de bitsin
      // Hava servisinden bu basıştan sonra yeni veri geldi mi?
      const got = netStatus.ok >= t0, failed = netStatus.fail >= t0;
      toast(!got ? '⚠️ Hava servisine ulaşılamadı. İnternetini kontrol et; son kaydedilen veri gösteriliyor.'
        : failed || state.rankStale ? '⚠️ Bazı meralar güncellenemedi, son kaydedilen veri gösteriliyor.'
        : `✓ Güncellendi (${hh(new Date())})`, 3500);
    } catch { toast('Güncellenemedi. İnternet bağlantını kontrol et.', 3500); }
    finally { setTimeout(() => btn.classList.remove('spin'), Math.max(0, 600 - (Date.now() - t0))); }
  });
  $('#spot-menu').addEventListener('click', onSpotMenu);
  $('#spot-rename-form').addEventListener('submit', renameSpot);
  {
    let t = null, sx = 0, sy = 0, item = null;
    const list = $('#rank-list');
    list.addEventListener('pointerdown', e => {
      item = e.target.closest('.rank-item'); if (!item) return;
      sx = e.clientX; sy = e.clientY; clearTimeout(t);
      t = setTimeout(() => { const s = spotById(item.dataset.key); if (s) { item.dataset.lp = Date.now(); openSpotMenu(s); } }, 550);
    });
    list.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(t); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => list.addEventListener(ev, () => clearTimeout(t)));
    list.addEventListener('contextmenu', e => { const it = e.target.closest('.rank-item'); if (it) { e.preventDefault(); const s = spotById(it.dataset.key); if (s && !justLongPressed(it)) { it.dataset.lp = Date.now(); openSpotMenu(s); } } });
  }
  // Sürekli güncel: uygulamaya dönünce ve 10 dakikada bir yenile
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.tab === 'map') renderRank(); });
  setInterval(() => { if (!document.hidden && state.tab === 'map') renderRank(); }, TTL);
  // Kaydırma (ör. 24 saatlik şerit) dokunma sayılmasın
  let downXY = null, swiped = false, scrollT = null, fingerDown = false;
  $('#rank-list').addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; swiped = false; fingerDown = true; });
  $('#rank-list').addEventListener('pointermove', e => { if (downXY && Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 10) swiped = true; });
  ['pointerup', 'pointercancel'].forEach(ev => $('#rank-list').addEventListener(ev, () => { fingerDown = false; }));
  $('#rank-list').addEventListener('scroll', e => {
    if (fingerDown) swiped = true; // kayma sonrası yerine oturma dokunuşu engellemesin
    // Hava şeridi bir kez kaydırıldıysa ipucunu artık gösterme
    if (e.target.classList?.contains('mini-wx') && !document.body.classList.contains('wxhint-off')) {
      document.body.classList.add('wxhint-off');
      try { localStorage.setItem('wxHint', '0'); } catch { /* yok */ }
    }
  }, true);
  if (ls('wxHint') === '0') document.body.classList.add('wxhint-off');
  $('#rank-list').addEventListener('click', e => {
    const it = e.target.closest('.rank-item');
    if (!it || justLongPressed(it) || swiped) { swiped = false; return; }
    const a = state.analyses?.get(it.dataset.key);
    if (!a) return;
    if (selKey !== it.dataset.key) selectCard(it.dataset.key, { scroll: true });
    openDetail(a.place, rankWhen === 'trip');
  });
  $('#rank-list').addEventListener('scroll', () => { clearTimeout(scrollT); scrollT = setTimeout(onCarouselScroll, 90); }, { passive: true });
  $('#rank-dots').addEventListener('click', e => { const d = e.target.closest('[data-dot]'); if (d) selectCard(d.dataset.dot, { scroll: true }); });
  document.querySelectorAll('[data-open-rank]').forEach(b => b.addEventListener('click', () => $('#rank-dialog').showModal()));
  $('#rank-dialog-close').addEventListener('click', () => $('#rank-dialog').close());
  $('#rank-dialog').addEventListener('click', e => { if (e.target === $('#rank-dialog')) $('#rank-dialog').close(); });
  $('#wx-close').addEventListener('click', () => $('#wx-dialog').close());
  $('#wx-body').addEventListener('click', onDetailClick);
  $('#wx-body').addEventListener('change', onDetailWaterChange);
  $('#wx-body').addEventListener('pointermove', onChartMove);

  // İstatistik
  $('#stats-content').addEventListener('click', e => {
    const r = e.target.closest('[data-range]');
    if (r) { statsRange = r.dataset.range; renderStats(); return; }
    const w = e.target.closest('[data-who]');
    if (w) { statsWho = w.dataset.who; renderStats(); return; }
    const col = e.target.closest('.col');
    if (col) $('#' + col.parentElement.dataset.note).textContent = col.dataset.tip;
  });
  $('#stats-content').addEventListener('mouseover', e => {
    const col = e.target.closest('.col');
    if (col) $('#' + col.parentElement.dataset.note).textContent = col.dataset.tip;
  });

  // Rehber & ayarlar
  $('#more-content').addEventListener('change', e => {
    if (e.target.dataset.check != null) {
      const checked = [...document.querySelectorAll('[data-check]:checked')].map(x => +x.dataset.check);
      try { localStorage.setItem('checklist', JSON.stringify(checked)); } catch { /* yok */ }
    }
    if (e.target.id === 'import-file' && e.target.files[0]) importBackup(e.target.files[0]);
  });
  $('#more-content').addEventListener('submit', e => { if (e.target.id === 'group-create') { e.preventDefault(); onGroupAction('create'); } });
  $('#group-exit').addEventListener('click', () => { location.href = location.pathname; });
  $('#group-share').addEventListener('click', () => shareGroup(grp.group.code, grp.group.name));
  $('#more-content').addEventListener('click', e => {
    const mt = e.target.closest('[data-more]');
    if (mt) { moreTab = mt.dataset.more; renderMore(); window.scrollTo(0, 0); return; }
    const rk = e.target.closest('[data-rig]');
    if (rk) { rigKind = rk.dataset.rig; renderMore(); return; }
    if (e.target.closest('#install-btn2')) { installApp(); return; }
    if (e.target.id === 'export-btn') exportBackup();
    const ga = e.target.closest('[data-gact]');
    if (ga) onGroupAction(ga.dataset.gact, ga.dataset.code);
    if (e.target.id === 'check-reset') { try { localStorage.removeItem('checklist'); } catch { /* yok */ } renderMore(); }
  });
}

// ————————————————— Başlat —————————————————
async function init() {
  bindEvents();
  bindSugg();
  setupResize();
  setupInstallHint();
  await setupGroup(); // ?grup=KOD ile açıldıysa grubun veritabanına geç
  await loadData();
  refreshAll();
  showTab('map'); // uygulama her açılışta haritayla başlar
  db.requestPersistence();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();

try { localStorage.removeItem('radar'); } catch { /* yok */ } // kaldırılan radarın ayarı
