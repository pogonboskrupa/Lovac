-- "Gdje si?": član/grupovođa/lovočuvar sekcije pita člana iste sekcije za lokaciju; primalac odgovara da ili ne.
-- Odgovor "da" aplikacija primaoca pretvara u dijeljenje lokacije sa sekcijom (tabela sekcija_lokacije, 1 h),
-- pa lokaciju vide samo oni koji je i inače smiju vidjeti. Zahtjev vide samo pošiljalac i primalac. Idempotentno.

create table if not exists public.lokacija_zahtjevi (
  id uuid primary key,
  sekcija_id uuid not null references public.sekcije (id) on delete cascade,
  od_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  za_id uuid not null references public.korisnici (id) on delete cascade,
  created_at timestamptz not null default now(),
  odgovor text check (odgovor in ('da', 'ne')),
  odgovoreno timestamptz,
  check (od_id <> za_id)
);
create index if not exists lokacija_zahtjevi_za_idx on public.lokacija_zahtjevi (za_id, created_at desc);
create index if not exists lokacija_zahtjevi_od_idx on public.lokacija_zahtjevi (od_id, created_at desc);

-- Primalac mora biti odobren član ili grupovođa sekcije (lovočuvar prati, ne dijeli).
create or replace function public.dijeli_u_sekciji(p_sek uuid, p_kor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    exists (select 1 from public.sekcije s where s.id = p_sek and s.aktivno and s.grupovodja_id = p_kor)
    or exists (select 1 from public.sekcija_clanovi c where c.sekcija_id = p_sek and c.korisnik_id = p_kor and c.status = 'odobren'));
$$;

alter table public.lokacija_zahtjevi enable row level security;
drop policy if exists samo_odobreni on public.lokacija_zahtjevi;
create policy samo_odobreni on public.lokacija_zahtjevi as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.lokacija_zahtjevi from anon;
revoke all on public.lokacija_zahtjevi from authenticated;
grant select, insert, update, delete on public.lokacija_zahtjevi to authenticated;

drop policy if exists citanje on public.lokacija_zahtjevi;
create policy citanje on public.lokacija_zahtjevi for select to authenticated
  using (od_id = auth.uid() or za_id = auth.uid());

drop policy if exists unos on public.lokacija_zahtjevi;
create policy unos on public.lokacija_zahtjevi for insert to authenticated
  with check (od_id = auth.uid() and public.vidi_lokacije_sekcije(lokacija_zahtjevi.sekcija_id)
    and public.dijeli_u_sekciji(lokacija_zahtjevi.sekcija_id, lokacija_zahtjevi.za_id));

-- Odgovara samo primalac (promjena samo polja odgovor, jednom, u roku od 15 minuta; čuva trigger).
drop policy if exists odgovor on public.lokacija_zahtjevi;
create policy odgovor on public.lokacija_zahtjevi for update to authenticated
  using (za_id = auth.uid()) with check (za_id = auth.uid());

drop policy if exists brisanje on public.lokacija_zahtjevi;
create policy brisanje on public.lokacija_zahtjevi for delete to authenticated
  using (od_id = auth.uid() or za_id = auth.uid());

create or replace function public.cuvaj_lokacija_zahtjev()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- Isti par ne smije zvati češće od jednom u 2 minute (da se primalac ne zatrpa).
    if exists (select 1 from public.lokacija_zahtjevi z
               where z.od_id = new.od_id and z.za_id = new.za_id and z.created_at > now() - interval '2 minutes') then
      raise exception 'previse_zahtjeva' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.odgovor := null;
    new.odgovoreno := null;
    return new;
  end if;
  if new.id <> old.id or new.sekcija_id <> old.sekcija_id or new.od_id <> old.od_id
     or new.za_id <> old.za_id or new.created_at <> old.created_at then
    raise exception 'zahtjev se ne mijenja' using errcode = '42501';
  end if;
  if old.odgovor is not null then
    raise exception 'zahtjev je vec odgovoren' using errcode = '42501';
  end if;
  if old.created_at < now() - interval '15 minutes' then
    raise exception 'zahtjev je istekao' using errcode = '42501';
  end if;
  new.odgovoreno := now();
  return new;
end $$;
drop trigger if exists cuvaj_lokacija_zahtjev on public.lokacija_zahtjevi;
create trigger cuvaj_lokacija_zahtjev before insert or update on public.lokacija_zahtjevi
  for each row execute function public.cuvaj_lokacija_zahtjev();

revoke execute on function public.dijeli_u_sekciji(uuid, uuid) from public, anon;
grant execute on function public.dijeli_u_sekciji(uuid, uuid) to authenticated;
