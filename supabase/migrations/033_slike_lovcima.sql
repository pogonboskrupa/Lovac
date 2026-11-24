-- 033: slanje slike drugom lovcu. Server je samo "poštanski sandučić": slika stoji najviše slike_lovcima_rok()
-- (12 h) i briše se čim je primalac preuzme ili kad rok istekne; obje strane je zadržavaju na svom telefonu.
-- Šalje i prima samo stvarni član društva (ne probni nalog — bilo ko može napraviti nalog).
-- Vidi samo pošiljalac i primalac (admin NE). Bez izmjene; brišu pošiljalac i primalac. Idempotentno.

create or replace function public.slike_lovcima_rok()
returns interval language sql immutable as $$ select interval '12 hours' $$;

create table if not exists public.slike_lovcima (
  id uuid primary key,
  posiljalac_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  primalac_id uuid not null references public.korisnici (id) on delete cascade,
  slika text not null check (char_length(slika) <= 1300000),
  opis text check (opis is null or char_length(opis) <= 500),
  lat double precision check (lat is null or lat between -90 and 90),
  lon double precision check (lon is null or lon between -180 and 180),
  created_at timestamptz not null default now(),
  istice timestamptz not null default now() + interval '12 hours',
  check (primalac_id <> posiljalac_id)
);
create index if not exists slike_lovcima_primalac on public.slike_lovcima (primalac_id, istice);
create index if not exists slike_lovcima_posiljalac on public.slike_lovcima (posiljalac_id, istice);
create index if not exists slike_lovcima_istice on public.slike_lovcima (istice);

create or replace function public.je_stvarni_clan(p_korisnik uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select k.odobren from public.korisnici k where k.id = p_korisnik), false);
$$;
revoke execute on function public.je_stvarni_clan(uuid) from public, anon;
grant execute on function public.je_stvarni_clan(uuid) to authenticated;

-- Briše istekle slike svih korisnika (zove ga klijent, a i svako novo slanje), vraća broj obrisanih.
create or replace function public.ocisti_slike_lovcima()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.je_odobren() then return 0; end if;
  delete from public.slike_lovcima where istice <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.ocisti_slike_lovcima() from public, anon;
grant execute on function public.ocisti_slike_lovcima() to authenticated;

-- Pošiljaoca, vrijeme i rok postavlja server; najviše 30 neisteklih slika po pošiljaocu (prostor besplatnog servera).
create or replace function public.zastiti_sliku_lovcu()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.posiljalac_id := auth.uid();
  new.created_at := now();
  new.istice := now() + public.slike_lovcima_rok();
  delete from public.slike_lovcima where istice <= now();
  if (select count(*) from public.slike_lovcima where posiljalac_id = auth.uid()) >= 30 then
    raise exception 'Previše poslanih slika koje još čekaju preuzimanje (najviše 30)' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists zastita on public.slike_lovcima;
create trigger zastita before insert on public.slike_lovcima
  for each row execute function public.zastiti_sliku_lovcu();

alter table public.slike_lovcima enable row level security;
drop policy if exists samo_odobreni on public.slike_lovcima;
create policy samo_odobreni on public.slike_lovcima as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.slike_lovcima from anon;
revoke all on public.slike_lovcima from authenticated;
grant select, insert, delete on public.slike_lovcima to authenticated;

drop policy if exists citanje on public.slike_lovcima;
create policy citanje on public.slike_lovcima for select to authenticated
  using ((posiljalac_id = auth.uid() or primalac_id = auth.uid()) and istice > now());
drop policy if exists unos on public.slike_lovcima;
create policy unos on public.slike_lovcima for insert to authenticated
  with check (public.je_clan_drustva() and public.je_stvarni_clan(primalac_id) and primalac_id <> auth.uid());
drop policy if exists brisanje on public.slike_lovcima;
create policy brisanje on public.slike_lovcima for delete to authenticated
  using (posiljalac_id = auth.uid() or primalac_id = auth.uid());
