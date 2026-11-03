# Rastgele grup sunucusu (rastgele-api)

Arkadaş gruplarının ortak meralarını ve avlarını saklayan küçük sunucu.
Telefonlar bu sunucuyla konuşur; MongoDB şifresi yalnızca Render'da durur, telefona gitmez.

## Kurulum (bir kere)

### 1. MongoDB
1. MongoDB Atlas'a gir → zirve'nin kullandığı cluster → **Connect → Drivers**.
2. Bağlantı adresini kopyala (`mongodb+srv://kullanici:sifre@...`).
   Veritabanı adı otomatik olarak `rastgele` olur; zirve'nin verilerine dokunulmaz.
3. **Network Access** listesinde `0.0.0.0/0` (her yerden) yoksa ekle (Render'ın IP'si sabit değil).

### 2. Render: yeni Web Service
1. Render → **New → Web Service** → `bal-ksever` deposunu seç.
2. Ayarlar:
   - **Name:** `rastgele-api`
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance Type:** Free
3. **Environment Variables:**
   - `MONGODB_URI` = 1. adımdaki bağlantı adresi
   - `ALLOWED_ORIGINS` = `https://rastgele-nsyh.onrender.com`
4. **Deploy**. Bitince adres `https://rastgele-api....onrender.com` gibi olur.
   Tarayıcıda `.../health` açınca `{"ok":true}` görünmeli.

### 3. Uyumasın (isteğe bağlı)
Zirve'de olduğu gibi cron-job.org (veya kullandığın servis) ile 10 dakikada bir
`https://rastgele-api....onrender.com/health` adresini yoklat.
Uyusa da uygulama çalışır: telefondaki kopya hemen açılır, sunucu uyanınca güncellenir.

### 4. Cloudinary (av fotoğrafları)
1. Cloudinary → **Settings → Upload → Upload presets → Add upload preset**.
2. **Signing mode: Unsigned**, **Folder:** `rastgele`.
   İstersen: *Allowed formats* `jpg,png,webp`, *Max file size* 5 MB, *Incoming transformation* `c_limit,w_1600`.
3. Kaydet. Preset adını ve **cloud name**'i (Dashboard'da yazar) not al.

### 5. Siteye bağla
`js/config.js` dosyasına sunucu adresi, cloud name ve preset adı yazılır:
```js
export const API_URL = 'https://rastgele-api....onrender.com';
export const CLOUDINARY = { cloud: 'cloud-adi', preset: 'preset-adi' };
```

## Uç noktalar
| | |
|---|---|
| `GET /health` | sağlık kontrolü |
| `POST /api/groups` `{name, by}` | grup oluştur → `{code, name}` |
| `GET /api/g/:kod` | grup adı |
| `GET /api/g/:kod/changes?since=ms` | o andan sonraki değişiklikler |
| `PUT /api/g/:kod/(spots\|catches)/:id` `{doc, by}` | kaydet |
| `DELETE /api/g/:kod/(spots\|catches)/:id?by=` | sil |

Grubun anahtarı linkteki koddur (20 harf, tahmin edilemez). Linki bilen herkes görebilir ve değiştirebilir.
