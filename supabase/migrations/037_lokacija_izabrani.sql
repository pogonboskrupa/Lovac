-- 037: dijeljenje lokacije sa IZABRANIM lovcima (jedan ili više, po imenu iz pretrage) na ograničeno vrijeme (najviše 24 h).
-- Lokaciju vidi samo lovac koji dijeli i primalac, i samo dok dijeljenje traje; ne vide je ni administrator ni ostali.
-- Dijeliti i primati mogu samo stvarni članovi društva (`je_clan_drustva`, `je_stvarni_clan`), ne probni nalozi.
-- Idempotentno.

-- Iz 026 (isto tijelo): migracija mora raditi i kad 026 još nije pokrenuta na serveru.
create or replace function public.je_clan_drustva()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select k.odobren from public.korisnici k where k.id = auth.uid()), false);
$$;
revoke execute on function public.je_clan_drustva() from public, anon;
grant execute on function public.je_clan_drustva() to authenticated;

-- Iz 033 (isto tijelo).
create or replace function public.je_stvarni_clan(p_korisnik uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select k.odobren from public.korisnici k where k.id = p_korisnik), false);
$$;
revoke execute on function public.je_stvarni_clan(uuid) from public, anon;
grant execute on function public.je_stvarni_clan(uuid) to authenticated;

create table if not exists public.lokacije_izabranih (
  vlasnik_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  primalac_id uuid not null references public.korisnici (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  acc double precision,
  t timestamptz not null default now(),
  do_ timestamptz not null,
  primary key (vlasnik_id, primalac_id),
  check (vlasnik_id <> primalac_id)
);
create index if not exists lokacije_izabranih_primalac on public.lokacije_izabranih (primalac_id);

-- vlasnika i vrijeme postavlja server; najviše 30 primalaca po lovcu
create or replace function public.zastiti_lokaciju_izabranih()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.vlasnik_id := old.vlasnik_id;
    new.primalac_id := old.primalac_id;
  else
    if auth.uid() is not null then new.vlasnik_id := auth.uid(); end if;
    if (select count(*) from public.lokacije_izabranih where vlasnik_id = new.vlasnik_id) >= 30 then
      raise exception 'previse_primalaca' using errcode = '54000';
    end if;
  end if;
  new.t := now();
  return new;
end;
$$;

drop trigger if exists zastita on public.lokacije_izabranih;
create trigger zastita before insert or update on public.lokacije_izabranih
  for each row execute function public.zastiti_lokaciju_izabranih();

alter table public.lokacije_izabranih enable row level security;
drop policy if exists samo_odobreni on public.lokacije_izabranih;
create policy samo_odobreni on public.lokacije_izabranih as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.lokacije_izabranih from anon;
revoke all on public.lokacije_izabranih from authenticated;
grant select, insert, update, delete on public.lokacije_izabranih to authenticated;

drop policy if exists citanje on public.lokacije_izabranih;
create policy citanje on public.lokacije_izabranih for select to authenticated
  using (do_ > now() and (vlasnik_id = auth.uid() or primalac_id = auth.uid()));
drop policy if exists unos on public.lokacije_izabranih;
create policy unos on public.lokacije_izabranih for insert to authenticated
  with check (vlasnik_id = auth.uid() and public.je_clan_drustva() and public.je_stvarni_clan(primalac_id)
              and do_ <= now() + interval '24 hours 5 minutes');
drop policy if exists izmjena on public.lokacije_izabranih;
create policy izmjena on public.lokacije_izabranih for update to authenticated
  using (vlasnik_id = auth.uid())
  with check (vlasnik_id = auth.uid() and public.je_clan_drustva() and public.je_stvarni_clan(primalac_id)
              and do_ <= now() + interval '24 hours 5 minutes');
drop policy if exists brisanje on public.lokacije_izabranih;
create policy brisanje on public.lokacije_izabranih for delete to authenticated using (vlasnik_id = auth.uid());
