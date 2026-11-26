-- 031: "Prijavi lovočuvaru" — dojava krivolova, ubijene ili ranjene divljači, zamke/otrova, psa lutalice i ostalog,
-- sa lokacijom, opisom i slikom. Ide lovočuvaru revira (admin kao rezerva); vidi je samo autor, lovočuvar tog revira
-- i admin. Lovočuvar mijenja status (nova → preuzeta → riješena) i upisuje odgovor; autor ništa ne mijenja poslije slanja.
-- `primljeno` postavlja server pri svakoj promjeni (inkrementalno čitanje: nova dojava i promjena statusa).
-- Idempotentno.

create table if not exists public.dojave (
  id uuid primary key,
  autor_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  revir_id uuid not null references public.reviri (id),
  vrsta text not null check (vrsta in ('krivolov', 'ubijena', 'ranjena', 'zamka', 'pas', 'ostalo')),
  opis text check (opis is null or char_length(opis) <= 1000),
  lat double precision check (lat is null or lat between -90 and 90),
  lon double precision check (lon is null or lon between -180 and 180),
  slika text check (slika is null or char_length(slika) <= 400000),
  created_at timestamptz not null default now(),
  primljeno timestamptz not null default now(),
  status text not null default 'nova' check (status in ('nova', 'preuzeta', 'rijesena')),
  odgovor text check (odgovor is null or char_length(odgovor) <= 1000),
  rijesio uuid references public.korisnici (id) on delete set null
);
-- Uklanjanje (mekano, da stigne i na tuđe telefone kroz `primljeno`): autor svoju dojavu, lovočuvar revira i admin bilo koju u reviru.
alter table public.dojave add column if not exists uklonjena boolean not null default false;
create index if not exists dojave_revir_primljeno on public.dojave (revir_id, primljeno);
create index if not exists dojave_autor_primljeno on public.dojave (autor_id, primljeno);

-- Autor šalje samo novu dojavu; lovočuvar mijenja samo status i odgovor; ko je riješio i kad upisuje server.
create or replace function public.zastiti_dojavu()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.autor_id := auth.uid();
    new.status := 'nova';
    new.odgovor := null;
    new.rijesio := null;
  else
    new.id := old.id;
    new.autor_id := old.autor_id;
    new.revir_id := old.revir_id;
    new.vrsta := old.vrsta;
    new.opis := old.opis;
    new.lat := old.lat;
    new.lon := old.lon;
    new.slika := old.slika;
    new.created_at := old.created_at;
    if public.je_lovocuvar_revira(old.revir_id) or public.je_admin() then
      if new.status is distinct from old.status or new.odgovor is distinct from old.odgovor then
        new.rijesio := auth.uid();
      else
        new.rijesio := old.rijesio;
      end if;
    else
      -- autor smije samo da ukloni svoju dojavu; status i odgovor su lovočuvarevi
      new.status := old.status;
      new.odgovor := old.odgovor;
      new.rijesio := old.rijesio;
    end if;
  end if;
  new.primljeno := now();
  return new;
end;
$$;

drop trigger if exists zastita on public.dojave;
create trigger zastita before insert or update on public.dojave
  for each row execute function public.zastiti_dojavu();

alter table public.dojave enable row level security;
drop policy if exists samo_odobreni on public.dojave;
create policy samo_odobreni on public.dojave as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.dojave from anon;
revoke all on public.dojave from authenticated;
grant select, insert, update on public.dojave to authenticated;

drop policy if exists citanje on public.dojave;
create policy citanje on public.dojave for select to authenticated
  using (autor_id = auth.uid() or public.je_lovocuvar_revira(revir_id) or public.je_admin());
drop policy if exists unos on public.dojave;
create policy unos on public.dojave for insert to authenticated with check (autor_id = auth.uid());
drop policy if exists obrada on public.dojave;
create policy obrada on public.dojave for update to authenticated
  using (public.je_lovocuvar_revira(revir_id) or public.je_admin())
  with check (public.je_lovocuvar_revira(revir_id) or public.je_admin());
drop policy if exists uklanjanje on public.dojave;
create policy uklanjanje on public.dojave for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());
