-- 005: slojevi koje objavljuje admin (granice lovišta, revira, lovnih površina) kao GeoJSON.
-- Idempotentno. Čita odobren lovac, objavljuje/mijenja samo admin, brisanja nema (sklanjanje).

create table if not exists public.slojevi (
  id uuid primary key default gen_random_uuid(),
  naziv text not null,
  opis text,
  geojson jsonb not null,
  stil jsonb not null default '{}'::jsonb,
  verzija int not null default 1,
  aktivno boolean not null default true,
  promijenio uuid,
  promijenjeno timestamptz not null default now()
);

alter table public.slojevi enable row level security;

drop trigger if exists izmjena on public.slojevi;
create trigger izmjena before insert or update on public.slojevi
  for each row execute function public.zapisi_izmjenu();

drop policy if exists samo_odobreni on public.slojevi;
create policy samo_odobreni on public.slojevi as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
drop policy if exists citanje on public.slojevi;
create policy citanje on public.slojevi for select to authenticated using (true);
drop policy if exists admin_unos on public.slojevi;
create policy admin_unos on public.slojevi for insert to authenticated with check (public.je_admin());
drop policy if exists admin_izmjena on public.slojevi;
create policy admin_izmjena on public.slojevi for update to authenticated
  using (public.je_admin()) with check (public.je_admin());

revoke all on public.slojevi from anon;
revoke delete, truncate on public.slojevi from authenticated;
grant select, insert, update on public.slojevi to authenticated;
