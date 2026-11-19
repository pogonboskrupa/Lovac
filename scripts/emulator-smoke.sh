#!/usr/bin/env bash
# Instalira APK na emulator i provjerava:
#  1) web app javlja BOOT_OK bez JS grešaka;
#  2) snimanje traga: GPS tačke (adb emu geo fix) prolaze kroz native servis i bafer do JS-a.
set -uo pipefail
APK=android/app/build/outputs/apk/debug/app-debug.apk
PKG=ba.grmec.lovac

diagnoza() {
  adb logcat -d > logcat-sve.txt || true
  adb exec-out screencap -p > emulator.png || true
  echo "---- crash / WebView / app ----"
  grep -E "AndroidRuntime|FATAL|chromium|cr_|LovacJS|Lovac |ba\.grmec|WebView" logcat-sve.txt | tail -80 || true
}

cekaj() { # cekaj <regex> <sekundi>
  for _ in $(seq 1 "$2"); do
    adb logcat -d -s LovacJS:I | grep -qE "$1" && return 0
    sleep 1
  done
  return 1
}

adb install -r "$APK" || { diagnoza; exit 1; }
adb shell pm grant $PKG android.permission.ACCESS_FINE_LOCATION || true
adb shell pm grant $PKG android.permission.ACCESS_COARSE_LOCATION || true
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb shell settings put secure location_mode 3 || true

# Veći logcat bafer: sistemski logovi pri hladnom startu emulatora inače istisnu naše linije.
adb logcat -G 16M || true
adb logcat -c
adb shell am start -W -n $PKG/.MainActivity
if ! cekaj BOOT_OK 150; then
  # Hladan start WebView-a na emulatoru zna trajati minutama; jedan ponovni pokušaj se jasno ispisuje.
  echo "UPOZORENJE: BOOT_OK nije stigao u 150 s — ponovno pokretanje app-a (1 pokušaj)"
  adb logcat -d -s LovacJS:I | tail -20 || true
  adb shell am force-stop $PKG
  adb logcat -c
  adb shell am start -W -n $PKG/.MainActivity
  if ! cekaj BOOT_OK 120; then echo "BOOT_OK nije stigao iz WebView-a ni nakon ponovnog pokretanja"; diagnoza; exit 1; fi
fi
adb logcat -d -s LovacJS:I > logcat-js.txt || true
if grep -E "Uncaught|neuhvaćena greška" logcat-js.txt; then echo "JS greška pri pokretanju u APK-u"; diagnoza; exit 1; fi
echo "Pokretanje OK"

# ---- snimanje traga kroz native servis ----
adb shell am force-stop $PKG
adb logcat -c
adb shell am start -W -n $PKG/.MainActivity -e autotest trag
cekaj BOOT_OK 90 || { echo "BOOT_OK (autotest) nije stigao"; diagnoza; exit 1; }
for i in $(seq 0 14); do
  lat=$(awk -v i="$i" 'BEGIN { printf "%.6f", 44.88 + i * 0.0002 }')
  adb emu geo fix 16.1500 "$lat" 300 >/dev/null || true
  sleep 2
done
adb logcat -d -s LovacJS:I > logcat-js.txt || true
grep TRAG_TACAKA logcat-js.txt | tail -3
max=$(grep -oE "TRAG_TACAKA -?[0-9]+" logcat-js.txt | awk '{print $2}' | sort -n | tail -1)
if [ -z "$max" ] || [ "$max" -lt 3 ]; then
  echo "Snimanje traga: stiglo ${max:-0} tačaka kroz native servis (očekivano ≥ 3)"
  diagnoza; exit 1
fi
echo "---- dumpsys (informativno) ----"
adb shell dumpsys activity services $PKG | grep -E "ServiceRecord|isForeground" | head -5 || true
# Stanje servisa iz samog mosta (AndroidGps.isRunning) u zadnjem logu autotesta.
last=$(grep -oE "TRAG_SERVIS (true|false)" logcat-js.txt | tail -1)
[ "$last" = "TRAG_SERVIS true" ] || { echo "GpsService ne radi tokom snimanja ($last)"; diagnoza; exit 1; }
echo "Snimanje traga OK ($max tačaka)"
# ---- offline karta (MBTiles) kroz native SQLite + WebViewAssetLoader ----
python3 - <<'PY'
import base64, sqlite3, os
if os.path.exists('test.mbtiles'):
    os.remove('test.mbtiles')
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
c = sqlite3.connect('test.mbtiles')
c.execute('create table metadata (name text, value text)')
c.execute('create table tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)')
c.executemany('insert into metadata values (?, ?)', [('name', 'Test karta'), ('bounds', '16.0,44.8,16.3,45.0'), ('format', 'png')])
# z12, x 2231, y 1475 (XYZ) -> TMS red 4095 - 1475 = 2620
c.execute('insert into tiles values (12, 2231, 2620, ?)', (png,))
c.commit()
PY
adb shell am force-stop $PKG
adb push test.mbtiles /data/local/tmp/test.mbtiles
adb shell "cat /data/local/tmp/test.mbtiles | run-as $PKG sh -c 'mkdir -p files/karte && cat > files/karte/test.mbtiles'"
adb logcat -c
adb shell am start -W -n $PKG/.MainActivity -e autotest karte
cekaj KARTE_PLOCICA 120 || { echo "KARTE_PLOCICA nije stigla"; adb logcat -d -s LovacJS:I | tail -20; diagnoza; exit 1; }
adb logcat -d -s LovacJS:I | grep -E "KARTE_" | tee -a logcat-js.txt
adb logcat -d -s LovacJS:I | grep -q "KARTE_SPISAK 1 test.mbtiles:12-12" || { echo "Spisak offline karata nije ispravan"; diagnoza; exit 1; }
adb logcat -d -s LovacJS:I | grep -qE "KARTE_PLOCICA 200 image/png [1-9]" || { echo "Pločica iz MBTiles nije servirana"; diagnoza; exit 1; }
echo "Offline karta OK"

adb exec-out screencap -p > emulator.png || true
echo "Emulator test OK"
