# Minirana područja (BHMAC)

Sloj "Minirana područja (BHMAC)" u Granice lovišta: crvena popuna sa 60 % neprozirnosti i crvena linija. Podaci se **ne pakuju u APK**: aplikacija ih sama skida
(pri pokretanju kad ima veze, pa jednom sedmično) i čuva u IndexedDB-u, pa rade bez interneta.

## Objava podataka

Izvor je KML od BHMAC-a (polje `Naziv`, `SHAPE_Area`, poligoni u WGS84). Aplikacija ga čita sa:

`https://raw.githubusercontent.com/<repo>/podaci/minirano.kml`

Grana **`podaci`** je siročad grana (bez koda) sa jednim fajlom `minirano.kml`. Release asset se ne koristi jer `github.com/.../releases/download` ne šalje CORS
zaglavlja, pa ga WebView ne može čitati običnim `fetch`-om (raw.githubusercontent.com šalje `Access-Control-Allow-Origin: *`, kao i `version.json` na grani `verzija`).

Nova verzija BHMAC podataka: zamijeni `minirano.kml` na grani `podaci`; telefoni je preuzmu najkasnije za sedmicu dana (ili odmah dugmetom "Preuzmi / ažuriraj").

```bash
git checkout --orphan podaci && git rm -rf . && cp /putanja/MINIRANO_MAC.kml minirano.kml
git add minirano.kml && git commit -m "BHMAC minirana područja" && git push origin podaci
```

## Napomene

- Sloj se ne može ukloniti sa telefona (sigurnosni sloj); lovac ga može samo sakriti ("Prikaži na karti"), a ponovno preuzimanje to pamti.
- UI uvijek kaže da su podaci orijentacioni i da ne zamjenjuju oznake na terenu ni upozorenja nadležnih.
- Fajl od 25. 11. 2026.: 215 poligona (Bosanska Krupa, Bužim, Cazin; 15,74–16,45 E, 44,65–45,23 N), ~320 KB.
