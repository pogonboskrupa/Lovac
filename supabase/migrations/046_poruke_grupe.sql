-- Poruke GRUPE (hijerarhija: grupa je glavna jedinica lova). Isti sto `poruke`, kanal = 'grupa', bez sekcije, sa `grupa_id`.
-- Čitaju i pišu: odobreni članovi te grupe (uključujući grupovođu), lovovođa sekcije i viši u lancu (lovovođa revira,
-- lovovođa društva, admin — `moze_upravljati_grupama`) i lovočuvar revira. Kanal sekcije se NE mijenja: poruke grupe nikad
-- ne ulaze u razgovor cijele sekcije. Zavisi od 045 (tabela `grupe`). Idempotentno.

alter table public.poruke add column if not exists grupa_id uuid references public.grupe (id) on delete cascade;

alter table public.poruke drop constraint if exists poruke_kanal_provjera;
alter table public.poruke add constraint poruke_kanal_provjera check (
  (kanal = 'sekcija' and sekcija_id is not null and grupa_id is null)
  or (kanal = 'rukovodstvo' and sekcija_id is null and grupa_id is null)
  or (kanal = 'grupa' and sekcija_id is null and grupa_id is not null));
create index if not exists poruke_grupa_vrijeme on public.poruke (grupa_id, created_at);

create or replace function public.je_uz_grupu(p_grupa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and exists (
    select 1 from public.grupe g
     where g.id = p_grupa
       and (
         exists (select 1 from public.sekcija_clanovi c
                  where c.grupa_id = g.id and c.korisnik_id = auth.uid() and c.status = 'odobren')
         or g.grupovodja_id = auth.uid()
         or public.moze_upravljati_grupama(g.sekcija_id)
         or public.je_lovocuvar_sekcije(g.sekcija_id)));
$$;
revoke execute on function public.je_uz_grupu(uuid) from public, anon;
grant execute on function public.je_uz_grupu(uuid) to authenticated;

drop policy if exists citanje_grupe on public.poruke;
create policy citanje_grupe on public.poruke for select to authenticated
  using (kanal = 'grupa' and public.je_uz_grupu(grupa_id));
drop policy if exists unos_grupe on public.poruke;
create policy unos_grupe on public.poruke for insert to authenticated
  with check (kanal = 'grupa' and sekcija_id is null and autor_id = auth.uid() and public.je_uz_grupu(grupa_id));
