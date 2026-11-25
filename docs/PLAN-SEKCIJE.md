# Plan: Meni → Sekcije i pristup (dva dijela)

Stanje (snimci ekrana, 25. 11. 2026.): jedan zahtjev zauzima pola ekrana (Odobri/Odbij, pa "Prebaci u…" i "Prebaci" svaki u svom redu);
filteri se lome u dva reda; "Osvježi sa servera" je veliko dugme u svom redu; uvodni tekst je isti za sve uloge; crvena značka broja
zahtjeva "bježi" iz kartice u gornji desni ugao ekrana (preko ×); kartica sekcije ima velike kutije sa brojevima i dugmad preko cijele
širine; spisak članova je samo imena u tekstu. Grupovođa vidi podnosioca zahtjeva kao "drugi lovac" (vidi dio 2).

## Dio 1 — pregled i dizajn (v1.3.9)
1. Zaglavlje: brojevi u heroju su dodirljivi (vode na filter), kratka uputa prema ULOZI (lovac / grupovođa / lovočuvar / admin).
2. Filteri u jednom redu sa brojem u svakom (Moje 1 · Za odobrenje 2 · Bez pristupa 5 · Sve 7); pretraga i osvježavanje (ikona) u istom redu.
3. Zahtjevi na čekanju kao kompaktni redovi: avatar (inicijali), ime, "→ sekcija · prije N dana", Odobri / Odbij u jednom redu,
   "Prebaci u drugu sekciju" sklopljeno.
4. Kartica sekcije: logo, naziv, revir i čip uloge; mali brojevi u jednom redu (članova, zahtjeva); grupovođa i lovočuvar sa avatarom;
   članovi kao traka lica (+N) koja se rastvara u spisak imena; glavna radnja jedna, sporedne manje.
5. Revir kao naslov sa brojem sekcija; značka broja zahtjeva ostaje u kartici (ispravka položaja).

## Dio 2 — funkcionalnost (sljedeći korak)
1. Imena podnosilaca zahtjeva za grupovođu/lovočuvara (server funkcija koja daje ime i nadimak samo za zahtjeve u sekcijama kojima
   upravljaš; probni nalozi nisu u spisku članova društva, pa se danas vide kao "drugi lovac").
2. Obavijest podnosiocu kad je zahtjev odobren / odbijen / prebačen (u aplikaciji, uz značku na Meniju).
3. Razlog odbijanja (kratka poruka podnosiocu) i historija odluka po sekciji (ko je i kad odobrio).
4. Opis sekcije i mjesto okupljanja (grupovođa uređuje; vidi se na kartici i u tabu sekcije).
5. Masovno: "Odobri sve" za zahtjeve jedne sekcije (drugi dodir), izvoz spiska članova (CSV za sastanke).
