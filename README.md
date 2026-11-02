# 🎣 Rastgele

Kıyıdan balık tutan arkadaşlar için av günlüğü. Telefonda uygulama gibi çalışan bir web sitesi (PWA); iPhone ve Android'de çalışır.

## v1 özellikleri
- **Av günlüğü:** fotoğraf, tür, boy, ağırlık, adet, yem, takım, mera, konum, not. Asgari boy uyarısı.
- **Mera haritası:** meraları haritada işaretleme, avları haritada görme, Google/Apple yol tarifi.
- **Hava & deniz:** rüzgar (poyraz, lodos…), dalga, basınç değişimi, deniz suyu sıcaklığı, gün doğumu/batımı, ay evresi, 1–10 arası **Rastgele skoru**, en iyi saatler.
- **İstatistik:** tür, saat, ay, yem ve meraya göre dağılım; rekorlar.
- **Rehber:** Marmara türleri (sezon, yem, yöntem, asgari boy), çıkış kontrol listesi.
- **Yedekleme:** tüm verileri tek dosyaya indirip geri yükleme.
- Çevrimdışı çalışır. Veriler sadece telefonda saklanır.

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
- [ ] v2: arkadaş grubu (giriş, ortak akış, ortak meralar)
- [ ] v2: sıralama tablosu, rozetler, aylık yarışma
- [ ] Plan/buluşma, bildirimler
- [ ] Fotoğraftan tür tanıma
