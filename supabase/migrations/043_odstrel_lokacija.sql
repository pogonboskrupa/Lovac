-- 043: gdje je divljač ustrijeljena u lovu. Odstrel u lovu (`lov_odstrel`) je do sada nosio samo vrstu, vrijeme i stan;
-- lokaciju je imao samo privatni zapis odstrela lovca. Sada lovac uz odstrel u lovu šalje i tačku (lat/lon), pa se
-- u arhivi lova vide pogoci na karti zajedno sa tragovima kretanja. Nova kolona je neobavezna (stariji redovi je nemaju).
-- Ko smije vidjeti i upisati red, ostaje isto (007: `vidi_lov` čita, učesnik upisuje svoj red). Idempotentno;
-- zavisi samo od tabele iz 007.

alter table public.lov_odstrel add column if not exists lat double precision;
alter table public.lov_odstrel add column if not exists lon double precision;

-- constraint se uvijek iznova postavlja (idempotentno i kad je ranija verzija bila drugačija)
alter table public.lov_odstrel drop constraint if exists lov_odstrel_lokacija_ok;
alter table public.lov_odstrel add constraint lov_odstrel_lokacija_ok
  check ((lat is null and lon is null)
      or (lat is not null and lon is not null and lat between -90 and 90 and lon between -180 and 180));
