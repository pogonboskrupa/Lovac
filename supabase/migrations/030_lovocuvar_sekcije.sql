-- 030: lovočuvar revira uređuje sekcije SVOG revira: pravi nove, postavlja grupovođu sekcije i određuje
-- grupovođe revira (ko smije praviti sekcije). Admin i dalje sve; premještanje sekcije u drugi revir samo admin.
-- Uzrok: sekcije i grupovođe je postavljao samo administrator, a lovočuvar je onaj koji zna ko vodi koju sekciju
-- na terenu — sekcije su ostajale bez grupovođe ili u pogrešnom reviru.
-- Idempotentno.

drop policy if exists unos on public.sekcije;
create policy unos on public.sekcije for insert to authenticated with check (
  public.je_admin()
  or public.je_lovocuvar_revira(revir_id)
  or (public.je_grupovodja_revira(revir_id) and grupovodja_id = auth.uid()));

drop policy if exists izmjena on public.sekcije;
create policy izmjena on public.sekcije for update to authenticated
  using (public.moze_upravljati_sekcijom(id) or public.je_lovocuvar_revira(revir_id))
  with check (public.moze_upravljati_sekcijom(id) or public.je_lovocuvar_revira(revir_id));

-- Revir mijenja samo admin; grupovođu admin ili lovočuvar revira te sekcije; lovočuvara sekcije samo admin.
create or replace function public.zastiti_sekciju()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and not public.je_admin() then
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

-- Grupovođe revira: lovočuvar vidi i uređuje one u svom reviru.
drop policy if exists lovocuvar_revira on public.grupovodje;
create policy lovocuvar_revira on public.grupovodje for all to authenticated
  using (public.je_lovocuvar_revira(revir_id)) with check (public.je_lovocuvar_revira(revir_id));
