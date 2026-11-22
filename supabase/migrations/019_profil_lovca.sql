-- Profil lovca: avatar, pas (ime i slika) vide svi odobreni članovi; PRATEĆA OPREMA (puška i ostalo) vidi samo vlasnik.
-- Slike su male (avatar ~96 px, pas ~192 px) i čuvaju se kao dataURL. Idempotentno.

create table if not exists public.profili (
  korisnik_id uuid primary key references public.korisnici (id) on delete cascade,
  avatar text check (avatar is null or char_length(avatar) <= 40000),
  pas_ime text check (pas_ime is null or char_length(pas_ime) <= 40),
  pas_slika text check (pas_slika is null or char_length(pas_slika) <= 80000),
  updated_at timestamptz not null default now()
);

create table if not exists public.profili_oprema (
  korisnik_id uuid primary key references public.korisnici (id) on delete cascade,
  oprema jsonb not null default '[]'::jsonb check (jsonb_typeof(oprema) = 'array' and jsonb_array_length(oprema) <= 30),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['profili', 'profili_oprema'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists samo_odobreni on public.%I', t);
    execute format('create policy samo_odobreni on public.%I as restrictive for all to authenticated using (public.je_odobren()) with check (public.je_odobren())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- profili: svi odobreni vide; piše samo vlasnik
drop policy if exists citanje on public.profili;
create policy citanje on public.profili for select to authenticated using (true);
drop policy if exists vlasnik on public.profili;
create policy vlasnik on public.profili for all to authenticated
  using (korisnik_id = auth.uid()) with check (korisnik_id = auth.uid());

-- oprema: samo vlasnik (ni admin)
drop policy if exists vlasnik on public.profili_oprema;
create policy vlasnik on public.profili_oprema for all to authenticated
  using (korisnik_id = auth.uid()) with check (korisnik_id = auth.uid());

create or replace function public.azuriraj_profil()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists vrijeme on public.profili;
create trigger vrijeme before insert or update on public.profili for each row execute function public.azuriraj_profil();
drop trigger if exists vrijeme on public.profili_oprema;
create trigger vrijeme before insert or update on public.profili_oprema for each row execute function public.azuriraj_profil();
revoke execute on function public.azuriraj_profil() from public, anon;
