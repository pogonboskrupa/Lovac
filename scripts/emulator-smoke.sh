#!/usr/bin/env bash
# Instalira APK na emulator, pokrene ga i provjeri da je web app javila BOOT_OK bez JS grešaka.
set -uo pipefail
APK=android/app/build/outputs/apk/debug/app-debug.apk

diagnoza() {
  adb logcat -d > logcat-sve.txt || true
  adb exec-out screencap -p > emulator.png || true
  echo "---- crash / WebView / app ----"
  grep -E "AndroidRuntime|FATAL|chromium|cr_|LovacJS|Lovac |ba\.grmec|WebView" logcat-sve.txt | tail -80 || true
}

adb install -r "$APK" || { diagnoza; exit 1; }
adb logcat -c
adb shell am start -W -n ba.grmec.lovac/.MainActivity
for i in $(seq 1 45); do
  if adb logcat -d -s LovacJS:I | grep -q BOOT_OK; then break; fi
  sleep 2
done
adb logcat -d -s LovacJS:I > logcat-js.txt || true
cat logcat-js.txt
if ! grep -q BOOT_OK logcat-js.txt; then
  echo "BOOT_OK nije stigao iz WebView-a"
  diagnoza
  exit 1
fi
if grep -E "Uncaught|neuhvaćena greška" logcat-js.txt; then
  echo "JS greška pri pokretanju u APK-u"
  diagnoza
  exit 1
fi
adb exec-out screencap -p > emulator.png || true
echo "Emulator test OK"
