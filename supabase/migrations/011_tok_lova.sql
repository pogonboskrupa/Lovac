-- Tok lova: događaji u lovu koji je u toku (početak/kraj pogona, okupljanje, prekid, status na stanu).
-- Vođa/organizator šalje komande; svaki učesnik javlja svoj status. Samo čitanje i dodavanje (bez izmjene).
create table if not exists public.lov_dogadjaji (
  id uuid primary key,
  lov_id uuid not null references public.lovovi (id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  vrsta text not null check (vrsta in ('pocetak_pogona', 'kraj_pogona', 'okupljanje', 'prekid', 'na_stanu', 'napustio_stan', 'pauza')),
  tekst text check (tekst is null or char_length(tekst) <= 200),
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now()
);
create index if not exists lov_dogadjaji_lov_vrijeme on public.lov_dogadjaji (lov_id, created_at);

create or replace function public.je_vodja_lova(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.moze_organizovati(p_lov)
    or exists (select 1 from public.lov_ucesnici u where u.lov_id = p_lov and u.korisnik_id = auth.uid() and u.uloga = 'vodja')
  );
$$;

alter table public.lov_dogadjaji enable row level security;
drop policy if exists samo_odobreni on public.lov_dogadjaji;
create policy samo_odobreni on public.lov_dogadjaji as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.lov_dogadjaji from anon;
revoke all on public.lov_dogadjaji from authenticated;
grant select, insert on public.lov_dogadjaji to authenticated;

drop policy if exists citanje on public.lov_dogadjaji;
create policy citanje on public.lov_dogadjaji for select to authenticated using (public.vidi_lov(lov_id));

drop policy if exists unos on public.lov_dogadjaji;
create policy unos on public.lov_dogadjaji for insert to authenticated
  with check (
    autor_id = auth.uid() and public.lov_u_toku(lov_id) and (
      (vrsta in ('na_stanu', 'napustio_stan', 'pauza') and public.je_ucesnik(lov_id))
      or (vrsta in ('pocetak_pogona', 'kraj_pogona', 'okupljanje', 'prekid') and public.je_vodja_lova(lov_id))
    )
  );

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'lov_dogadjaji') then
    execute 'alter publication supabase_realtime add table public.lov_dogadjaji';
  end if;
end $$;
