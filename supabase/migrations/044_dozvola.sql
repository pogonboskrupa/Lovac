-- Broj lovačke dozvole u profilu lovca. Čuva se uz opremu (profili_oprema): vidi i piše SAMO vlasnik, ni administrator ni drugi lovci.
-- Zavisi samo od 019 (tabela profili_oprema); sama dodaje kolonu.
alter table public.profili_oprema add column if not exists dozvola text;
alter table public.profili_oprema drop constraint if exists profili_oprema_dozvola_duzina;
alter table public.profili_oprema add constraint profili_oprema_dozvola_duzina check (dozvola is null or char_length(dozvola) <= 40);
