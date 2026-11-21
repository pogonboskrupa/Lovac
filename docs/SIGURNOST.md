# Sigurnosne napomene

## Potpisni ključ APK-a je u repozitoriju

`android/app/debug.keystore` je commit-ovan namjerno: bez istog ključa update preko postojeće instalacije
pada ("App not installed"). Posljedica: **ko ima pristup repozitoriju može potpisati APK istim ključem**, pa taj
APK Android prihvata kao update aplikacije (npr. ako ga lovac ručno instalira iz lažne poruke).
Update iz aplikacije se preuzima samo sa Release-a ovog repozitorija, tako da napadač bez prava pisanja
ne može podmetnuti fajl kroz taj kanal.

Stanje u trenutku pisanja: repozitorij je **javan**.

### Plan (uradi pri prebacivanju repozitorija na novi nalog)

1. Prije promjene ključa u aplikaciji napravi izvoz/rezervnu kopiju svih zapisa (novi ključ znači
   jednokratnu deinstalaciju stare aplikacije, a lokalni podaci se brišu).
2. Napravi novi keystore van repozitorija, spremi ga u GitHub Secrets (`KEYSTORE_B64`, `KEYSTORE_PASSWORD`,
   `KEY_ALIAS`, `KEY_PASSWORD`) i u CI-ju ga dekodiraj pri buildu.
3. Ukloni `debug.keystore` iz repozitorija (i iz historije ako repozitorij ostaje javan).
4. Ili ostavi ključ, ali repozitorij napravi **privatnim** (GitHub Pages webapp je samo za razvoj).

Dok se to ne uradi: ne dijeli link ka repozitoriju izvan društva i ne instaliraj APK koji ne dolazi iz Release-a.

## Ostalo

- U repozitoriju je samo javni (publishable) Supabase ključ; `service_role`/secret ključ se nikad ne commit-uje.
- Pristup se provjerava na serveru (RLS); klijent samo prikazuje ono što server dozvoli.
