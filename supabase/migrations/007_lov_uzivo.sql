-- 007: zajednički lov uživo — pozicije učesnika, SOS i odstrel u lovu.
-- Idempotentno. Pozicije i SOS su dostupni SAMO učesnicima i organizatorima, i SAMO dok lov traje.

create or replace function public.lov_u_toku(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lovovi l where l.id = p_lov and l.status = 'u_toku');
$$;

create table if not exists public.lov_pozicije (
  lov_id uuid not null references public.lovovi (id) on delete cascade,
  korisnik_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  lat double precision not null,
  lon double precision not null,
  acc double precision,
  t timestamptz not null default now(),
  primary key (lov_id, korisnik_id)
);

create table if not exists public.sos (
  id uuid primary key,
  lov_id uuid not null references public.lovovi (id) on delete cascade,
  korisnik_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  lat double precision,
  lon double precision,
  poruka text,
  created_at timestamptz not null default now()
);

create table if not exists public.lov_odstrel (
  id uuid primary key,
  lov_id uuid not null references public.lovovi (id) on delete cascade,
  korisnik_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  vrsta text not null,
  kategorija text,
  vrijeme timestamptz not null,
  tezina double precision,
  stan_broj int
);

do $$
declare t text;
begin
  foreach t in array array['lov_pozicije', 'sos', 'lov_odstrel'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists samo_odobreni on public.%I', t);
    execute format('create policy samo_odobreni on public.%I as restrictive for all to authenticated using (public.je_odobren()) with check (public.je_odobren())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Pozicije: samo vlastita, samo dok lov traje; vide ih učesnici/organizatori dok lov traje.
drop policy if exists citanje on public.lov_pozicije;
create policy citanje on public.lov_pozicije for select to authenticated
  using (public.vidi_lov(lov_id) and public.lov_u_toku(lov_id));
drop policy if exists svoja on public.lov_pozicije;
create policy svoja on public.lov_pozicije for insert to authenticated
  with check (korisnik_id = auth.uid() and public.je_ucesnik(lov_id) and public.lov_u_toku(lov_id));
drop policy if exists svoja_izmjena on public.lov_pozicije;
create policy svoja_izmjena on public.lov_pozicije for update to authenticated
  using (korisnik_id = auth.uid()) with check (korisnik_id = auth.uid() and public.je_ucesnik(lov_id) and public.lov_u_toku(lov_id));

-- SOS: šalje učesnik lova u toku; vide učesnici i organizatori.
drop policy if exists citanje on public.sos;
create policy citanje on public.sos for select to authenticated using (public.vidi_lov(lov_id));
drop policy if exists unos on public.sos;
create policy unos on public.sos for insert to authenticated
  with check (korisnik_id = auth.uid() and public.je_ucesnik(lov_id) and public.lov_u_toku(lov_id));

-- Odstrel u lovu: upisuje učesnik (i poslije kraja lova, za kasni upis), vide učesnici i organizatori.
drop policy if exists citanje on public.lov_odstrel;
create policy citanje on public.lov_odstrel for select to authenticated using (public.vidi_lov(lov_id));
drop policy if exists unos on public.lov_odstrel;
create policy unos on public.lov_odstrel for insert to authenticated
  with check (korisnik_id = auth.uid() and public.je_ucesnik(lov_id));
drop policy if exists svoj on public.lov_odstrel;
create policy svoj on public.lov_odstrel for delete to authenticated using (korisnik_id = auth.uid());

revoke execute on function public.lov_u_toku(uuid) from public, anon;
grant execute on function public.lov_u_toku(uuid) to authenticated;

-- Realtime (ako postoji publikacija na Supabase-u) za trenutni SOS i pozicije.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sos') then
      execute 'alter publication supabase_realtime add table public.sos';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'lov_pozicije') then
      execute 'alter publication supabase_realtime add table public.lov_pozicije';
    end if;
  end if;
end $$;
