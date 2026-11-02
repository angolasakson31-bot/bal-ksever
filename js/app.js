import * as db from './db.js';
import { SPECIES, BAITS, METHODS, CHECKLIST, findSpecies } from './data.js';
import { fetchConditions, buildHours, windName, arrow, moonPhase, scoreClass, scoreLabel } from './weather.js';

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
  fillWeatherPlaces();
}

// ————————————————— Sekmeler —————————————————
function showTab(name) {
  state.tab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === `tab-${name}`));
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $('#page-title').textContent = $(`#tab-${name}`).dataset.title;
  $('#fab').hidden = name === 'more';
  if (name === 'map') initMap();
  if (name === 'weather') loadWeather();
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
let map, spotLayer, catchLayer, meMarker;

function initMap() {
  if (map) { setTimeout(() => map.invalidateSize(), 50); return; }
  if (!window.L) { $('#map').innerHTML = '<div class="empty">Harita yüklenemedi. İnternet bağlantınızı kontrol edin.</div>'; return; }
  map = L.map('map', { doubleClickZoom: false }).setView([DEFAULT_PLACE.lat, DEFAULT_PLACE.lng], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  spotLayer = L.layerGroup().addTo(map);
  catchLayer = L.layerGroup().addTo(map);
  L.control.layers(null, { 'Meralar': spotLayer, 'Avlar': catchLayer }, { collapsed: true }).addTo(map);
  const addAt = e => openSpotDialog(null, e.latlng);
  map.on('contextmenu', addAt);
  map.on('dblclick', addAt);
  renderMapMarkers();
  const pts = [...state.spots, ...state.catches].filter(p => p.lat != null);
  if (pts.length) map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])).pad(0.2), { maxZoom: 15 });
  setTimeout(() => map.invalidateSize(), 50);
}

const directionsLinks = (lat, lng) =>
  `<a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" rel="noopener">Google Yol Tarifi</a>` +
  `<a href="https://maps.apple.com/?daddr=${lat},${lng}" target="_blank" rel="noopener">Apple Haritalar</a>`;

function renderMapMarkers() {
  if (!map) return;
  spotLayer.clearLayers(); catchLayer.clearLayers();
  for (const s of state.spots) {
    const n = state.catches.filter(c => c.spotId === s.id).reduce((a, c) => a + (c.count || 1), 0);
    const m = L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'spot-marker', html: '📍', iconSize: [26, 26], iconAnchor: [13, 26] }) });
    m.bindPopup(`<b>${esc(s.name)}</b> <small>${esc(s.type || '')}</small><br>${esc(s.notes || '')}<br><small>${n} av</small>
      <div class="popup-actions">${directionsLinks(s.lat, s.lng)}
      <button data-act="edit-spot" data-id="${s.id}">Düzenle</button>
      <button data-act="wx-spot" data-id="${s.id}">Hava</button>
      <button data-act="catch-spot" data-id="${s.id}">＋ Av</button></div>`);
    spotLayer.addLayer(m);
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

// ————————————————— Mera ekleme —————————————————
let editingSpot = null;
function openSpotDialog(s, latlng) {
  editingSpot = s ? { ...s } : { id: null, lat: latlng.lat, lng: latlng.lng };
  $('#spot-dialog-title').textContent = s ? 'Merayı düzenle' : 'Yeni Mera';
  $('#spot-name').value = s?.name || '';
  $('#spot-type').value = s?.type || 'İskele';
  $('#spot-notes').value = s?.notes || '';
  $('#spot-coords').textContent = `📍 ${editingSpot.lat.toFixed(5)}, ${editingSpot.lng.toFixed(5)}`;
  $('#spot-delete').hidden = !s;
  $('#spot-dialog').showModal();
}

async function saveSpot(e) {
  e.preventDefault();
  const rec = { ...editingSpot, id: editingSpot.id || db.newId(), name: $('#spot-name').value.trim(),
    type: $('#spot-type').value, notes: $('#spot-notes').value.trim(), createdAt: editingSpot.createdAt || new Date().toISOString() };
  if (!rec.name) return;
  await db.put('spots', rec);
  $('#spot-dialog').close();
  await loadData(); refreshAll();
  toast('Mera kaydedildi');
}

async function deleteSpot() {
  if (!editingSpot.id || !confirm('Bu mera silinsin mi? (Avlar silinmez)')) return;
  await db.remove('spots', editingSpot.id);
  $('#spot-dialog').close();
  await loadData(); refreshAll();
}

// ————————————————— Hava & deniz —————————————————
function fillWeatherPlaces() {
  const sel = $('#weather-place');
  const cur = sel.value || ls('wxPlace') || 'default';
  sel.innerHTML = `<option value="me">📍 Konumum</option><option value="default">${DEFAULT_PLACE.name}</option>` +
    state.spots.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : 'default';
}

async function placeCoords() {
  const v = $('#weather-place').value;
  if (v === 'me') { const p = await getPosition(); return { ...p, name: 'Konumum' }; }
  const s = spotById(v);
  return s ? { lat: s.lat, lng: s.lng, name: s.name } : DEFAULT_PLACE;
}

let wxLoading = false;
async function loadWeather(force = false) {
  const box = $('#weather-content');
  const key = $('#weather-place').value;
  if (!force && box.dataset.key === key && Date.now() - (+box.dataset.at || 0) < 15 * 60000) return;
  if (wxLoading) return;
  wxLoading = true;
  box.innerHTML = '<div class="empty">Yükleniyor… 🌊</div>';
  try {
    try { localStorage.setItem('wxPlace', key); } catch { /* yok */ }
    const place = await placeCoords();
    const data = await fetchConditions(place.lat, place.lng);
    renderWeather(buildHours(data), data, place);
    box.dataset.key = key; box.dataset.at = Date.now();
  } catch (e) {
    box.innerHTML = `<div class="empty"><span class="big">⚠️</span>${esc(e.message)}</div>`;
  } finally { wxLoading = false; }
}

const fmt = (v, d = 0) => v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d);

function renderWeather({ rows, suns }, data, place) {
  const now = new Date();
  const idx = rows.findIndex(r => r.date > now) - 1;
  const cur = rows[Math.max(0, idx)];
  const moon = moonPhase(now);
  const today = suns.find(s => s.rise.toDateString() === now.toDateString()) || suns[0];
  const upcoming = rows.filter(r => r.date >= new Date(now.getTime() - 3600000)).slice(0, 48);
  const best = [...upcoming].sort((a, b) => b.score - a.score).slice(0, 5).sort((a, b) => a.date - b.date);
  const trend = cur.pTrend == null ? '' : cur.pTrend <= -0.6 ? '↘ düşüyor' : cur.pTrend >= 0.6 ? '↗ yükseliyor' : '→ sabit';
  const ringColor = `var(--${cur.score >= 7 ? 'good' : cur.score >= 4.5 ? 'warn' : 'bad'})`;

  $('#weather-content').innerHTML = `
    ${data.offline ? `<p class="warn">Çevrimdışısınız: ${new Date(data.fetchedAt).toLocaleString('tr-TR')} tarihli kayıtlı veri gösteriliyor.</p>` : ''}
    <div class="card score-card">
      <div class="score-ring" style="border-color:${ringColor}">${fmt(cur.score, 1)}<small>/ 10</small></div>
      <div class="score-text"><strong>${scoreLabel(cur.score)}</strong>
        <div class="muted">${esc(place.name)} · şu an</div>
        <ul>${cur.why.map(([v, t]) => `<li>${v >= 0 ? '＋' : '－'} ${esc(t)}</li>`).join('')}</ul>
      </div>
    </div>

    <div class="card"><h3>Şu an</h3><div class="metrics">
      <div class="metric"><div class="label">Rüzgar</div><div class="value">${arrow(cur.windDir)} ${fmt(cur.wind)} km/s</div><div class="sub">${windName(cur.windDir)} · hamle ${fmt(cur.gust)}</div></div>
      <div class="metric"><div class="label">Dalga</div><div class="value">${cur.wave == null ? '—' : fmt(cur.wave, 1) + ' m'}</div><div class="sub">${cur.wave == null ? 'Bu nokta için deniz verisi yok' : 'Yön: ' + windName(cur.waveDir)}</div></div>
      <div class="metric"><div class="label">Basınç</div><div class="value">${fmt(cur.pressure)} hPa</div><div class="sub">${trend} (3 saat)</div></div>
      <div class="metric"><div class="label">Deniz suyu</div><div class="value">${cur.sst == null ? '—' : fmt(cur.sst, 1) + ' °C'}</div><div class="sub">Hava ${fmt(cur.temp)} °C</div></div>
      <div class="metric"><div class="label">Güneş</div><div class="value">${fmtTime(today.rise)} – ${fmtTime(today.set)}</div><div class="sub">doğuş – batış</div></div>
      <div class="metric"><div class="label">Ay</div><div class="value">${moon.icon} %${moon.illum}</div><div class="sub">${moon.name}</div></div>
    </div></div>

    <div class="card"><h3>Saatlik skor (48 saat)</h3><div class="hours">
      ${upcoming.map(r => `<div class="hour ${r === cur ? 'now' : ''}">
        <div class="h">${r.date.getHours() === 0 || r === upcoming[0] ? r.date.toLocaleDateString('tr-TR', { weekday: 'short' }) + ' ' : ''}${String(r.date.getHours()).padStart(2, '0')}:00</div>
        <div class="sc ${scoreClass(r.score)}">${fmt(r.score, 1)}</div>
        <div>${arrow(r.windDir)} ${fmt(r.wind)}</div>
        <div class="muted">${r.wave == null ? '' : fmt(r.wave, 1) + 'm'}</div>
      </div>`).join('')}
    </div><p class="chart-note">Ok yönü: rüzgarın estiği yön. Rakam: km/s. Altı: dalga.</p></div>

    <div class="card"><h3>En iyi saatler</h3><ul class="best-list">
      ${best.map(r => `<li><span>${r.date.toLocaleDateString('tr-TR', { weekday: 'long' })} ${String(r.date.getHours()).padStart(2, '0')}:00</span>
        <b class="${scoreClass(r.score)}">${fmt(r.score, 1)}</b></li>`).join('')}
    </ul></div>
    <p class="muted">Skor; rüzgar, dalga, basınç değişimi, alacakaranlık, ay evresi ve yağışa göre hesaplanan kaba bir tahmindir. Veri: Open-Meteo.</p>`;
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
    if (act === 'edit-spot') openSpotDialog(spotById(id));
    if (act === 'edit-catch') openCatchDialog(state.catches.find(c => c.id === id));
    if (act === 'catch-spot') openCatchDialog(null, { spotId: id });
    if (act === 'wx-spot') { $('#weather-place').value = id; showTab('weather'); }
  });

  // Hava
  $('#weather-place').addEventListener('change', () => loadWeather(true));
  $('#weather-refresh').addEventListener('click', () => loadWeather(true));

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
  showTab(document.getElementById(`tab-${start}`) ? start : 'catches');
  db.requestPersistence();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
