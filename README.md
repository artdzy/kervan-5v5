# Kervan 5v5

Tarayıcıda oynanan, 5'e 5 çok oyunculu taktik FPS. Oyunda bir takım bombayı kurar, diğeri bölgeyi savunur. Eksik oyuncuların yerini botlar doldurur.

## Çalıştırma

Gereksinim: Node.js 18 veya üstü.

```bash
git clone https://github.com/artdzy/kervan-5v5.git
cd kervan-5v5
npm install
npm start
```

Sonra tarayıcıda `http://localhost:3000` adresini aç. Aynı ağdaki arkadaşların, sunucunun açılışta yazdığı `http://<yerel-ip>:3000` adresinden katılabilir.

## İnternetten arkadaşlarla oynamak (ücretsiz)

Oyunu kendi bilgisayarında çalıştırıp Cloudflare Quick Tunnel ile internete açabilirsin. Hesap gerekmez.

```bash
brew install cloudflared   # bir kere
npm start                  # 1. terminal
npm run tunnel             # 2. terminal
```

Tünel `https://....trycloudflare.com` biçiminde bir adres yazar; bu adresi arkadaşlarına gönder. Adres her açılışta değişir ve bilgisayarın açık kaldığı sürece çalışır.

## Oyun

- **Takımlar:** Saldırganlar bombayı A ya da B bölgesine kurar (E basılı, 3,2 sn). Savunanlar bombayı imha eder (kitsiz 10 sn, kitle 5 sn). Kurulan bomba 40 saniyede patlar.
- **Round:** 5 sn hazırlık, 1:55 süre. 13 round alan kazanır, 12. rounddan sonra takımlar yer değiştirir.
- **Ekonomi:** Kazanana $3250, kaybedene $1400'den başlayıp artan para. Silaha göre öldürme ödülü verilir. Satın alma doğuş bölgesinde, round başındaki 20 saniye içinde yapılır.
- **Silahlar:** Bıçak, P9 Tabanca, Magnum .50, SMG-9, Pompalı 12, AK Taarruz, M4 Karabina, Keskin .338 (dürbünlü), El Bombası. Ek ekipman: Kevlar, Kask, İmha Kiti.
- **Botlar:** Takım başına 5 oyuncuya tamamlar. Silah alır, A/B ve tünel rotalarını kullanır, bomba kurar ve imha eder.
- **Sunucu:** Yetkili sunucu, 30 Hz simülasyon, gecikme telafili (lag compensation) isabet tespiti.

## Kontroller

| Tuş | İşlev |
|---|---|
| WASD / Fare | Hareket / nişan |
| Sol tık / Sağ tık | Ateş / dürbün |
| Boşluk, Ctrl veya C, Shift | Zıpla, eğil, sessiz yürü |
| R | Şarjör değiştir |
| 1-5, Q, tekerlek | Silah seç / son silah |
| E (basılı) | Bomba kur / imha et |
| B | Satın alma menüsü |
| Tab | Skor tablosu |
| T / Enter | Sohbet |

## Efektler

- Mermi delikleri, yüzeye göre toz bulutu, taş ve ahşap kıymıkları, taşta kıvılcım
- Kan sisi ve damlaları, arkadaki duvara ve yere kan sıçraması, ölünün altında büyüyen kan gölü
- Fırlayan boş kovanlar (yere düşünce tıngırtı sesi), namlu dumanı, patlama ve yanık izi
- Hasar alınca ekran kenarlarında kan lekeleri; can azaldıkça renk solması ve kalp atışı sesi

## Grafik

Lobideki **Grafik kalitesi** seçeneğiyle ayarlanır:

- **Ultra:** GTAO ortam gölgelendirmesi, bloom, 4K gölge haritası, MSAA.
- **Yüksek:** Bloom ve 2K gölge.
- **Düşük:** Post-processing yok.

Tüm modlarda HDRI ortam aydınlatması ve yansımaları, PBR malzemeler ve ACES ton eşleme açıktır.

## Varlıklar ve lisanslar

- **Silah modelleri (birinci şahıs, animasyonlu):** Sketchfab, [High quality FPS assets koleksiyonu](https://sketchfab.com/ahmettanju.2013/collections/high-quality-fps-assets-for-unity-fd68dd910c354c33ab8f8b1ad6d316f1). Yazar DJMaesen (@bumstrum), lisans **CC BY 4.0**. Ayrıntılar `CREDITS.md` dosyasında.
- **Ortam:** [Poly Haven](https://polyhaven.com), lisans **CC0**.
  - HDRI: *Goegap*
  - Dokular: sandstone_blocks_08, plastered_stone_wall, clay_plaster, cobblestone_floor_08, gravelly_sand, large_floor_tiles_02, concrete_floor_worn_001, rough_wood, rusty_metal_02
  - Modeller: wooden_crate_01/02, old_military_crate, Barrel_01, wooden_barrels_01, planter_pot_clay, ceramic_vase_02, potted_plant_02
- **Asker modeli:** three.js örnek deposundaki `Soldier.glb` (Mixamo karakteri).

### Varlıkları yeniden indirmek

```bash
node tools/fetch-polyhaven.mjs
```

Bu komut Poly Haven HDRI, doku ve modellerini `client/assets/polyhaven/` klasörüne indirir.

```bash
npm run import-models
```

Bu komut `~/Downloads` klasöründeki Sketchfab `.glb` / `.zip` dosyalarını `client/assets/models/<silah>/` altına kopyalar. Her silahın kamera hizalaması ve animasyon kare aralıkları `client/assets/models/config.json` dosyasındadır.

## Geliştirici sayfaları

- `/dev/sheet.html?m=rifle&step=6` — silah animasyonunun karelerini ızgara halinde gösterir.
- `/dev/sheet.html?m=all` — tüm silahların bekleme pozunu gösterir.
- `/dev/vm.html?m=rifle&t=6.8` — silahın oyun içi görünümünü klibin belirli bir anında dondurur.
- `/dev/avatar.html?view=side&w=rifle,pistol` — asker modelini ve silah tutuşunu gösterir.

## Yapı

```
server/   index.js (HTTP + WebSocket), game.js (roundlar, isabet, bomba), bot.js (bot yapay zekâsı)
shared/   constants.js, map.js (ızgara harita, çarpışma, ışın izleme, A*), physics.js, util.js
client/   index.html, css/, js/ (main, world, viewmodel, avatar, effects, audio, hud), assets/, dev/
tools/    fetch-polyhaven.mjs, import-models.mjs
```
