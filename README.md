# 🎣 Rastgele

Kıyıdan balık tutan arkadaşlar için av günlüğü. Telefonda uygulama gibi çalışan bir web sitesi (PWA); iPhone ve Android'de çalışır.

## v1 özellikleri
- **Av günlüğü:** fotoğraf, tür, boy, ağırlık, adet, yem, takım, mera, konum, not. Asgari boy uyarısı.
- **Mera haritası:** meraları haritada işaretleme, avları haritada görme, Google/Apple yol tarifi.
- **Harita & Meralarım (tek ekran):** üstte harita, altta işaretlenen bütün meraların en iyiden en kötüye sıralaması. Haritadaki işaretlerde sıra numarası ve skor rengi görünür.
  Zaman seçenekleri tam o andan itibaren hesaplanır (15 dk hassasiyet): şimdi, +½/+1/+2/+3/+5/+6/+12 saat, bu akşam, yarın sabah, yarın akşam, 24 saatin en iyisi, 7 gün içinde istenen gün/saat.
  **🚗 Gidip geleceğim:** “kaç saat sonra çıkacaksınız / kaç saat kalacaksınız” seçilir; meralar o aralığın ortalama skoruna göre sıralanır, her merada aralık boyunca skor şeridi ve en iyi an görünür.
- **Meraya dokun → ayrıntılı tahmin:** öneri metni (ne zaman, hangi tür, hangi yem/takım, rüzgara göre nereye atılır), türlere göre tahmin,
  grafikler (skor, rüzgar/hamle, dalga/soluğan veya yağış, hava/su sıcaklığı, basınç), ayrıntılı hava (hissedilen, nem, görüş, UV,
  dalga periyodu, akıntı, güneş ve ay doğuş/batış, solunar).
- **Harita görünümleri (sağ üst düğme):** 🗺️ Detaylı (CARTO Voyager, bol isimli, varsayılan) · 🛰️ Uydu + isimler (Esri) · 🧭 Standart (OpenStreetMap, en güncel) · ⛰️ Topoğrafik (OpenTopoMap) · ⚓ Deniz işaretleri katmanı (OpenSeaMap). Hepsi ücretsiz, anahtarsız; seçim hatırlanır.
- **Dokunulan yerin adı:** haritada bir noktaya dokununca o yerin adı (göl, köy, iskele…) gösterilir ve mera kaydında otomatik dolar.
- **Haritada yer arama:** “Ankara”, “Sakarya Akyazı”, “Sapanca Gölü” gibi yer yazıp arayın; harita oraya gider, 📌 işaretten tek dokunuşla mera ekleyin veya tahmine bakın. Son 5 arama hatırlanır. (OpenStreetMap Nominatim, yedek: Open-Meteo yer araması)
- **Meraya basılı tut:** adını değiştir, sil, düzenle, av ekle, yol tarifi.
- **Şu andan itibaren 6 saat (30 dk veya 15 dk adım):** her an için hava simgesi, sıcaklık, yağmur, rüzgar/hamle, dalga ve balık skoru. Open-Meteo'nun 15 dakikalık verisi kullanılır; olmayan yerlerde saatlik verinin arası hesaplanır.
- **Saat saat görsel hava:** her saat için hava simgesi (güneş, bulut, yağmur, gece), sıcaklık, yağmur ihtimali sütunu, rüzgar ok + hız + hamle; 7 günlük gün kartları (simge, en yüksek/en düşük, yağış, rüzgar).
- **Haritada boş bir noktaya dokun:** o noktanın skoru ve özeti; tek dokunuşla ayrıntılı tahmin veya mera kaydı.
- **Deniz ve tatlı su:** su tipi otomatik algılanır (deniz verisi varsa deniz, yoksa göl). Elle göl/baraj veya nehir/dere seçilebilir. Her su tipi için ayrı puanlama yapılır.
- **İstatistik:** tür, saat, ay, yem ve meraya göre dağılım; rekorlar.
- **Rehber:** Marmara türleri (sezon, yem, yöntem, asgari boy), çıkış kontrol listesi.
- **Yedekleme:** tüm verileri tek dosyaya indirip geri yükleme.
- Çevrimdışı çalışır. Veriler sadece telefonda saklanır.

## Balık skoru nasıl hesaplanıyor? (`js/fishscore.js`)
Puan 0–10 arasıdır. Ağırlıklar kanıtın gücüne göre verildi:
1. **Su sıcaklığı** (en güçlü etken). Denizde Open-Meteo'nun ölçtüğü deniz suyu sıcaklığı kullanılır. Tatlı suda son 5 günün hava sıcaklığından tahmin edilir. Ani soğuma puanı düşürür.
2. **Işık:** alacakaranlık ±1,5 saat en iyi zaman, gece iyi, güneşli öğle saatleri kötü.
3. **Dalga ve rüzgar:** hafif dalga ve kırışık su iyi; yüksek dalga ve sert rüzgar kötü (ayrıca ⚠️ güvenlik uyarısı). Fırtına sonrası bulanık su levrek için artı puan.
4. **Yağış:** şimşek ve kuvvetli yağış kötü. Derede son 24 saatte çok yağış varsa su kabarık ve bulanık olur.
5. **Basınç ve ay (solunar):** bilimsel kanıtı zayıf olduğu için düşük ağırlıkla eklendi.

**İki sıralama seçeneği:** Meralarım listesinin üstünde 🎣 *Balık puanı* (ilk puanlama) veya 💨 *Rüzgar puanı* seçilir; liste ve haritadaki sıra numaraları seçilen puana göre dizilir, köşedeki rozet diğer puanı gösterir. Seçim hatırlanır.

**💨 Rüzgar puanı:** rüzgar hızı, hamle, denizde dalga; Boğaz/Marmara'da sert lodos ve uzun lodosta akıntı uyarısı; göl/derede soğuk mevsimde soğuk kuzey rüzgarı (−) ve ılık güney rüzgarı (+); 24 saat aynı yönden esen rüzgar (yem rüzgarın vurduğu kıyıda birikir).

Veriler Open-Meteo'dan `best_match` ile çekilir: konuma göre en iyi hava modelleri (ECMWF, DWD ICON, Météo-France vb.) otomatik birleştirilir. Uygulama açıldığında, uygulamaya geri dönüldüğünde ve 10 dakikada bir yenilenir; ayrıntı ekranında elle yenileme düğmesi vardır.

## Telefona kurulum
- **iPhone (Safari):** siteyi açın → Paylaş ⬆️ → *Ana Ekrana Ekle*
- **Android (Chrome):** siteyi açın → ⋮ menü → *Uygulamayı yükle*

## Yayınlama (GitHub Pages)
1. GitHub'da repo → **Settings → Pages → Source: GitHub Actions** seçin.
2. Kod `main` dalına geldiğinde site otomatik yayınlanır:
   `https://angolasakson31-bot.github.io/bal-ksever/`

## Bilgisayarda deneme
```bash
python3 -m http.server 8000
# tarayıcıda http://localhost:8000
```

## Yol haritası
- [x] v1: kişisel av günlüğü, harita, hava, istatistik, rehber
- [x] Mera sıralama, nokta tahmini, tatlı su desteği
- [x] Harita + sıralama tek ekran, tür tahmini, grafikler, öneri metni
- [ ] v2: arkadaş grubu (giriş, ortak akış, ortak meralar)
- [ ] v2: sıralama tablosu, rozetler, aylık yarışma
- [ ] Plan/buluşma, bildirimler
- [ ] Fotoğraftan tür tanıma
