-- 040: Sekcije i pristup, dio 2 — imena podnosilaca zahtjeva, odluke (odobren / odbijen sa razlogom / prebačen) koje
-- podnosilac vidi, historija odluka po sekciji i opis sekcije sa mjestom okupljanja.
-- Zavisi samo od 001–025 (migracije se pokreću ručno i ne uvijek redom). Idempotentno.

-- ---------- opis sekcije i mjesto okupljanja ----------
alter table public.sekcije add column if not exists opis text;
alter table public.sekcije add column if not exists okupljanje text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sekcije_opis_duzina') then
    alter table public.sekcije add constraint sekcije_opis_duzina check (opis is null or length(opis) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sekcije_okupljanje_duzina') then
    alter table public.sekcije add constraint sekcije_okupljanje_duzina check (okupljanje is null or length(okupljanje) <= 200);
  end if;
end $$;

-- ---------- imena podnosilaca ----------
-- Neodobreni (probni) nalozi nisu u spisku članova društva (korisnici_citanje), pa je grupovođa vidio "drugi lovac".
-- Funkcija daje ime i nadimak SAMO za zahtjeve na čekanju u sekcijama kojima pozivalac upravlja ili ih odobrava.
create or replace function public.imena_podnosilaca()
returns table (korisnik_id uuid, ime text, prezime text, nadimak text)
language sql stable security definer
set search_path = public
as $$
  select k.id, k.ime, k.prezime, k.nadimak
    from public.korisnici k
   where exists (
     select 1 from public.sekcija_clanovi c join public.sekcije s on s.id = c.sekcija_id
      where c.korisnik_id = k.id and c.status = 'ceka'
        and (public.moze_upravljati_sekcijom(s.id) or public.je_lovocuvar_revira(s.revir_id)));
$$;
revoke execute on function public.imena_podnosilaca() from public, anon;
grant execute on function public.imena_podnosilaca() to authenticated;

-- ---------- odluke o zahtjevima ----------
create table if not exists public.sekcija_odluke (
  id uuid primary key default gen_random_uuid(),
  sekcija_id uuid not null references public.sekcije (id) on delete cascade,
  korisnik_id uuid not null references public.korisnici (id) on delete cascade,
  odluka text not null check (odluka in ('odobren', 'odbijen', 'prebacen')),
  razlog text check (razlog is null or length(razlog) <= 300),
  u_sekciju uuid references public.sekcije (id) on delete set null,
  odlucio uuid references public.korisnici (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sekcija_odluke_korisnik on public.sekcija_odluke (korisnik_id, created_at);
create index if not exists sekcija_odluke_sekcija on public.sekcija_odluke (sekcija_id, created_at);

alter table public.sekcija_odluke enable row level security;
-- Bez RESTRICTIVE je_odobren(): odbijeni podnosilac čiji je probni period istekao mora vidjeti odluku i razlog.
drop policy if exists citanje on public.sekcija_odluke;
create policy citanje on public.sekcija_odluke for select to authenticated using (
  korisnik_id = auth.uid()
  or public.moze_upravljati_sekcijom(sekcija_id)
  or public.je_lovocuvar_revira((select s.revir_id from public.sekcije s where s.id = sekcija_id)));
revoke all on public.sekcija_odluke from anon, authenticated;
grant select on public.sekcija_odluke to authenticated;

-- Odluke upisuje SAMO server (okidač), nikad klijent.
create or replace function public.zapisi_odluku_zahtjeva()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_u text := nullif(current_setting('lovac.prebaci_u', true), '');
  v_razlog text := nullif(trim(coalesce(current_setting('lovac.razlog', true), '')), '');
begin
  -- Kaskadno brisanje (obrisan nalog ili sekcija) nije odluka o zahtjevu. Provjera dubine okidača tu ne pomaže
  -- (AFTER okidači kaskade se izvršavaju na dubini 1), pa se provjerava da li nalog i sekcija još postoje.
  if not exists (select 1 from public.korisnici k where k.id = coalesce(new.korisnik_id, old.korisnik_id))
     or not exists (select 1 from public.sekcije s where s.id = coalesce(new.sekcija_id, old.sekcija_id)) then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'ceka' and new.status = 'odobren' then
      insert into public.sekcija_odluke (sekcija_id, korisnik_id, odluka, odlucio)
      values (new.sekcija_id, new.korisnik_id, 'odobren', auth.uid());
    end if;
    return new;
  end if;
  -- DELETE: lovac koji sam povuče zahtjev nije odbijen.
  if old.status = 'ceka' and auth.uid() is distinct from old.korisnik_id then
    if v_u is not null then
      insert into public.sekcija_odluke (sekcija_id, korisnik_id, odluka, u_sekciju, odlucio)
      values (old.sekcija_id, old.korisnik_id, 'prebacen', v_u::uuid, auth.uid());
    else
      insert into public.sekcija_odluke (sekcija_id, korisnik_id, odluka, razlog, odlucio)
      values (old.sekcija_id, old.korisnik_id, 'odbijen', left(v_razlog, 300), auth.uid());
    end if;
  end if;
  return old;
end;
$$;
revoke execute on function public.zapisi_odluku_zahtjeva() from public, anon, authenticated;

drop trigger if exists odluka_zahtjeva on public.sekcija_clanovi;
create trigger odluka_zahtjeva
  after update of status or delete on public.sekcija_clanovi
  for each row execute function public.zapisi_odluku_zahtjeva();

-- Odbijanje sa razlogom: grupovođa / lovočuvar revira / admin. Razlog ide okidaču kroz postavku transakcije.
create or replace function public.odbij_zahtjev_razlog(p_sekcija uuid, p_korisnik uuid, p_razlog text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not (public.moze_upravljati_sekcijom(p_sekcija)
          or public.je_lovocuvar_revira((select s.revir_id from public.sekcije s where s.id = p_sekcija))) then
    raise exception 'Nemaš pravo odbiti zahtjev' using errcode = '42501';
  end if;
  perform set_config('lovac.razlog', left(coalesce(p_razlog, ''), 300), true);
  delete from public.sekcija_clanovi
   where sekcija_id = p_sekcija and korisnik_id = p_korisnik and status = 'ceka' and pozvao_id is null;
  perform set_config('lovac.razlog', '', true);
end;
$$;
revoke execute on function public.odbij_zahtjev_razlog(uuid, uuid, text) from public, anon;
grant execute on function public.odbij_zahtjev_razlog(uuid, uuid, text) to authenticated;

-- Prebacivanje (iz 039, isto ponašanje) sada ostavlja odluku "prebačen" umjesto "odbijen".
create or replace function public.premjesti_zahtjev(p_iz uuid, p_u uuid, p_korisnik uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not (public.je_admin()
          or public.moze_upravljati_sekcijom(p_iz)
          or public.je_lovocuvar_revira((select s.revir_id from public.sekcije s where s.id = p_iz))) then
    raise exception 'Nemaš pravo prebaciti zahtjev' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sekcije s where s.id = p_u and s.aktivno) then
    raise exception 'Sekcija ne postoji' using errcode = 'P0002';
  end if;
  perform set_config('lovac.prebaci_u', p_u::text, true);
  delete from public.sekcija_clanovi
   where sekcija_id = p_iz and korisnik_id = p_korisnik and status = 'ceka';
  if not found then
    perform set_config('lovac.prebaci_u', '', true);
    raise exception 'Zahtjev ne postoji' using errcode = 'P0002';
  end if;
  perform set_config('lovac.prebaci_u', '', true);
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status)
  values (p_u, p_korisnik, 'ceka')
  on conflict do nothing;
end;
$$;
revoke execute on function public.premjesti_zahtjev(uuid, uuid, uuid) from public, anon;
grant execute on function public.premjesti_zahtjev(uuid, uuid, uuid) to authenticated;
