// Rastgele grup sunucusu: arkadaş gruplarının ortak meralarını ve avlarını saklar.
// Telefonlar bu sunucuyla konuşur; MongoDB şifresi yalnızca burada (Render ortam değişkeni) durur.
//
// Ortam değişkenleri (Render → Environment):
//   MONGODB_URI      MongoDB bağlantı adresi (zorunlu; yoksa test için bellekte çalışır)
//   MONGODB_DB       veritabanı adı (varsayılan: rastgele)
//   ALLOWED_ORIGINS  izin verilen site adresleri, virgülle (varsayılan: https://rastgele-nsyh.onrender.com)
//   PORT             Render kendisi verir
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 8787;
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://rastgele-nsyh.onrender.com').split(',').map(s => s.trim()).filter(Boolean);
const STORES = new Set(['spots', 'catches']);
const CODE_RE = /^[A-Za-z0-9]{16,40}$/;
const ID_RE = /^[A-Za-z0-9._:-]{1,80}$/;
const MAX_BODY = 64 * 1024; // bir kayıt en fazla 64 KB (fotoğraflar Cloudinary'de)

// ——— Depolama: MongoDB ya da (test için) bellek ———
async function makeStore() {
  if (!process.env.MONGODB_URI) {
    console.warn('UYARI: MONGODB_URI yok, veriler bellekte tutuluyor (yalnızca test için).');
    const groups = new Map(), items = new Map(), members = new Map();
    return {
      putMember: async m => { members.set(m._id, m); },
      members: async g => [...members.values()].filter(m => m.g === g),
      authorCounts: async g => {
        const out = {};
        for (const x of items.values()) if (x.g === g && !x.deleted && x.createdBy) { const o = out[x.createdBy] ||= { spots: 0, catches: 0 }; o[x.store === 'spots' ? 'spots' : 'catches']++; }
        return out;
      },
      getGroup: async code => groups.get(code) || null,
      addGroup: async g => { groups.set(g._id, g); },
      getItem: async id => items.get(id) || null,
      put: async it => { items.set(it._id, it); },
      changes: async (g, since, limit) => [...items.values()].filter(x => x.g === g && x.updatedAt > since)
        .sort((a, b) => a.updatedAt - b.updatedAt).slice(0, limit),
      count: async g => [...items.values()].filter(x => x.g === g && !x.deleted).length,
    };
  }
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'rastgele');
  const groups = db.collection('groups'), items = db.collection('items'), members = db.collection('members');
  await items.createIndex({ g: 1, updatedAt: 1 });
  await members.createIndex({ g: 1 });
  return {
    putMember: m => members.replaceOne({ _id: m._id }, m, { upsert: true }),
    members: g => members.find({ g }).toArray(),
    authorCounts: async g => {
      const rows = await items.aggregate([{ $match: { g, deleted: { $ne: true }, createdBy: { $type: 'string' } } },
        { $group: { _id: { by: '$createdBy', s: '$store' }, n: { $sum: 1 } } }]).toArray();
      const out = {};
      for (const r of rows) { const o = out[r._id.by] ||= { spots: 0, catches: 0 }; o[r._id.s === 'spots' ? 'spots' : 'catches'] += r.n; }
      return out;
    },
    getGroup: code => groups.findOne({ _id: code }),
    addGroup: g => groups.insertOne(g),
    getItem: id => items.findOne({ _id: id }),
    put: it => items.replaceOne({ _id: it._id }, it, { upsert: true }),
    changes: (g, since, limit) => items.find({ g, updatedAt: { $gt: since } }).sort({ updatedAt: 1 }).limit(limit).toArray(),
    count: g => items.countDocuments({ g, deleted: { $ne: true } }),
  };
}

// ——— Basit istek sınırlama (IP başına) ———
const hits = new Map();
function limited(ip, key, max, windowMs) {
  const k = ip + '|' + key, now = Date.now();
  const h = hits.get(k);
  if (!h || now - h.t > windowMs) { hits.set(k, { t: now, n: 1 }); return false; }
  h.n += 1;
  return h.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (now - h.t > 3600e3) hits.delete(k); }, 600e3).unref();

const newCode = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return [...crypto.randomBytes(20)].map(b => abc[b % abc.length]).join('');
};
const cleanText = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
  res.writeHead(status, headers);
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Kayıt çok büyük'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('Geçersiz veri'), { status: 400 })); } });
    req.on('error', reject);
  });
}

async function main() {
  const store = await makeStore();
  const server = http.createServer(async (req, res) => {
    const reqOrigin = req.headers.origin;
    const origin = reqOrigin && (ORIGINS.includes('*') || ORIGINS.includes(reqOrigin)) ? reqOrigin : null;
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    try {
      const url = new URL(req.url, 'http://x');
      const p = url.pathname.split('/').filter(Boolean);
      if (req.method === 'OPTIONS') return send(res, 204, undefined, origin);
      if (url.pathname === '/' || url.pathname === '/health') return send(res, 200, { ok: true, app: 'rastgele-api' }, origin);
      if (reqOrigin && !origin) return send(res, 403, { error: 'Bu adresten erişime izin yok' });
      if (limited(ip, 'all', 240, 60e3)) return send(res, 429, { error: 'Çok fazla istek, biraz bekleyin' }, origin);

      // Grup oluştur: POST /api/groups {name}
      if (req.method === 'POST' && p[0] === 'api' && p[1] === 'groups' && p.length === 2) {
        if (limited(ip, 'create', 10, 3600e3)) return send(res, 429, { error: 'Çok fazla grup oluşturuldu, sonra deneyin' }, origin);
        const body = await readBody(req);
        const name = cleanText(body.name, 40) || 'Balık grubu';
        const g = { _id: newCode(), name, createdAt: Date.now(), by: cleanText(body.by, 30) };
        await store.addGroup(g);
        return send(res, 201, { code: g._id, name: g.name }, origin);
      }

      if (p[0] !== 'api' || p[1] !== 'g' || !CODE_RE.test(p[2] || '')) return send(res, 404, { error: 'Bulunamadı' }, origin);
      const code = p[2];
      const group = await store.getGroup(code);
      if (!group) return send(res, 404, { error: 'Grup bulunamadı. Link doğru mu?' }, origin);

      // Grup bilgisi + üyeler: GET /api/g/:code
      if (req.method === 'GET' && p.length === 3) {
        const [count, mem, counts] = await Promise.all([store.count(code), store.members(code), store.authorCounts(code)]);
        const members = mem.sort((a, b) => b.lastSeen - a.lastSeen).map(m => ({ id: m.id, name: m.name, lastSeen: m.lastSeen, joinedAt: m.joinedAt, ...(counts[m.name] || { spots: 0, catches: 0 }) }));
        return send(res, 200, { name: group.name, count, members, now: Date.now() }, origin);
      }

      // Üye bildirimi (gruba girince / arada bir): POST /api/g/:code/members {id, name}
      if (req.method === 'POST' && p[3] === 'members' && p.length === 4) {
        if (limited(ip, 'member', 60, 60e3)) return send(res, 429, { error: 'Çok fazla istek' }, origin);
        const body = await readBody(req);
        const id = String(body.id || ''), name = cleanText(body.name, 30);
        if (!/^[A-Za-z0-9-]{8,40}$/.test(id) || !name) return send(res, 400, { error: 'Geçersiz üye' }, origin);
        const _id = `${code}:${id}`;
        const old = (await store.members(code)).find(m => m._id === _id);
        await store.putMember({ _id, g: code, id, name, lastSeen: Date.now(), joinedAt: old?.joinedAt || Date.now() });
        return send(res, 200, { ok: true }, origin);
      }

      // Değişiklikler: GET /api/g/:code/changes?since=ms
      if (req.method === 'GET' && p[3] === 'changes' && p.length === 4) {
        const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
        const now = Date.now();
        const list = await store.changes(code, since, 1000);
        const more = list.length === 1000;
        return send(res, 200, {
          items: list.map(x => ({ store: x.store, id: x.id, doc: x.deleted ? null : x.doc, deleted: !!x.deleted, updatedAt: x.updatedAt, by: x.by, createdBy: x.createdBy, createdAt: x.createdAt })),
          now: more ? list[list.length - 1].updatedAt : now - 1, more, // -1: aynı milisaniyede yazılan kaçmasın
        }, origin);
      }

      // Kaydet / sil: PUT|DELETE /api/g/:code/:store/:id
      if (p.length === 5 && STORES.has(p[3]) && ID_RE.test(p[4]) && (req.method === 'PUT' || req.method === 'DELETE')) {
        if (limited(ip, 'write', 120, 60e3)) return send(res, 429, { error: 'Çok fazla kayıt, biraz bekleyin' }, origin);
        const [, , , st, id] = p;
        const _id = `${code}:${st}:${id}`;
        const body = req.method === 'PUT' ? await readBody(req) : {};
        const by = cleanText(body.by ?? url.searchParams.get('by'), 30);
        const prev = await store.getItem(_id);
        const now = Date.now();
        const item = { _id, g: code, store: st, id, updatedAt: now, by, createdBy: prev?.createdBy || by, createdAt: prev?.createdAt || now };
        if (req.method === 'DELETE') Object.assign(item, { deleted: true, doc: null });
        else {
          const doc = body.doc && typeof body.doc === 'object' && !Array.isArray(body.doc) ? { ...body.doc } : null;
          if (!doc) return send(res, 400, { error: 'Kayıt yok' }, origin);
          delete doc.photo; // fotoğraf dosyası sunucuya gelmez, yalnız photoUrl
          doc.id = id;
          item.doc = doc;
        }
        await store.put(item);
        return send(res, 200, { ok: true, updatedAt: now }, origin);
      }
      return send(res, 404, { error: 'Bulunamadı' }, origin);
    } catch (e) {
      console.error(e);
      return send(res, e.status || 500, { error: e.status ? e.message : 'Sunucu hatası' }, origin);
    }
  });
  server.listen(PORT, () => console.log(`rastgele-api ${PORT} portunda; izinli siteler: ${ORIGINS.join(', ')}`));
}

main().catch(e => { console.error('Başlatılamadı:', e); process.exit(1); });
