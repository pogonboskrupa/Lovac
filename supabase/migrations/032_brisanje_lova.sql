-- 032: brisanje lova iz arhive (admin i grupovođa sekcije tog lova) + ponovljena ispravka stranih ključeva iz 025.
-- 1) Lov se brisao samo dok je "planiran" i samo od organizatora; pogrešno napravljen ili probni lov ostajao je zauvijek
--    u arhivi. Sada ga briše admin ili grupovođa sekcije lova, u bilo kojem stanju. Brisanje povlači raspored,
--    učesnike, pozicije, trag, tok i slike lova (ON DELETE CASCADE); poruke i prijave ulova ostaju bez veze na lov.
-- 2) "update or delete on table korisnici violates foreign key constraint lovovi_organizator_id_fkey": brisanje naloga
--    koji je organizovao lov je pucalo jer 025 nije pokrenuta na serveru. Isti popravak je ovdje (idempotentno).
-- Idempotentno.

alter table public.lovovi alter column organizator_id drop not null;
alter table public.lovovi drop constraint if exists lovovi_organizator_id_fkey;
alter table public.lovovi add constraint lovovi_organizator_id_fkey
  foreign key (organizator_id) references public.korisnici (id) on delete set null;
alter table public.kamere alter column autor_id drop not null;
alter table public.kamere drop constraint if exists kamere_autor_id_fkey;
alter table public.kamere add constraint kamere_autor_id_fkey
  foreign key (autor_id) references public.korisnici (id) on delete set null;
alter table public.rejting_kriteriji drop constraint if exists rejting_kriteriji_izmijenio_fkey;
alter table public.rejting_kriteriji add constraint rejting_kriteriji_izmijenio_fkey
  foreign key (izmijenio) references public.korisnici (id) on delete set null;

-- Brisanje lova briše i učesnike (CASCADE); tada se NE pamti "uklonjen iz lova" (lov više ne postoji, a upis bi
-- pao na stranom ključu i oborio cijelo brisanje). Ostalo kao u 013.
create or replace function public.pamti_uklanjanje()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> old.korisnik_id
     and exists (select 1 from public.lovovi where id = old.lov_id) then
    insert into public.lov_uklonjeni (lov_id, korisnik_id, uklonio) values (old.lov_id, old.korisnik_id, auth.uid())
    on conflict (lov_id, korisnik_id) do nothing;
  end if;
  return old;
end;
$$;

-- Brisanje naloga grupovođe/lovočuvara prazni sekcije.grupovodja_id / lovocuvar_id (ON DELETE SET NULL); to je UPDATE
-- iz FK akcije (pg_trigger_depth() > 1) i mora proći — inače okidač vrati stari id i brisanje naloga pukne. Ostalo kao 030.
create or replace function public.zastiti_sekciju()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and not public.je_admin() and pg_trigger_depth() <= 1 then
    new.revir_id := old.revir_id;
    if not public.je_lovocuvar_revira(old.revir_id) then
      new.grupovodja_id := old.grupovodja_id;
    end if;
    new.lovocuvar_id := old.lovocuvar_id;
    new.created_by := old.created_by;
  end if;
  new.promijenio := auth.uid();
  new.promijenjeno := now();
  return new;
end;
$$;

create or replace function public.moze_brisati_lov(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_admin()
    or exists (select 1 from public.lovovi l join public.sekcije s on s.id = l.sekcija_id
                where l.id = p_lov and s.grupovodja_id = auth.uid()));
$$;

create or replace function public.obrisi_lov(p_lov uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.moze_brisati_lov(p_lov) then
    raise exception 'Lov briše administrator ili grupovođa sekcije tog lova' using errcode = '42501';
  end if;
  delete from public.lovovi where id = p_lov;
  return found;
end;
$$;

revoke execute on function public.moze_brisati_lov(uuid), public.obrisi_lov(uuid) from public, anon;
grant execute on function public.moze_brisati_lov(uuid), public.obrisi_lov(uuid) to authenticated;
