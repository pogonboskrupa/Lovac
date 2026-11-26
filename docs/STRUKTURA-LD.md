# Struktura LD Grmeč

Opis hijerarhije vodstva i toga kako se njome upravlja u aplikaciji (Postavke → tab **Struktura LD Grmeč**).

## Stablo

```
Predsjednik (1)
├─ Lovočuvar udruženja 1 i 2 (najviše 2, rade na cijelom području)
└─ Lovovođa udruženja (1)
   └─ Revir (3: Krupa, Otoka, Jezerski) — Lovovođa revira (1 po reviru)
      └─ Sekcija — Lovovođa sekcije (1 po sekciji)
         └─ Grupa — Grupovođa (grupa nema naziv, prepoznaje se po grupovođi)
            └─ Lovci (lovac je u jednoj grupi po sekciji)
```

## Ko šta vidi i radi

| Uloga | Tab Struktura LD Grmeč | Šta smije |
|---|---|---|
| Administrator | vidi i uređuje | dodjeljuje i skida sve uloge, pravi naloge, dodaje grupe, lovce u grupe |
| Predsjednik, lovočuvari, lovovođe | vide | lovovođa sekcije/revira/udruženja dodaje lovce u grupe |
| Grupovođa grupe, lovac | ne vide | grupovođa dopušta višima da organizuju lov za njegovu grupu |

Prava provodi server (RLS, migracija 045); aplikacija samo prikazuje šta je dozvoljeno.

## Uređivanje (administrator)

Uz svako mjesto je sklopiva kartica **Uredi**:

- **Dodijeli** — postojeći član dobija ulogu (kod jednomjesnih uloga zamjenjuje sadašnjeg);
- **Skini** — skida ulogu (drugi dodir);
- **Napravi nalog** — za prazno mjesto otvara formu Novi lovac sa već izabranom ulogom i sekcijom;
- **Dodaj grupu** (kod sekcije) — grupa se pravi tek kad postoji član koji će biti grupovođa.

## Lovci u grupi

Uslov je da grupa (dakle i grupovođa) već postoji. Na grupi:

- **Napravi lovca u ovoj grupi** — nalog se pravi u sekciji grupe i lovac odmah ulazi u grupu;
- **Postojeći član bez grupe → Dodaj u grupu**;
- **Ukloni grupu** (samo administrator) — lovci ostaju bez grupe.

Dodaju administrator, lovovođa te sekcije, lovovođa revira i lovovođa udruženja.

## Registracija i izbor grupe

Lovci se sami registruju i traže sekciju. Poslije prijave u Sekcije i pristup dodirnu **Izaberi grupu** i izaberu grupovođu čijoj grupi žele pripadati. Kad im članstvo odobri administrator, lovovođa sekcije (ili revira/udruženja), automatski ulaze u izabranu grupu; član bez grupe čeka odobrenje u kartici Grupe.

## Korisnici i odobrenja

Odmah ispod stabla je kartica sa brojkama (čeka odobrenje, probni period, odobreno, administratori) i dugme koje otvara cijeli ekran Korisnici i odobrenja.

## Pregled

Pločice: popunjena i slobodna mjesta (predsjednik, lovočuvari, lovovođa udruženja, revir i sekcije; grupa postoji samo sa grupovođom), broj revira, sekcija i grupa, traka popunjenosti. Revir i sekcija se sklapaju. Prazno mjesto je istaknuto isprekidanim okvirom.
