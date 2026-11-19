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
adb shell dumpsys activity services $PKG | grep -q GpsService || { echo "GpsService ne radi tokom snimanja"; diagnoza; exit 1; }
echo "Snimanje traga OK ($max tačaka)"
adb exec-out screencap -p > emulator.png || true
echo "Emulator test OK"
