-- Pregled svih članova (Meni → Članovi i grupe) za vodstvo društva. Ko smije vidjeti članove SEKCIJE (`sekcija_clanovi`):
-- administrator, predsjednik, oba lovočuvara udruženja, lovovođa udruženja (cijelo društvo), lovovođa revira i lovočuvar
-- revira (samo sekcije svog revira). Do sada su predsjednik i lovočuvari udruženja vidjeli samo vlastiti red, pa je
-- njihov pregled bio prazan. Zavisi od 045 (drustvo_uloge, je_vodja_revira). Idempotentno.

create or replace function public.moze_vidjeti_clanove(p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_admin()
    or public.je_lovovodja_drustva()
    or public.je_lovocuvar_drustva()
    or exists (select 1 from public.drustvo_uloge d where d.korisnik_id = auth.uid() and d.uloga = 'predsjednik')
    or exists (select 1 from public.sekcije s
                where s.id = p_sek
                  and (public.je_vodja_revira(s.revir_id) or public.je_lovocuvar_revira(s.revir_id))));
$$;
revoke execute on function public.moze_vidjeti_clanove(uuid) from public, anon;
grant execute on function public.moze_vidjeti_clanove(uuid) to authenticated;

drop policy if exists citanje on public.sekcija_clanovi;
create policy citanje on public.sekcija_clanovi for select to authenticated using (
  korisnik_id = auth.uid()
  or public.moze_primati_clanove(sekcija_id)
  or public.je_lovocuvar_sekcije(sekcija_id)
  or public.moze_vidjeti_clanove(sekcija_id)
  or (status = 'odobren' and public.je_clan_sekcije(sekcija_id)));
