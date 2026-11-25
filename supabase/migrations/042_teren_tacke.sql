-- 042: imena mjesta na karti Teren (naselja, vrhovi, doline, vode…), radi lakšeg snalaženja.
-- Unosi ih SAMO administrator; čitaju svi koji imaju pristup aplikaciji (to je javan podatak, nije lična lokacija).
-- Tačka se skida (aktivno = false), ne briše. Idempotentno; zavisi samo od je_admin()/je_odobren() iz 001.

create table if not exists public.teren_tacke (
  id uuid primary key,
  naziv text not null check (char_length(trim(naziv)) between 1 and 60),
  vrsta text not null default 'ostalo' check (vrsta in ('naselje', 'vrh', 'dolina', 'voda', 'suma', 'ostalo')),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  aktivno boolean not null default true,
  autor_id uuid references public.korisnici (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists teren_tacke_updated on public.teren_tacke (updated_at);

-- Autora i vrijeme postavlja server; poslije unosa autor i datum nastanka se ne mijenjaju.
-- `updated_at` je kursor za inkrementalno preuzimanje (i skinute tačke stižu kao promjena); clock_timestamp jer now() stoji do kraja transakcije.
create or replace function public.zastiti_teren_tacku()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.autor_id := auth.uid(); end if;
    new.created_at := clock_timestamp();
  else
    -- brisanje naloga autora radi FK akcija (set null, dubina okidača > 1): nju ne vraćamo, inače brisanje korisnika pada
    if pg_trigger_depth() <= 1 then new.autor_id := old.autor_id; end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists zastita on public.teren_tacke;
create trigger zastita before insert or update on public.teren_tacke
  for each row execute function public.zastiti_teren_tacku();

alter table public.teren_tacke enable row level security;
drop policy if exists samo_odobreni on public.teren_tacke;
create policy samo_odobreni on public.teren_tacke as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.teren_tacke from anon;
revoke all on public.teren_tacke from authenticated;
grant select, insert, update on public.teren_tacke to authenticated;

drop policy if exists citanje on public.teren_tacke;
create policy citanje on public.teren_tacke for select to authenticated using (public.je_odobren());
drop policy if exists unos on public.teren_tacke;
create policy unos on public.teren_tacke for insert to authenticated with check (public.je_admin());
drop policy if exists izmjena on public.teren_tacke;
create policy izmjena on public.teren_tacke for update to authenticated
  using (public.je_admin()) with check (public.je_admin());

revoke execute on function public.zastiti_teren_tacku() from public, anon;
