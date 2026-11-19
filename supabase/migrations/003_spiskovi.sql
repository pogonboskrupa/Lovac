-- 003: admin spiskovi — vrste lovačkih objekata, vrste divljači, lovostaj, lovno vrijeme.
-- Idempotentno. Ništa od propisa (datumi lovostaja, pravila lovnog vremena) se NE upisuje ovdje:
-- unosi ih admin u aplikaciji, a uz svaki red stoji ko ga je i kad promijenio.
-- Sklanjanje umjesto brisanja (aktivno = false), da stari zapisi ne izgube naziv.

create table if not exists public.objekat_vrste (
  kod text primary key,
  naziv text not null,
  ikona text,
  redoslijed int not null default 0,
  aktivno boolean not null default true,
  promijenio uuid,
  promijenjeno timestamptz not null default now()
);

create table if not exists public.vrste (
  kod text primary key,
  naziv text not null,
  velicina text not null default 'krupna' check (velicina in ('krupna', 'sitna')),
  tip text not null default 'dlakava' check (tip in ('dlakava', 'pernata')),
  kategorije jsonb not null default '[]'::jsonb,
  redoslijed int not null default 0,
  aktivno boolean not null default true,
  promijenio uuid,
  promijenjeno timestamptz not null default now()
);

create table if not exists public.lovostaj (
  id uuid primary key default gen_random_uuid(),
  vrsta_kod text not null references public.vrste (kod),
  kategorija_kod text,
  -- Period kad je lov OTVOREN, ponavlja se svake godine; 'MM-DD'. Može preći Novu godinu (10-01 .. 01-31).
  otvoreno_od text not null check (otvoreno_od ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  otvoreno_do text not null check (otvoreno_do ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  napomena text,
  izvor text,
  redoslijed int not null default 0,
  aktivno boolean not null default true,
  promijenio uuid,
  promijenjeno timestamptz not null default now()
);

create table if not exists public.lovno_vrijeme (
  id uuid primary key default gen_random_uuid(),
  vrsta_kod text references public.vrste (kod), -- null = opšte pravilo
  prije_izlaska_min int not null check (prije_izlaska_min between 0 and 240),
  poslije_zalaska_min int not null check (poslije_zalaska_min between 0 and 240),
  napomena text,
  izvor text,
  redoslijed int not null default 0,
  aktivno boolean not null default true,
  promijenio uuid,
  promijenjeno timestamptz not null default now()
);

-- Ko je i kad promijenio: upisuje server, klijent to ne može lažirati.
create or replace function public.zapisi_izmjenu()
returns trigger
language plpgsql
as $$
begin
  new.promijenio := auth.uid();
  new.promijenjeno := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['objekat_vrste', 'vrste', 'lovostaj', 'lovno_vrijeme'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists izmjena on public.%I', t);
    execute format('create trigger izmjena before insert or update on public.%I for each row execute function public.zapisi_izmjenu()', t);

    execute format('drop policy if exists samo_odobreni on public.%I', t);
    execute format('create policy samo_odobreni on public.%I as restrictive for all to authenticated using (public.je_odobren()) with check (public.je_odobren())', t);
    execute format('drop policy if exists citanje on public.%I', t);
    execute format('create policy citanje on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists admin_unos on public.%I', t);
    execute format('create policy admin_unos on public.%I for insert to authenticated with check (public.je_admin())', t);
    execute format('drop policy if exists admin_izmjena on public.%I', t);
    execute format('create policy admin_izmjena on public.%I for update to authenticated using (public.je_admin()) with check (public.je_admin())', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- Početni spiskovi (nazivi, ne propisi). Admin ih može mijenjati i sklanjati.
insert into public.objekat_vrste (kod, naziv, ikona, redoslijed) values
  ('ceka_visoka', 'Čeka visoka', 'ceka-visoka', 10),
  ('ceka_niska', 'Čeka niska', 'ceka-niska', 20),
  ('zaklon', 'Zaklon', 'zaklon', 30),
  ('hraniliste', 'Hranilište', 'hraniliste', 40),
  ('soliste', 'Solište', 'soliste', 50),
  ('kaljuziste', 'Kaljužište', 'kaljuziste', 60),
  ('pojiliste', 'Pojilište', 'pojiliste', 70),
  ('lovacka_kuca', 'Lovačka kuća', 'kuca', 80),
  ('foto_zamka', 'Foto-zamka', 'kamera', 90),
  ('parking', 'Parkiralište / vozilo', 'auto', 100)
on conflict (kod) do nothing;

insert into public.vrste (kod, naziv, velicina, tip, kategorije, redoslijed) values
  ('srna', 'Srna obična', 'krupna', 'dlakava', '[{"kod":"srndac","naziv":"Srndać"},{"kod":"srna","naziv":"Srna"},{"kod":"lane","naziv":"Lane"}]', 10),
  ('divlja_svinja', 'Divlja svinja', 'krupna', 'dlakava', '[{"kod":"vepar","naziv":"Vepar"},{"kod":"krmaca","naziv":"Krmača"},{"kod":"nazime","naziv":"Nazime"},{"kod":"prase","naziv":"Prase"}]', 20),
  ('medvjed', 'Mrki medvjed', 'krupna', 'dlakava', '[]', 30),
  ('vuk', 'Vuk', 'krupna', 'dlakava', '[]', 40),
  ('zec', 'Zec obični', 'sitna', 'dlakava', '[]', 50),
  ('lisica', 'Lisica', 'sitna', 'dlakava', '[]', 60),
  ('jazavac', 'Jazavac', 'sitna', 'dlakava', '[]', 70),
  ('kuna', 'Kuna', 'sitna', 'dlakava', '[]', 80),
  ('fazan', 'Fazan', 'sitna', 'pernata', '[{"kod":"pijetao","naziv":"Pijetao"},{"kod":"koka","naziv":"Koka"}]', 90),
  ('jarebica', 'Jarebica kamenjarka', 'sitna', 'pernata', '[]', 100),
  ('sljuka', 'Šljuka bena', 'sitna', 'pernata', '[]', 110),
  ('patka', 'Divlja patka', 'sitna', 'pernata', '[]', 120)
on conflict (kod) do nothing;

revoke execute on function public.zapisi_izmjenu() from public, anon;
