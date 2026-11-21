# Karta "Teren" (karta društva sa servera)

Podloga **Teren** je MBTiles fajl koji lovac jednom preuzme u aplikaciji (Karte i offline → Preuzmi Teren), a poslije radi potpuno offline.

## Objava fajla

1. Pripremi `teren.mbtiles` (npr. MOBAC / RMaps / QGIS "Generate XYZ tiles (MBTiles)"), PNG ili JPG pločice, TMS redoslijed.
2. Na GitHub-u napravi Release sa tagom **`karte`** i dodaj fajl pod tačnim imenom `teren.mbtiles`.
3. **Ne označavaj taj Release kao "latest"** (isključi "Set as the latest release"): inače `releases/latest/download/app-debug.apk` prestaje voditi na APK.
4. Aplikacija preuzima sa `https://github.com/<repo>/releases/download/karte/teren.mbtiles`.

Za novu verziju karte zamijeni asset istog imena; lovci je uklone i ponovo preuzmu.

## Napomene

- Preuzimanje radi samo u APK-u (native `AndroidKarte.preuzmi`), uz provjeru slobodnog prostora; u browseru se prikazuje poruka.
- Dozvoljeni su samo https linkovi na github.com / `/releases/download/` / `.mbtiles`.
