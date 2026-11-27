-- 052: sekcije osim administratora mogu praviti i vodstvo: predsjednik, lovovođa udruženja (svaki revir) te lovovođa i
-- lovočuvar revira (svoj revir; lovočuvari udruženja važe za svaki revir kroz je_lovocuvar_revira). Do sada je to smio samo
-- administrator, lovočuvar revira i ovlašteni (grupovodje) za svoj revir. Zavisi od 045 (drustvo_uloge, je_lovovodja_drustva).
-- Mijenjanje sekcije (revir, lovovođa) i dalje provodi okidač zastiti_sekciju; ovdje se mijenja samo pravo UNOSA.

create or replace function public.moze_praviti_sekciju(p_revir uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_admin()
    or public.je_lovovodja_drustva()
    or public.je_lovocuvar_revira(p_revir)
    or public.je_vodja_revira(p_revir)
    or exists (select 1 from public.drustvo_uloge d where d.korisnik_id = auth.uid() and d.uloga = 'predsjednik'));
$$;
revoke execute on function public.moze_praviti_sekciju(uuid) from public, anon;
grant execute on function public.moze_praviti_sekciju(uuid) to authenticated;

drop policy if exists unos on public.sekcije;
create policy unos on public.sekcije for insert to authenticated with check (
  public.moze_praviti_sekciju(revir_id)
  or (public.je_grupovodja_revira(revir_id) and grupovodja_id = auth.uid()));
