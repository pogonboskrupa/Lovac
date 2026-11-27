-- 050: vodstvo (predsjednik, lovočuvari i lovovođa udruženja, lovovođa i lovočuvar revira) vidi lovove u toku u svom opsegu:
-- raspored, pozicije lovaca dok lov traje i trag kretanja. Do sada su to vidjeli samo učesnici, organizatori, članovi sekcije
-- i administrator. Opseg: udruženje = svi lovovi; revir = lovovi tog revira. Ne mijenja ko smije pisati (pozicije, trag, odstrel).
-- Zavisi od 045 (drustvo_uloge, je_vodja_revira, je_lovocuvar_revira). Idempotentno.

create or replace function public.moze_nadzirati_lov(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and exists (
    select 1 from public.lovovi l
     where l.id = p_lov
       and (public.je_admin()
            or exists (select 1 from public.drustvo_uloge d where d.korisnik_id = auth.uid())
            or (l.revir_id is not null and (public.je_vodja_revira(l.revir_id) or public.je_lovocuvar_revira(l.revir_id)))));
$$;
revoke execute on function public.moze_nadzirati_lov(uuid) from public, anon;
grant execute on function public.moze_nadzirati_lov(uuid) to authenticated;

-- vidi_lov je osnova politika čitanja lova (raspored, pozicije dok traje, trag, tok, slike, odstrel): vodstvo se dodaje ovdje.
create or replace function public.vidi_lov(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_ucesnik(p_lov) or public.moze_organizovati(p_lov) or exists (
    select 1 from public.lovovi l
     where l.id = p_lov and l.sekcija_id is not null and public.je_clan_sekcije(l.sekcija_id))
    or public.moze_nadzirati_lov(p_lov);
$$;
