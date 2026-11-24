-- 035: lokaciju sa sekcijom smiju dijeliti SVI koji sa sekcijom imaju veze: član, grupovođa, lovočuvar revira sekcije
-- i administrator (prije samo član i grupovođa). Ko GLEDA se ne mijenja: članovi, grupovođa i lovočuvar sekcije —
-- administrator i dalje NE vidi tuđe lokacije (nije dio sekcije), ali ga sekcija vidi kad on dijeli. Idempotentno.

create or replace function public.moze_dijeliti_sekciji(p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_admin()
    or public.je_lovocuvar_sekcije(p_sek)
    or exists (select 1 from public.sekcije s where s.id = p_sek and s.aktivno and s.grupovodja_id = auth.uid())
    or exists (select 1 from public.sekcija_clanovi c where c.sekcija_id = p_sek and c.korisnik_id = auth.uid() and c.status = 'odobren'));
$$;

-- Gledanje: isto kao prije (član, grupovođa, lovočuvar), bez administratora.
create or replace function public.vidi_lokacije_sekcije(p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_lovocuvar_sekcije(p_sek)
    or exists (select 1 from public.sekcije s where s.id = p_sek and s.aktivno and s.grupovodja_id = auth.uid())
    or exists (select 1 from public.sekcija_clanovi c where c.sekcija_id = p_sek and c.korisnik_id = auth.uid() and c.status = 'odobren'));
$$;

revoke execute on function public.moze_dijeliti_sekciji(uuid), public.vidi_lokacije_sekcije(uuid) from public, anon;
grant execute on function public.moze_dijeliti_sekciji(uuid), public.vidi_lokacije_sekcije(uuid) to authenticated;
