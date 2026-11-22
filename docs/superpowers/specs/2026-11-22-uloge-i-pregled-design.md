# Četiri profila i pregled ulova — kratki dizajn

## Namjera
Društvo ima četiri uloge: **administrator** (predsjednik, sekretar...), **lovočuvar** (po reviru), **grupovođa** (vodi sekciju u reviru) i **lovac** (član sekcije). Svaka treba pregled onoga što joj je potrebno za posao, a granice pristupa provodi server.

## Ciljevi
- Administrator vidi cijelo društvo: sve revire, sekcije, statistike i prijavljene ulove.
- Lovočuvar vidi svoj revir, grupovođa svoju sekciju, lovac svoje prijave.
- Ulov postaje vidljiv rukovodstvu tek kad ga lovac **zvanično prijavi** (varijanta 1, izabrao vlasnik projekta).

## Ne-ciljevi / anti-ciljevi
- Administrator NE vidi privatne zapise lovaca (odluka vlasnika). Zapis odstrela ostaje privatan; prijava je zaseban, namjerno podijeljen red.
- Tačna lokacija i napomene se ne prijavljuju.
- Ne zamjenjuje službeni lovački dnevnik.

## Pristupi koje smo razmotrili
1. **Prijava kao zaseban red (`ulov_prijave`)** — odabrano: čista granica privatnosti, RLS po ulozi, jednostavno sabiranje.
2. Administrator vidi odstrel sa vidljivošću "društvo" — ne traži novi korak lovca, ali nema zvanične prijave i miješa dijeljenje sa prijavom.
3. Admin vidi sve odstrele — odbačeno (krši odluku o privatnosti).

## Odluke
- Migracija 022: `ulov_prijave` (id = id lokalnog zapisa, idempotentno), `moze_prijaviti_ulov` (član/grupovođa sekcije u tom reviru, admin bilo gdje), `vidi_prijavu` (admin sve, lovočuvar revira, grupovođa sekcije). Prijava se ne mijenja; vlasnik je može samo povući (konačno).
- Klijent: dugme "Prijavi društvu" na kartici odstrela, izlazna kutija (radi bez interneta), ekran Meni → Pregled prilagođen ulozi (čista logika `pregled.js`, keš u IndexedDB-u radi offline).
- Uloga se izvodi iz podataka (`viewerRole`), nikad iz imena.

## Ostavljeno
- Potvrda prijave od strane grupovođe/lovočuvara, i izvoz pregleda u Excel/PDF, nisu u ovoj verziji.
