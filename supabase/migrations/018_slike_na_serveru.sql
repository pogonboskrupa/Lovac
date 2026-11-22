-- Slike na serveru, ali štedljivo (besplatni Supabase nalog ima malo prostora):
--  * sličica (mala) ostaje trajno, a VELIKA slika (smanjena, ~900 px) traje samo slike_rok() (zadano 14 dana), pa se briše;
--  * slike objekata/opažanja/odstrela slijede vidljivost zapisa (isti RLS kao zapis), a slike lova vide oni koji vide lov.
-- Rok se mijenja samo ovdje (npr. interval '7 days' ako treba još štednje). Idempotentno.

create or replace function public.slike_rok()
returns interval language sql immutable as $$ select interval '14 days' $$;

-- Velike slike lova dobijaju rok trajanja.
alter table public.lov_slike_podaci add column if not exists istice timestamptz not null default (now() + public.slike_rok());

create table if not exists public.slike_zapisa (
  id uuid primary key, -- id fotografije (klijentski UUID)
  zapis_store text not null check (zapis_store in ('objekti', 'opazanja', 'odstrel')),
  zapis_id uuid not null,
  vlasnik_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  mala text not null check (char_length(mala) <= 40000),
  slika text check (slika is null or char_length(slika) <= 1200000), -- null kad rok istekne
  istice timestamptz not null default (now() + public.slike_rok()),
  created_at timestamptz not null default now()
);
create index if not exists slike_zapisa_zapis on public.slike_zapisa (zapis_store, zapis_id);

-- Da li pozivalac VIDI zapis (INVOKER: primjenjuju se RLS politike zapisa, dakle privatno/drustvo/izabrani).
create or replace function public.vidi_zapis(p_store text, p_id uuid)
returns boolean language plpgsql stable security invoker set search_path = public as $$
begin
  return case p_store
    when 'objekti' then exists (select 1 from public.objekti where id = p_id)
    when 'opazanja' then exists (select 1 from public.opazanja where id = p_id)
    when 'odstrel' then exists (select 1 from public.odstrel where id = p_id)
    else false end;
end;
$$;

-- Da li je zapis MOJ (DEFINER, jer se provjerava vlasništvo, ne vidljivost).
create or replace function public.moj_zapis(p_store text, p_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return case p_store
    when 'objekti' then exists (select 1 from public.objekti where id = p_id and vlasnik_id = auth.uid())
    when 'opazanja' then exists (select 1 from public.opazanja where id = p_id and vlasnik_id = auth.uid())
    when 'odstrel' then exists (select 1 from public.odstrel where id = p_id and vlasnik_id = auth.uid())
    else false end;
end;
$$;

alter table public.slike_zapisa enable row level security;
drop policy if exists samo_odobreni on public.slike_zapisa;
create policy samo_odobreni on public.slike_zapisa as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.slike_zapisa from anon;
revoke all on public.slike_zapisa from authenticated;
grant select, insert, update, delete on public.slike_zapisa to authenticated;

drop policy if exists citanje on public.slike_zapisa;
create policy citanje on public.slike_zapisa for select to authenticated
  using (vlasnik_id = auth.uid() or public.vidi_zapis(zapis_store, zapis_id));
drop policy if exists unos on public.slike_zapisa;
create policy unos on public.slike_zapisa for insert to authenticated
  with check (vlasnik_id = auth.uid() and public.moj_zapis(zapis_store, zapis_id));
drop policy if exists izmjena on public.slike_zapisa;
create policy izmjena on public.slike_zapisa for update to authenticated
  using (vlasnik_id = auth.uid()) with check (vlasnik_id = auth.uid() and public.moj_zapis(zapis_store, zapis_id));
drop policy if exists brisanje on public.slike_zapisa;
create policy brisanje on public.slike_zapisa for delete to authenticated using (vlasnik_id = auth.uid());

-- Čišćenje: velika slika se briše poslije roka, sličica ostaje. Smije je pozvati svaki odobreni korisnik (bezopasno).
create or replace function public.ocisti_istekle_slike()
returns integer language plpgsql security definer set search_path = public as $$
declare a integer; b integer;
begin
  if not public.je_odobren() then raise exception 'Samo odobreni korisnici' using errcode = '42501'; end if;
  update public.slike_zapisa set slika = null where slika is not null and istice < now();
  get diagnostics a = row_count;
  delete from public.lov_slike_podaci where istice < now();
  get diagnostics b = row_count;
  return a + b;
end;
$$;

revoke execute on function public.slike_rok(), public.vidi_zapis(text, uuid), public.moj_zapis(text, uuid), public.ocisti_istekle_slike() from public, anon;
grant execute on function public.slike_rok(), public.vidi_zapis(text, uuid), public.moj_zapis(text, uuid), public.ocisti_istekle_slike() to authenticated;
