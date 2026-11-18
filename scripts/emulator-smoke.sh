#!/usr/bin/env bash
# Instalira APK na emulator, pokrene ga i provjeri da je web app javila BOOT_OK bez JS grešaka.
set -euo pipefail
APK=android/app/build/outputs/apk/debug/app-debug.apk
adb install -r "$APK"
adb logcat -c
adb shell am start -W -n ba.grmec.lovac/.MainActivity
for i in $(seq 1 30); do
  if adb logcat -d -s LovacJS:I | grep -q BOOT_OK; then break; fi
  sleep 2
done
adb logcat -d -s LovacJS:I > logcat-js.txt || true
cat logcat-js.txt
grep -q BOOT_OK logcat-js.txt || { echo "BOOT_OK nije stigao iz WebView-a"; exit 1; }
if grep -E "Uncaught|neuhvaćena greška|korak .* failed" logcat-js.txt; then
  echo "JS greška pri pokretanju u APK-u"; exit 1
fi
adb exec-out screencap -p > emulator.png || true
echo "Emulator test OK"
