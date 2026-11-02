# 🎣 Rastgele

Kıyıdan balık tutan arkadaşlar için av günlüğü. Telefonda uygulama gibi çalışan bir web sitesi (PWA); iPhone ve Android'de çalışır.

## v1 özellikleri
- **Av günlüğü:** fotoğraf, tür, boy, ağırlık, adet, yem, takım, mera, konum, not. Asgari boy uyarısı.
- **Mera haritası:** meraları haritada işaretleme, avları haritada görme, Google/Apple yol tarifi.
- **Mera tahmini (🎯 Tahmin sekmesi):** işaretlenen tüm meraları balık skoruna göre en iyiden en kötüye sıralar. Zaman seçilebilir: şimdi, bu akşam, yarın sabah, 24 saatin en iyisi ya da 7 gün içinde istenen gün ve saat.
- **Haritada herhangi bir noktaya dokun:** o noktanın şu anki skoru, rüzgarı, dalgası ve su sıcaklığı; saat saat 7 günlük detay.
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

Veriler her açılışta Open-Meteo'dan çekilir. Tahminler saatlik güncellenir, uygulamayı güncellemek gerekmez.

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
- [ ] v2: arkadaş grubu (giriş, ortak akış, ortak meralar)
- [ ] v2: sıralama tablosu, rozetler, aylık yarışma
- [ ] Plan/buluşma, bildirimler
- [ ] Fotoğraftan tür tanıma
