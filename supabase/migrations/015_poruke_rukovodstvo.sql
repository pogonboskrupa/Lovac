-- Kanal "Rukovodstvo": grupovođe, lovočuvari i administrator razgovaraju međusobno (izvan sekcija).
-- Isti sto kao poruke sekcija (kanal = 'rukovodstvo', bez sekcije). Lovočuvar sa članovima sekcije i grupovođom
-- sekcije već razgovara kroz kanal sekcije (je_clan_sekcije uključuje lovočuvara revira). Idempotentno.

alter table public.poruke add column if not exists kanal text not null default 'sekcija';
alter table public.poruke alter column sekcija_id drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'poruke_kanal_provjera') then
    alter table public.poruke add constraint poruke_kanal_provjera check (
      (kanal = 'sekcija' and sekcija_id is not null) or (kanal = 'rukovodstvo' and sekcija_id is null));
  end if;
end $$;
create index if not exists poruke_kanal_vrijeme on public.poruke (kanal, created_at);

create or replace function public.je_rukovodstvo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_admin()
    or exists (select 1 from public.grupovodje g where g.korisnik_id = auth.uid())
    or exists (select 1 from public.sekcije s where s.aktivno and (s.grupovodja_id = auth.uid() or s.lovocuvar_id = auth.uid()))
    or exists (select 1 from public.revir_lovocuvari r where r.korisnik_id = auth.uid()));
$$;

drop policy if exists citanje_rukovodstvo on public.poruke;
create policy citanje_rukovodstvo on public.poruke for select to authenticated
  using (kanal = 'rukovodstvo' and public.je_rukovodstvo());
drop policy if exists unos_rukovodstvo on public.poruke;
create policy unos_rukovodstvo on public.poruke for insert to authenticated
  with check (kanal = 'rukovodstvo' and sekcija_id is null and autor_id = auth.uid() and public.je_rukovodstvo());

revoke execute on function public.je_rukovodstvo() from public, anon;
grant execute on function public.je_rukovodstvo() to authenticated;
