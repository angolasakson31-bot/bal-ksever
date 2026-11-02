# 🎣 Rastgele

Kıyıdan balık tutan arkadaşlar için av günlüğü. Telefonda uygulama gibi çalışan bir web sitesi (PWA); iPhone ve Android'de çalışır.

## v1 özellikleri
- **Av günlüğü:** fotoğraf, tür, boy, ağırlık, adet, yem, takım, mera, konum, not. Asgari boy uyarısı.
- **Mera haritası:** meraları haritada işaretleme, avları haritada görme, Google/Apple yol tarifi.
- **Harita & Meralarım (tek ekran):** üstte harita, altta işaretlenen bütün meraların en iyiden en kötüye sıralaması. Haritadaki işaretlerde sıra numarası ve skor rengi görünür.
  Zaman seçenekleri: şimdi, +1/+3/+6/+12 saat, bu akşam, yarın sabah, yarın akşam, 24 saatin en iyisi, 7 gün içinde istenen gün/saat.
- **Meraya dokun → ayrıntılı tahmin:** öneri metni (ne zaman, hangi tür, hangi yem/takım, rüzgara göre nereye atılır), türlere göre tahmin,
  grafikler (skor, rüzgar/hamle, dalga/soluğan veya yağış, hava/su sıcaklığı, basınç), ayrıntılı hava (hissedilen, nem, görüş, UV,
  dalga periyodu, akıntı, güneş ve ay doğuş/batış, solunar).
- **Meraya basılı tut:** adını değiştir, sil, düzenle, av ekle, yol tarifi.
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
