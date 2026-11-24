-- 034: odaziv na lov — kad grupovođa napravi lov, članovi sekcije dobiju pitanje "Dolaziš?".
-- "Da" ide i kao samoprijava u lov_ucesnici (013); ovdje se pamti i "Ne", da grupovođa zna ko ne dolazi.
-- Odgovara samo odobreni član sekcije lova dok je lov planiran/u toku (isto pravilo kao samoprijava:
-- moze_prijaviti_prisustvo). Vide: ko vidi lov (učesnici, članovi sekcije, organizatori, admin).
-- `korisnik_id` i `promijenjeno` postavlja server. Idempotentno.

create table if not exists public.lov_odazivi (
  lov_id uuid not null references public.lovovi (id) on delete cascade,
  korisnik_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  odgovor text not null check (odgovor in ('da', 'ne')),
  promijenjeno timestamptz not null default now(),
  primary key (lov_id, korisnik_id)
);
create index if not exists lov_odazivi_lov on public.lov_odazivi (lov_id, promijenjeno);

create or replace function public.zastiti_odaziv()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.lov_id := old.lov_id;
    new.korisnik_id := old.korisnik_id;
  elsif auth.uid() is not null then
    new.korisnik_id := auth.uid();
  end if;
  new.promijenjeno := now();
  return new;
end;
$$;

drop trigger if exists zastita on public.lov_odazivi;
create trigger zastita before insert or update on public.lov_odazivi
  for each row execute function public.zastiti_odaziv();

alter table public.lov_odazivi enable row level security;
drop policy if exists samo_odobreni on public.lov_odazivi;
create policy samo_odobreni on public.lov_odazivi as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.lov_odazivi from anon;
revoke all on public.lov_odazivi from authenticated;
grant select, insert, update, delete on public.lov_odazivi to authenticated;

drop policy if exists citanje on public.lov_odazivi;
create policy citanje on public.lov_odazivi for select to authenticated
  using (korisnik_id = auth.uid() or public.vidi_lov(lov_id));
drop policy if exists unos on public.lov_odazivi;
create policy unos on public.lov_odazivi for insert to authenticated
  with check (korisnik_id = auth.uid() and public.moze_prijaviti_prisustvo(lov_id));
drop policy if exists izmjena on public.lov_odazivi;
create policy izmjena on public.lov_odazivi for update to authenticated
  using (korisnik_id = auth.uid())
  with check (korisnik_id = auth.uid() and public.moze_prijaviti_prisustvo(lov_id));
drop policy if exists brisanje on public.lov_odazivi;
create policy brisanje on public.lov_odazivi for delete to authenticated using (korisnik_id = auth.uid());
