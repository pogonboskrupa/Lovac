-- Prisustvo u lovu sekcije: odobreni član sekcije se sam prijavi kao prisutan (samoprijava),
-- a grupovođa/organizator dodaje i uklanja učesnike. Uklonjeni lovac se ne može ponovo sam prijaviti
-- dok ga organizator ponovo ne doda. Idempotentno.

alter table public.lov_ucesnici add column if not exists samoprijava boolean not null default false;

create table if not exists public.lov_uklonjeni (
  lov_id uuid not null references public.lovovi (id) on delete cascade,
  korisnik_id uuid not null references public.korisnici (id) on delete cascade,
  uklonio uuid,
  created_at timestamptz not null default now(),
  primary key (lov_id, korisnik_id)
);

alter table public.lov_uklonjeni enable row level security;
drop policy if exists samo_odobreni on public.lov_uklonjeni;
create policy samo_odobreni on public.lov_uklonjeni as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.lov_uklonjeni from anon;
revoke all on public.lov_uklonjeni from authenticated;
grant select on public.lov_uklonjeni to authenticated;
drop policy if exists citanje on public.lov_uklonjeni;
create policy citanje on public.lov_uklonjeni for select to authenticated using (public.moze_organizovati(lov_id));

create or replace function public.moze_prijaviti_prisustvo(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and exists (
    select 1 from public.lovovi l
     where l.id = p_lov and l.status in ('planiran', 'u_toku') and l.sekcija_id is not null
       and exists (select 1 from public.sekcija_clanovi c
                    where c.sekcija_id = l.sekcija_id and c.korisnik_id = auth.uid() and c.status = 'odobren'))
   and not exists (select 1 from public.lov_uklonjeni u where u.lov_id = p_lov and u.korisnik_id = auth.uid());
$$;

drop policy if exists samoprijava_unos on public.lov_ucesnici;
create policy samoprijava_unos on public.lov_ucesnici for insert to authenticated
  with check (korisnik_id = auth.uid() and samoprijava and uloga = 'strijelac' and public.moze_prijaviti_prisustvo(lov_id));

drop policy if exists samoprijava_odjava on public.lov_ucesnici;
create policy samoprijava_odjava on public.lov_ucesnici for delete to authenticated
  using (korisnik_id = auth.uid() and samoprijava);

create or replace function public.pamti_uklanjanje()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> old.korisnik_id then
    insert into public.lov_uklonjeni (lov_id, korisnik_id, uklonio) values (old.lov_id, old.korisnik_id, auth.uid())
    on conflict (lov_id, korisnik_id) do nothing;
  end if;
  return old;
end;
$$;

create or replace function public.brisi_uklonjenog()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.samoprijava then
    delete from public.lov_uklonjeni where lov_id = new.lov_id and korisnik_id = new.korisnik_id;
  end if;
  return new;
end;
$$;

drop trigger if exists pamti_uklanjanje on public.lov_ucesnici;
create trigger pamti_uklanjanje before delete on public.lov_ucesnici
  for each row execute function public.pamti_uklanjanje();
drop trigger if exists brisi_uklonjenog on public.lov_ucesnici;
create trigger brisi_uklonjenog after insert on public.lov_ucesnici
  for each row execute function public.brisi_uklonjenog();

revoke execute on function public.moze_prijaviti_prisustvo(uuid), public.pamti_uklanjanje(), public.brisi_uklonjenog() from public, anon;
grant execute on function public.moze_prijaviti_prisustvo(uuid) to authenticated;
