import * as db from './db.js';
import { SPECIES, BAITS, METHODS, CHECKLIST, findSpecies } from './data.js';
import { getConditions, windName, arrow, weatherText, weatherIcon, weatherWord, TTL } from './weather.js';
import { scoreHours, hourAt, moonPhase, solunar, scoreClass, scoreColor, scoreLabel, scoreShort, WATER_TYPES } from './fishscore.js';
import { speciesScores, adviceText, moonTimes } from './species-model.js';

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

function photoUrl(c) {
  if (!c.photo) return null;
  if (!state.photoUrls.has(c.id)) state.photoUrls.set(c.id, URL.createObjectURL(c.photo));
  return state.photoUrls.get(c.id);
}
function dropPhotoUrl(id) {
  const u = state.photoUrls.get(id);
  if (u) { URL.revokeObjectURL(u); state.photoUrls.delete(id); }
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Konum desteklenmiyor'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('Konum alınamadı. Tarayıcı ayarlarından konum iznini açın.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
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
function showTab(name) {
  state.tab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === `tab-${name}`));
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $('#page-title').textContent = $(`#tab-${name}`).dataset.title;
  $('#fab').hidden = name === 'more';
  if (name === 'map') { initMap(); renderRank(); }
  if (name === 'stats') renderStats();
  if (name === 'more') renderMore();
  try { localStorage.setItem('tab', name); } catch { /* yok */ }
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
    const thumb = url ? `<img class="catch-thumb" src="${url}" alt="">` : `<div class="catch-thumb">${sp?.emoji || '🐟'}</div>`;
    const meta = [fmtTime(c.date), c.length && `${c.length} cm`, c.weight && `${c.weight} g`, c.bait, spotById(c.spotId)?.name]
      .filter(Boolean).map(esc).join(' · ');
    html += `<button class="catch-item" data-id="${c.id}">${thumb}<div class="catch-body">
      <div class="catch-title">${esc(c.species)}${c.count > 1 ? ` <span class="tag">×${c.count}</span>` : ''}${c.released ? '<span class="tag">salındı</span>' : ''}</div>
      <div class="catch-meta">${meta}</div></div></button>`;
  }
  list.innerHTML = html;
}

// ————————————————— Av ekleme / düzenleme —————————————————
let editing = null; // { id, photo, lat, lng }

function fillSpotSelect(sel, selected) {
  sel.innerHTML = '<option value="">— Seçilmedi —</option>' +
    state.spots.map(s => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}

function openCatchDialog(c = null, preset = {}) {
  editing = c ? { id: c.id, photo: c.photo || null, lat: c.lat, lng: c.lng }
              : { id: null, photo: null, lat: preset.lat ?? null, lng: preset.lng ?? null };
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
  $('#catch-photo').value = '';
  showPhotoPreview(editing.photo);
  updateLocationText();
  checkSize();
  $('#catch-dialog').showModal();
}

function showPhotoPreview(blob) {
  const img = $('#catch-photo-preview');
  if (img.dataset.url) { URL.revokeObjectURL(img.dataset.url); delete img.dataset.url; }
  if (blob) {
    img.dataset.url = URL.createObjectURL(blob);
    img.src = img.dataset.url; img.hidden = false;
    $('#catch-photo-label').textContent = 'Değiştir';
  } else {
    img.hidden = true; img.removeAttribute('src');
    $('#catch-photo-label').textContent = '📷 Fotoğraf ekle';
  }
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
    photo: editing.photo,
    updatedAt: new Date().toISOString(),
  };
  dropPhotoUrl(rec.id);
  await db.put('catches', rec);
  try {
    localStorage.setItem('lastBait', rec.bait); localStorage.setItem('lastMethod', rec.method);
    localStorage.setItem('lastSpot', spotId || '');
  } catch { /* yok */ }
  $('#catch-dialog').close();
  await loadData(); refreshAll();
  toast(editing.id ? 'Güncellendi' : 'Rastgele! Av kaydedildi 🎣');
}

async function deleteCatch() {
  if (!editing.id || !confirm('Bu av kaydı silinsin mi?')) return;
  await db.remove('catches', editing.id);
  dropPhotoUrl(editing.id);
  $('#catch-dialog').close();
  await loadData(); refreshAll();
  toast('Silindi');
}

// ————————————————— Harita —————————————————
let map, spotLayer, catchLayer, meMarker, mapFitted = false;
const rankInfo = new Map(); // mera id -> { rank, score, danger }

function initMap() {
  if (!window.L) { $('#map').innerHTML = '<div class="empty">Harita yüklenemedi. İnternet bağlantınızı kontrol edin.</div>'; return; }
  if (!map) {
    map = L.map('map', { doubleClickZoom: false }).setView([DEFAULT_PLACE.lat, DEFAULT_PLACE.lng], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    spotLayer = L.layerGroup().addTo(map);
    catchLayer = L.layerGroup().addTo(map);
    L.control.layers(null, { 'Meralar': spotLayer, 'Avlar': catchLayer }, { collapsed: true }).addTo(map);
    const addAt = e => { if (Date.now() - lastMenuAt > 1200) openSpotDialog(null, e.latlng); };
    map.on('contextmenu', addAt);
    map.on('dblclick', addAt);
    map.on('click', e => mapPointPopup(e.latlng));
  }
  // Harita sekmesi görünür olduktan sonra boyutu düzelt, sonra meraları sığdır
  requestAnimationFrame(() => setTimeout(() => {
    map.invalidateSize();
    renderMapMarkers();
    if (!mapFitted) { fitAll(); mapFitted = true; }
  }, 60));
}

function fitAll() {
  if (!map) return;
  const pts = state.spots.length ? state.spots : state.catches.filter(c => c.lat != null);
  if (!pts.length) return;
  if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 14);
  else map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 15 });
}

function renderMapMarkers() {
  if (!map) return;
  spotLayer.clearLayers(); catchLayer.clearLayers();
  for (const s of state.spots) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const info = rankInfo.get(s.id);
    const html = `<div class="mk"><span class="mk-dot" style="background:${info ? scoreColor(info.score) : 'var(--muted)'}">${info ? info.rank : '•'}</span>` +
      `<span class="mk-name">${esc(s.name)}${info ? ` · ${fmt(info.score, 1)}` : ''}</span></div>`;
    const marker = L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: 'mk-wrap', html, iconSize: [30, 30], iconAnchor: [15, 15] }),
      zIndexOffset: info ? 1000 - info.rank : 0, title: s.name,
    });
    marker.on('click', () => { if (!justLongPressed(marker.getElement())) openDetail({ ...s, key: s.id }); });
    marker.on('add', () => { const el = marker.getElement(); if (el && !el.dataset.lpBound) { el.dataset.lpBound = 1; onLongPress(el, () => openSpotMenu(s)); } });
    marker.addTo(spotLayer);
  }
  for (const c of state.catches) {
    if (c.lat == null) continue;
    const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'fish-marker', html: findSpecies(c.species)?.emoji || '🐟', iconSize: [22, 22] }) });
    const url = photoUrl(c);
    m.bindPopup(`${url ? `<img src="${url}" style="width:160px;border-radius:8px;display:block;margin-bottom:4px">` : ''}
      <b>${esc(c.species)}</b>${c.length ? ` · ${c.length} cm` : ''}<br><small>${esc(fmtDate(c.date))} ${fmtTime(c.date)}</small>
      <div class="popup-actions"><button data-act="edit-catch" data-id="${c.id}">Aç</button></div>`);
    catchLayer.addLayer(m);
  }
}

async function locateMe() {
  try {
    const p = await getPosition();
    initMap();
    map.setView([p.lat, p.lng], 15);
    if (meMarker) meMarker.setLatLng([p.lat, p.lng]);
    else meMarker = L.circleMarker([p.lat, p.lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
    return p;
  } catch (e) { toast(e.message); return null; }
}

// ————————————————— Yer arama —————————————————
// OpenStreetMap Nominatim (göl, iskele, köy, ilçe…); ulaşılamazsa Open-Meteo yer araması.
// Nominatim kuralı gereği sadece "Ara"ya basınca arar (yazarken sürekli istek atmaz).
let searchMarker = null;
async function searchPlaces(q) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=tr&q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error();
    const j = await r.json();
    return j.map(x => ({
      name: x.name || x.display_name.split(',')[0], detail: x.display_name,
      lat: +x.lat, lng: +x.lon, bbox: x.boundingbox ? x.boundingbox.map(Number) : null,
    }));
  } catch {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=tr`);
    if (!r.ok) throw new Error('Yer araması yapılamadı. İnternet bağlantınızı kontrol edin.');
    const j = await r.json();
    return (j.results || []).map(x => ({ name: x.name, detail: [x.admin2, x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lng: x.longitude, bbox: null }));
  }
}

function recentSearches() { try { return JSON.parse(ls('recentSearches') || '[]'); } catch { return []; } }
function renderRecent() {
  const r = recentSearches();
  $('#map-recent').innerHTML = r.length ? '<span class="muted">Son:</span>' + r.map((x, i) => `<button type="button" data-recent="${i}">📌 ${esc(x.name)}</button>`).join('') : '';
}

function goToPlace(p) {
  initMap();
  if (!map) return;
  $('#map-results').hidden = true;
  if (p.bbox && p.bbox.every(Number.isFinite)) map.fitBounds([[p.bbox[0], p.bbox[2]], [p.bbox[1], p.bbox[3]]], { maxZoom: 15, padding: [20, 20] });
  else map.setView([p.lat, p.lng], 13);
  if (searchMarker) map.removeLayer(searchMarker);
  searchMarker = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'spot-marker', html: '📌', iconSize: [26, 26], iconAnchor: [6, 26] }), zIndexOffset: 2000 })
    .addTo(map)
    .bindPopup(`<b>${esc(p.name)}</b><br><small>${esc(p.detail || '')}</small>
      <div class="popup-actions"><button data-act="spot-here" data-lat="${p.lat}" data-lng="${p.lng}" data-name="${esc(p.name)}">📍 Buraya mera ekle</button>
      <button data-act="wx-point" data-lat="${p.lat}" data-lng="${p.lng}">🎯 Tahmin</button></div>
      <small class="muted">İpucu: yakınlaştırıp tam kıyıya dokunun veya basılı tutun.</small>`)
    .openPopup();
  const list = [p, ...recentSearches().filter(x => x.name !== p.name)].slice(0, 5);
  try { localStorage.setItem('recentSearches', JSON.stringify(list)); } catch { /* yok */ }
  renderRecent();
  document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function onMapSearch(e) {
  e.preventDefault();
  const q = $('#map-q').value.trim();
  const box = $('#map-results');
  if (q.length < 2) return;
  $('#map-q').blur();
  box.hidden = false;
  box.innerHTML = '<div class="muted">Aranıyor…</div>';
  try {
    const res = await searchPlaces(q);
    state.searchResults = res;
    box.innerHTML = res.length
      ? res.map((p, i) => `<button type="button" class="result" data-result="${i}"><b>${esc(p.name)}</b><small>${esc(p.detail)}</small></button>`).join('') +
        '<button type="button" class="result close" data-result="close">✕ Kapat</button>'
      : `<div class="muted">“${esc(q)}” bulunamadı. Farklı yazmayı deneyin (örn. “Akyazı, Sakarya”).</div>`;
    if (res.length === 1) goToPlace(res[0]);
  } catch (err) { box.innerHTML = `<div class="warn">${esc(err.message)}</div>`; }
}

// ————————————————— Mera ekleme —————————————————
let editingSpot = null;
function openSpotDialog(s, latlng, water, name = '') {
  editingSpot = s ? { ...s } : { id: null, lat: latlng.lat, lng: latlng.lng };
  $('#spot-dialog-title').textContent = s ? 'Merayı düzenle' : 'Yeni Mera';
  $('#spot-name').value = s?.name || name;
  $('#spot-type').value = s?.type || 'İskele';
  $('#spot-water').value = s?.water || water || 'auto';
  $('#spot-notes').value = s?.notes || '';
  $('#spot-coords').textContent = `📍 ${editingSpot.lat.toFixed(5)}, ${editingSpot.lng.toFixed(5)}`;
  $('#spot-delete').hidden = !s;
  $('#spot-dialog').showModal();
}

async function saveSpot(e) {
  e.preventDefault();
  const rec = { ...editingSpot, id: editingSpot.id || db.newId(), name: $('#spot-name').value.trim(),
    lat: Number(editingSpot.lat), lng: Number(editingSpot.lng),
    type: $('#spot-type').value, water: $('#spot-water').value, notes: $('#spot-notes').value.trim(), createdAt: editingSpot.createdAt || new Date().toISOString() };
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
const hh = d => `${String(d.getHours()).padStart(2, '0')}:00`;
const dayShort = d => d.toLocaleDateString('tr-TR', { weekday: 'short' });
const effectiveType = (place, cond) => place.water && place.water !== 'auto' ? place.water : (cond.seaDetected ? 'sea' : 'lake');

async function analyze(place, opts) {
  const cond = await getConditions(place.lat, place.lng, opts);
  const type = effectiveType(place, cond);
  return { place, cond, type, rows: scoreHours(cond, type, place.lat, place.lng) };
}

function summaryLine(r, type) {
  return [
    `${windName(r.windDir, true)} ${fmt(r.wind)} km/s`,
    type === 'sea' && r.wave != null ? `dalga ${fmt(r.wave, 1)} m` : null,
    r.waterTemp != null ? `su ${r.waterTempEstimated ? '~' : ''}${fmt(r.waterTemp)} °C` : null,
    weatherText(r.code),
  ].filter(Boolean).join(' · ');
}

const scorePill = r => `<span class="score-pill" style="background:${scoreColor(r.score)}">${fmt(r.score, 1)}</span>`;

// —— Sıralama ——
let rankWhen = 'now';
const WHEN_LABEL = { now: 'şu an', h1: '1 saat sonra', h3: '3 saat sonra', h6: '6 saat sonra', h12: '12 saat sonra',
  evening: 'bu akşam', morning: 'yarın sabah', tomorrowEvening: 'yarın akşam', best24: '24 saatin en iyisi', custom: 'seçilen zaman' };

function targetRow(a) {
  const now = new Date();
  const { rows, cond } = a;
  const sunOn = offset => cond.suns.find(s => s.rise.toDateString() === new Date(now.getTime() + offset * 864e5).toDateString());
  const hours = { h1: 1, h3: 3, h6: 6, h12: 12 }[rankWhen];
  if (hours) return hourAt(rows, new Date(now.getTime() + hours * 3600e3));
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
  return hourAt(rows, now);
}

let rankSeq = 0;
async function renderRank(force = false) {
  const box = $('#rank-list');
  const places = state.spots.filter(s => Number.isFinite(s.lat)).map(s => ({ ...s, key: s.id }));
  if ($('#rank-me').checked) {
    try { const p = await getPosition(); places.unshift({ ...p, name: '📍 Konumum', key: 'me', water: 'auto' }); }
    catch (e) { toast(e.message); }
  }
  if (!places.length) {
    box.innerHTML = `<div class="empty"><span class="big">🎯</span>Henüz mera yok.<br>Yukarıdaki haritada balık tuttuğunuz yerlere
      uzun basın veya <b>＋ Mera ekle</b>'ye dokunun. Eklediğiniz bütün meralar burada en iyiden en kötüye sıralanır.</div>`;
    return;
  }
  const seq = ++rankSeq;
  if (!box.querySelector('.rank-item')) box.innerHTML = '<div class="empty">Meralar hesaplanıyor… 🎣</div>';
  const results = await Promise.all(places.map(p => analyze(p, { force }).then(a => ({ a, r: targetRow(a) }), err => ({ place: p, err }))));
  if (seq !== rankSeq) return;
  state.analyses = new Map(results.filter(x => x.a).map(x => [x.a.place.key, x.a]));
  const ok = results.filter(x => x.r).sort((x, y) => (x.r.danger - y.r.danger) || (y.r.score - x.r.score));
  const bad = results.filter(x => !x.r);
  rankInfo.clear();
  ok.forEach((x, i) => { if (x.a.place.key !== 'me') rankInfo.set(x.a.place.key, { rank: i + 1, score: x.r.score, danger: x.r.danger }); });
  renderMapMarkers();
  const offline = results.some(x => x.a?.cond.offline);
  box.innerHTML = (offline ? '<p class="warn">Çevrimdışı: kayıtlı son veriler gösteriliyor.</p>' : '') +
    `<p class="muted rank-head">${ok.length} mera · ${WHEN_LABEL[rankWhen]} için sıralandı · son güncelleme ${fmtTime(Math.min(...results.filter(x => x.a).map(x => x.a.cond.fetchedAt)))}<br>Basılı tutun: adını değiştir / sil</p>` +
    ok.map((x, i) => {
      const { a, r } = x;
      const top = r.reasons.slice(0, 3).map(([v, t]) => `${v > 0 ? '＋' : '－'} ${esc(t)}`).join('<br>');
      const sp = speciesScores(r, a.type).slice(0, 3).map(s => s.name).join(', ');
      return `<button class="rank-item" data-key="${esc(a.place.key)}">
        <span class="rank-no">${i + 1}</span>
        <span class="rank-score">${scorePill(r)}<small>${scoreShort(r.score, r.danger)}</small></span>
        <span class="rank-body">
          <span class="rank-name">${esc(a.place.name)} <span class="tag">${WATER_TYPES[a.type].icon} ${WATER_TYPES[a.type].label}</span></span>
          <span class="rank-time">${r.danger ? '⚠️ Güvenlik uyarısı · ' : ''}${dayShort(r.date)} ${hh(r.date)}</span>
          <span class="rank-meta">${esc(summaryLine(r, a.type))}</span>
          <span class="rank-meta">🐟 ${esc(sp)}</span>
          <span class="rank-why">${top}</span>
        </span></button>`;
    }).join('') +
    bad.map(x => `<div class="card"><b>${esc((x.a?.place || x.place).name)}</b><p class="warn">${esc(x.err?.message || 'Bu zaman için tahmin yok (en fazla 7 gün ileri).')}</p></div>`).join('');
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
async function openDetail(place) {
  const dlg = $('#wx-dialog');
  $('#wx-title').textContent = place.name;
  $('#wx-sub').textContent = `${Number(place.lat).toFixed(4)}, ${Number(place.lng).toFixed(4)}`;
  $('#wx-body').innerHTML = '<div class="empty">Yükleniyor… 🌊</div>';
  if (!dlg.open) dlg.showModal();
  try {
    const a = await analyze(place);
    const now = hourAt(a.rows, new Date()) || a.rows[0];
    detail = { a, day: now.date.toDateString(), sel: now };
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
  const nowRow = hourAt(rows, new Date());
  const spotId = place.key && place.key !== 'me' ? place.key : place.id;
  const isSpot = !!spotById(spotId);
  const p3 = rows[rows.indexOf(sel) - 3]?.pressure;
  const trend = p3 == null ? '' : sel.pressure - p3 <= -0.6 ? '↘ düşüyor' : sel.pressure - p3 >= 0.6 ? '↗ yükseliyor' : '→ sabit';
  const species = speciesScores(sel, type);
  // Bugün için sadece önümüzdeki saatleri öner
  const ahead = dayRows.filter(r => r.date.getTime() >= Date.now() - 3600e3);
  const pool = ahead.length ? ahead : dayRows;
  const advice = adviceText({ dayRows: pool, sel, type, place });
  const best = [...pool].sort((x, y) => y.score - x.score).slice(0, 3).sort((x, y) => x.date - y.date);
  const C1 = 'var(--s1)', C2 = 'var(--s2)';
  const tm = d => (d ? fmtTime(d) : '—');

  $('#wx-body').innerHTML = `
    ${cond.offline ? `<p class="warn">Çevrimdışı: ${new Date(cond.fetchedAt).toLocaleString('tr-TR')} tarihli veri.</p>` : ''}
    <div class="filter-row">
      <select id="wx-water">
        <option value="auto">Su tipi: otomatik (${WATER_TYPES[cond.seaDetected ? 'sea' : 'lake'].label})</option>
        ${Object.entries(WATER_TYPES).map(([k, v]) => `<option value="${k}" ${place.water === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
      </select>
    </div>
    <p class="muted fresh">Son güncelleme ${fmtTime(cond.fetchedAt)} · Open-Meteo (en iyi model otomatik) <button id="wx-refresh" class="btn small">↻ Yenile</button></p>
    <div class="chips day-chips">${days.map(s => { const di = dayInfo(rows, s.rise); return `<button data-day="${s.rise.toDateString()}" class="${s.rise.toDateString() === detail.day ? 'active' : ''}">
      <span class="dn">${s.rise.toDateString() === new Date().toDateString() ? 'Bugün' : s.rise.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })}</span>
      <span class="di">${di.icon}</span><span class="dt">${fmt(di.max)}° / ${fmt(di.min)}°</span>
      <span class="dr">${di.rain >= 0.5 ? `💧${fmt(di.rain, 0)} mm` : '💧0'} · 💨${fmt(di.wind)}</span></button>`; }).join('')}</div>

    <div class="card now-card">
      <div class="now-ico">${weatherIcon(sel.code, sel.isDay)}</div>
      <div class="now-main"><div class="now-t">${fmt(sel.temp)}°<small> hissedilen ${fmt(sel.feels)}°</small></div>
        <div class="now-w">${weatherWord(sel.code)} · ${sel.date.toLocaleDateString('tr-TR', { weekday: 'short' })} ${hh(sel.date)}</div></div>
      <div class="now-side"><div>${arrow(sel.windDir)} <b>${fmt(sel.wind)}</b> km/s</div><div class="muted">${windName(sel.windDir, true)} · hamle ${fmt(sel.gust)}</div>
        <div>💧 %${fmt(sel.rainProb)} · ${fmt(sel.precip, 1)} mm</div></div>
    </div>

    <div class="card"><h3>🌤️ Saat saat hava</h3>
      <div class="hours wx-strip" id="wx-hours">${dayRows.map(r => `<button class="hour wxh ${r === sel ? 'now' : ''}" data-t="${r.date.getTime()}">
        <div class="h">${hh(r.date)}</div>
        <div class="ico">${weatherIcon(r.code, r.isDay)}</div>
        <div class="t">${fmt(r.temp)}°</div>
        <div class="rain" title="Yağmur ihtimali %${fmt(r.rainProb)}"><span style="height:${Math.max(0, Math.min(100, r.rainProb ?? 0))}%"></span></div>
        <div class="rp">${(r.rainProb ?? 0) >= 20 ? `%${fmt(r.rainProb)}` : '&nbsp;'}${r.precip >= 0.1 ? `<br>${fmt(r.precip, 1)}mm` : ''}</div>
        <div class="w">${arrow(r.windDir)} ${fmt(r.wind)}</div>
        <div class="g">hamle ${fmt(r.gust)}</div>
        ${type === 'sea' && r.wave != null ? `<div class="g">🌊 ${fmt(r.wave, 1)}m</div>` : ''}
        <div class="sc ${scoreClass(r.score)}">🎣 ${fmt(r.score, 1)}</div>
        ${r.danger ? '<div>⚠️</div>' : ''}
      </button>`).join('')}</div>
      <p class="chart-note">Mavi sütun: yağmur ihtimali. Ok: rüzgarın estiği yön, rakam km/s. 🎣: balık skoru. Bir saate dokunarak seçin.</p>
    </div>

    <div class="card score-card">
      <div class="score-ring" style="border-color:${scoreColor(sel.score)}">${fmt(sel.score, 1)}<small>/ 10</small></div>
      <div class="score-text"><strong>${scoreLabel(sel.score, sel.danger)}</strong>
        <div class="muted">${sel.date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} ${hh(sel.date)}${sel === nowRow ? ' · şu an' : ''}</div>
        <ul>${sel.reasons.map(([v, t]) => `<li>${v > 0 ? '＋' : '－'} ${esc(t)}</li>`).join('')}</ul>
      </div>
    </div>

    <div class="card advice"><h3>💡 Öneri</h3>${advice.map(t => `<p>${t}</p>`).join('')}</div>

    <div class="card"><h3>🐟 Türlere göre tahmin (${hh(sel.date)})</h3>
      <div class="hbars species-bars">${species.map(s => `<div class="hbar">
        <span class="name">${esc(s.name)}</span>
        <span class="track"><span class="fill" style="display:block;width:${s.score * 10}%"></span></span>
        <span class="val">${fmt(s.score, 1)}</span>
        <span class="sp-note">${esc(s.notes.join(' · '))}</span></div>`).join('')}</div>
      <p class="chart-note">Tür puanı: genel skor + sezon + o türün sevdiği su sıcaklığı + aktif olduğu saat${type === 'sea' ? ' + dalga tercihi' : ''}.</p>
    </div>

    <div class="card"><h3>📈 Grafikler (${dayRows[0]?.date.toLocaleDateString('tr-TR', { weekday: 'long' }) || ''})</h3>
      <h4>Balık skoru</h4>${lineChart('score', dayRows, [{ key: 'score', label: 'Skor', color: C1 }], { decimals: 1, sel })}
      <h4>Rüzgar (km/s)</h4>${lineChart('wind', dayRows, [{ key: 'wind', label: 'Rüzgar', color: C1 }, { key: 'gust', label: 'Hamle', color: C2 }], { unit: ' km/s', sel })}
      ${type === 'sea' && dayRows.some(r => r.wave != null)
        ? `<h4>Dalga (m)</h4>${lineChart('wave', dayRows, [{ key: 'wave', label: 'Dalga', color: C1 }, ...(dayRows.some(r => r.swell != null) ? [{ key: 'swell', label: 'Soluğan', color: C2 }] : [])], { unit: ' m', decimals: 1, sel })}`
        : `<h4>Yağış (mm)</h4>${lineChart('rain', dayRows, [{ key: 'precip', label: 'Yağış', color: C1 }], { unit: ' mm', decimals: 1, sel, bars: true })}`}
      <h4>Sıcaklık (°C)</h4>${lineChart('temp', dayRows, [{ key: 'temp', label: 'Hava', color: C1 }, { key: 'waterTemp', label: type === 'sea' ? 'Deniz' : 'Su (tahmini)', color: C2 }], { unit: ' °C', min0: false, sel })}
      <h4>Basınç (hPa)</h4>${lineChart('pres', dayRows, [{ key: 'pressure', label: 'Basınç', color: C1 }], { unit: ' hPa', min0: false, sel })}
    </div>

    <div class="card"><h3>🌤️ Ayrıntılı hava (${hh(sel.date)})</h3><div class="metrics">
      ${metric('Rüzgar', `${arrow(sel.windDir)} ${fmt(sel.wind)} km/s`, `${windName(sel.windDir)} · hamle ${fmt(sel.gust)}`)}
      ${metric('Hava', `${fmt(sel.temp)} °C`, `hissedilen ${fmt(sel.feels)} °C`)}
      ${metric('Su sıcaklığı', sel.waterTemp == null ? '—' : `${sel.waterTempEstimated ? '~' : ''}${fmt(sel.waterTemp)} °C`, sel.waterTempEstimated ? 'tahmini (son 5 gün hava ort.)' : 'ölçülen deniz suyu')}
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

    <div class="card"><h3>Günün en iyi saatleri</h3><ul class="best-list">
      ${best.map(r => `<li><span>${hh(r.date)} ${r.danger ? '⚠️' : ''}</span><b class="${scoreClass(r.score)}">${fmt(r.score, 1)}</b></li>`).join('')}
    </ul></div>

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
  if (e.target.id === 'wx-refresh') {
    const t = detail.sel.date.getTime();
    e.target.textContent = 'Yenileniyor…';
    try { detail.a = await analyze(detail.a.place, { force: true }); } catch (err) { toast(err.message); }
    detail.sel = detail.a.rows.find(r => r.date.getTime() === t) || hourAt(detail.a.rows, new Date()) || detail.a.rows[0];
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
  if (e.target.id !== 'wx-water') return;
  const place = { ...detail.a.place, water: e.target.value };
  const spot = spotById(place.key) || spotById(place.id);
  if (spot) { await db.put('spots', { ...spot, water: place.water }); await loadData(); refreshAll(); }
  const t = detail.sel.date.getTime();
  detail.a = await analyze(place);
  detail.sel = detail.a.rows.find(r => r.date.getTime() === t) || detail.a.rows[0];
  renderDetail();
}

// Haritada boş bir noktaya dokununca hızlı özet
async function mapPointPopup(latlng) {
  const pop = L.popup().setLatLng(latlng).setContent('Hesaplanıyor… 🎣').openOn(map);
  try {
    const place = { lat: latlng.lat, lng: latlng.lng, name: 'Seçilen nokta', water: 'auto' };
    const a = await analyze(place);
    const r = hourAt(a.rows, new Date());
    const best = a.rows.filter(x => x.date >= new Date() && x.date <= new Date(Date.now() + 864e5)).reduce((b, x) => (!b || x.score > b.score ? x : b), null);
    pop.setContent(`<div class="pt-pop">${scorePill(r)} <b>${esc(scoreLabel(r.score, r.danger))}</b><br>
      <small>${WATER_TYPES[a.type].icon} ${WATER_TYPES[a.type].label} · şu an</small><br>
      <small>${esc(summaryLine(r, a.type))}</small><br>
      ${best ? `<small>24 saatin en iyisi: <b>${dayShort(best.date)} ${hh(best.date)}</b> (${fmt(best.score, 1)})</small>` : ''}
      <div class="popup-actions"><button data-act="wx-point" data-lat="${latlng.lat}" data-lng="${latlng.lng}">Ayrıntılı tahmin</button>
      <button data-act="spot-here" data-lat="${latlng.lat}" data-lng="${latlng.lng}">📍 Mera kaydet</button></div></div>`);
  } catch (e) { pop.setContent(esc(e.message)); }
}

// ————————————————— İstatistik —————————————————
let statsRange = 'all';
function renderStats() {
  const since = statsRange === '30' ? Date.now() - 30 * 86400000
    : statsRange === 'year' ? new Date(new Date().getFullYear(), 0, 1).getTime() : 0;
  const cs = state.catches.filter(c => new Date(c.date).getTime() >= since);
  const box = $('#stats-content');
  const seg = `<div class="seg">${[['all', 'Tümü'], ['year', 'Bu yıl'], ['30', 'Son 30 gün']]
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
function renderMore() {
  let checked = [];
  try { checked = JSON.parse(localStorage.getItem('checklist') || '[]'); } catch { /* yok */ }
  $('#more-content').innerHTML = `
    <div class="card"><h3>🐟 Marmara balık rehberi</h3>
      ${SPECIES.filter(s => s.name !== 'Diğer').map(s => `<details class="species-card card">
        <summary>${s.emoji} ${esc(s.name)} ${s.minSize ? `<span class="min-size">min ${s.minSize} cm</span>` : ''}</summary>
        <dl><dt>Sezon</dt><dd>${esc(s.season)}</dd><dt>Nerede</dt><dd>${esc(s.where)}</dd>
        <dt>Yem</dt><dd>${esc(s.bait)}</dd><dt>Yöntem</dt><dd>${esc(s.method)}</dd>
        ${s.tip ? `<dt>İpucu</dt><dd>${esc(s.tip)}</dd>` : ''}</dl></details>`).join('')}
      <p class="muted">Asgari boylar amatör balıkçılık mevzuatına göre yaklaşık değerlerdir ve değişebilir.
      Amatör balıkçılıkta kişi başı günlük toplam av sınırı vardır. Güncel kurallar için Tarım ve Orman Bakanlığı'nın amatör avcılık tebliğini kontrol edin.</p>
    </div>

    <div class="card checklist"><h3>🎒 Çıkmadan önce kontrol listesi</h3>
      ${CHECKLIST.map((item, i) => `<label class="check"><input type="checkbox" data-check="${i}" ${checked.includes(i) ? 'checked' : ''}> ${esc(item)}</label>`).join('')}
      <button class="btn small" id="check-reset" style="margin-top:10px">Listeyi sıfırla</button>
    </div>

    <div class="card"><h3>💾 Yedekleme</h3>
      <p class="muted">Verileriniz sadece bu telefonda saklanıyor. Telefonu değiştirmeden önce veya ara ara yedek alın.</p>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn" id="export-btn">⬇️ Yedek indir</button>
        <label class="btn" style="margin:0;color:var(--text)">⬆️ Yedek yükle<input type="file" id="import-file" accept="application/json,.json" hidden></label>
      </div>
      <p class="muted">${state.catches.length} av, ${state.spots.length} mera kayıtlı.</p>
    </div>

    <div class="card"><h3>ℹ️ Hakkında</h3>
      <p class="muted">Rastgele v1 · Kıyı balıkçıları için av günlüğü. Harita: © OpenStreetMap katkıcıları. Hava: Open-Meteo.</p>
    </div>`;
}

const blobToDataUrl = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });

async function exportBackup() {
  const catches = await Promise.all(state.catches.map(async c => ({ ...c, photo: c.photo ? await blobToDataUrl(c.photo) : null })));
  const blob = new Blob([JSON.stringify({ app: 'rastgele', version: 1, exportedAt: new Date().toISOString(), catches, spots: state.spots })], { type: 'application/json' });
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
    if (!confirm(`${data.catches.length} av ve ${data.spots.length} mera eklensin mi? (Aynı kayıtlar güncellenir)`)) return;
    for (const s of data.spots) await db.put('spots', s);
    for (const c of data.catches) {
      const photo = c.photo ? await (await fetch(c.photo)).blob() : null;
      dropPhotoUrl(c.id);
      await db.put('catches', { ...c, photo });
    }
    await loadData(); refreshAll(); renderMore();
    toast('Yedek yüklendi');
  } catch (e) { toast('Yedek yüklenemedi: ' + e.message, 4000); }
}

// ————————————————— Kurulum ipucu (ana ekrana ekle) —————————————————
function setupInstallHint() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || ls('hideInstall')) return;
  const hint = $('#install-hint');
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS) {
    $('#install-text').textContent = 'Uygulama gibi kullanmak için: Paylaş ⬆️ → “Ana Ekrana Ekle”';
    hint.hidden = false;
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    $('#install-text').textContent = 'Rastgele’yi telefonunuza uygulama olarak yükleyin.';
    $('#install-btn').hidden = false; hint.hidden = false;
    $('#install-btn').onclick = async () => { e.prompt(); await e.userChoice; hint.hidden = true; };
  });
  $('#install-close').onclick = () => { hint.hidden = true; try { localStorage.setItem('hideInstall', '1'); } catch { /* yok */ } };
}

// ————————————————— Olaylar —————————————————
function bindEvents() {
  document.querySelectorAll('.bottom-nav button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#fab').addEventListener('click', () => openCatchDialog());
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
  $('#catch-photo').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try { editing.photo = await compressImage(file); showPhotoPreview(editing.photo); } catch (err) { toast(err.message); }
  });
  $('#catch-use-location').addEventListener('click', async () => {
    $('#catch-location-text').textContent = 'Konum alınıyor…';
    try { Object.assign(editing, await getPosition()); } catch (err) { toast(err.message); }
    updateLocationText();
  });

  // Mera formu
  $('#spot-form').addEventListener('submit', saveSpot);
  $('#spot-cancel').addEventListener('click', () => $('#spot-dialog').close());
  $('#spot-delete').addEventListener('click', deleteSpot);
  $('#map-locate').addEventListener('click', locateMe);
  $('#map-search').addEventListener('submit', onMapSearch);
  $('#map-results').addEventListener('click', e => {
    const b = e.target.closest('[data-result]'); if (!b) return;
    if (b.dataset.result === 'close') { $('#map-results').hidden = true; return; }
    goToPlace(state.searchResults[+b.dataset.result]);
  });
  $('#map-recent').addEventListener('click', e => {
    const b = e.target.closest('[data-recent]'); if (b) goToPlace(recentSearches()[+b.dataset.recent]);
  });
  renderRecent();
  $('#map-fit').addEventListener('click', () => { initMap(); fitAll(); });
  $('#map-add-spot').addEventListener('click', async () => {
    initMap();
    const p = meMarker ? meMarker.getLatLng() : null;
    openSpotDialog(null, p || map.getCenter());
  });

  // Harita popup düğmeleri
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const { act, id } = b.dataset;
    map?.closePopup();
    if ((act === 'edit-spot' || act === 'catch-spot') && $('#wx-dialog').open) $('#wx-dialog').close();
    if (act === 'edit-spot') openSpotDialog(spotById(id));
    if (act === 'edit-catch') openCatchDialog(state.catches.find(c => c.id === id));
    if (act === 'catch-spot') openCatchDialog(null, { spotId: id });
    if (act === 'wx-spot') { const sp = spotById(id); openDetail({ ...sp, key: sp.id }); }
    if (act === 'wx-point') openDetail({ lat: +b.dataset.lat, lng: +b.dataset.lng, name: 'Seçilen nokta', water: 'auto' });
    if (act === 'spot-here') openSpotDialog(null, { lat: +b.dataset.lat, lng: +b.dataset.lng }, 'auto', b.dataset.name || '');
  });

  // Tahmin
  $('#rank-when').addEventListener('click', e => {
    const b = e.target.closest('[data-when]');
    if (!b) return;
    rankWhen = b.dataset.when;
    document.querySelectorAll('#rank-when button').forEach(x => x.classList.toggle('active', x === b));
    $('#rank-custom-row').hidden = rankWhen !== 'custom';
    if (rankWhen === 'custom' && !$('#rank-custom').value) {
      const d = new Date(Date.now() + 864e5); d.setHours(18, 0, 0, 0);
      $('#rank-custom').value = toLocalInput(d);
    }
    renderRank();
  });
  $('#rank-custom').addEventListener('change', () => renderRank());
  $('#rank-me').addEventListener('change', () => renderRank());
  $('#rank-refresh').addEventListener('click', () => renderRank(true));
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
  $('#rank-list').addEventListener('click', e => {
    const it = e.target.closest('.rank-item');
    if (!it || justLongPressed(it)) return;
    const a = state.analyses?.get(it.dataset.key);
    if (a) openDetail(a.place);
  });
  $('#wx-close').addEventListener('click', () => $('#wx-dialog').close());
  $('#wx-body').addEventListener('click', onDetailClick);
  $('#wx-body').addEventListener('change', onDetailWaterChange);
  $('#wx-body').addEventListener('pointermove', onChartMove);

  // İstatistik
  $('#stats-content').addEventListener('click', e => {
    const r = e.target.closest('[data-range]');
    if (r) { statsRange = r.dataset.range; renderStats(); return; }
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
  $('#more-content').addEventListener('click', e => {
    if (e.target.id === 'export-btn') exportBackup();
    if (e.target.id === 'check-reset') { try { localStorage.removeItem('checklist'); } catch { /* yok */ } renderMore(); }
  });
}

// ————————————————— Başlat —————————————————
async function init() {
  $('#species-list').innerHTML = SPECIES.map(s => `<option value="${esc(s.name)}">`).join('');
  $('#bait-list').innerHTML = BAITS.map(b => `<option value="${esc(b)}">`).join('');
  $('#method-list').innerHTML = METHODS.map(m => `<option value="${esc(m)}">`).join('');
  bindEvents();
  setupInstallHint();
  await loadData();
  refreshAll();
  let start = 'catches';
  try { start = localStorage.getItem('tab') || 'catches'; } catch { /* yok */ }
  if (start === 'weather') start = 'map';
  showTab(document.getElementById(`tab-${start}`) ? start : 'catches');
  db.requestPersistence();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
