-- Prijava ulova društvu: lovac ZVANIČNO prijavi odstrel (osnovni podaci, bez tačne lokacije i bez privatnih napomena).
-- Odstrel je i dalje privatan; administrator, lovočuvar revira i grupovođa sekcije vide samo ono što je lovac prijavio.
-- Admin vidi sve revire, lovočuvar svoj revir, grupovođa svoju sekciju, lovac svoje prijave. Prijava se ne mijenja
-- (osim povlačenja kod vlasnika). Idempotentno.

create table if not exists public.ulov_prijave (
  id uuid primary key, -- isti id kao lokalni zapis odstrela (idempotentno slanje)
  lovac_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  revir_id uuid not null references public.reviri (id),
  sekcija_id uuid references public.sekcije (id) on delete set null,
  lov_id uuid references public.lovovi (id) on delete set null,
  vrsta text not null check (length(vrsta) between 1 and 60),
  kategorija text,
  tezina numeric check (tezina is null or tezina between 0 and 1000),
  vrijeme timestamptz not null,
  prijavljeno timestamptz not null default now(),
  povucena boolean not null default false
);
create index if not exists ulov_prijave_revir_idx on public.ulov_prijave (revir_id, vrijeme desc);
create index if not exists ulov_prijave_sekcija_idx on public.ulov_prijave (sekcija_id);
create index if not exists ulov_prijave_lovac_idx on public.ulov_prijave (lovac_id);

-- Lovac prijavljuje samo u revir u kojem je član/grupovođa neke sekcije (admin u bilo koji).
create or replace function public.moze_prijaviti_ulov(p_revir uuid, p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_admin()
    or exists (
      select 1 from public.sekcije s
      where s.revir_id = p_revir and s.aktivno and (p_sek is null or s.id = p_sek)
        and (s.grupovodja_id = auth.uid()
          or exists (select 1 from public.sekcija_clanovi c where c.sekcija_id = s.id and c.korisnik_id = auth.uid() and c.status = 'odobren'))));
$$;

-- Ko smije čitati prijavu: admin (sve), lovočuvar revira, grupovođa sekcije.
create or replace function public.vidi_prijavu(p_revir uuid, p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_admin()
    or public.je_lovocuvar_revira(p_revir)
    or exists (select 1 from public.sekcije s where s.id = p_sek and s.grupovodja_id = auth.uid()));
$$;

alter table public.ulov_prijave enable row level security;
drop policy if exists samo_odobreni on public.ulov_prijave;
create policy samo_odobreni on public.ulov_prijave as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.ulov_prijave from anon;
revoke all on public.ulov_prijave from authenticated;
grant select, insert, update on public.ulov_prijave to authenticated;

drop policy if exists citanje on public.ulov_prijave;
create policy citanje on public.ulov_prijave for select to authenticated
  using (lovac_id = auth.uid() or public.vidi_prijavu(ulov_prijave.revir_id, ulov_prijave.sekcija_id));

drop policy if exists unos on public.ulov_prijave;
create policy unos on public.ulov_prijave for insert to authenticated
  with check (lovac_id = auth.uid() and public.moze_prijaviti_ulov(ulov_prijave.revir_id, ulov_prijave.sekcija_id));

drop policy if exists povlacenje on public.ulov_prijave;
create policy povlacenje on public.ulov_prijave for update to authenticated
  using (lovac_id = auth.uid()) with check (lovac_id = auth.uid());

-- Prijava se ne mijenja: vlasnik smije samo povući (povucena = true) i ne vratiti nazad.
create or replace function public.cuvaj_ulov_prijavu()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.prijavljeno := now();
    new.povucena := false;
    return new;
  end if;
  if new.id <> old.id or new.lovac_id <> old.lovac_id or new.revir_id <> old.revir_id
     or new.sekcija_id is distinct from old.sekcija_id or new.lov_id is distinct from old.lov_id
     or new.vrsta <> old.vrsta or new.kategorija is distinct from old.kategorija
     or new.tezina is distinct from old.tezina or new.vrijeme <> old.vrijeme or new.prijavljeno <> old.prijavljeno then
    raise exception 'prijava se ne mijenja' using errcode = '42501';
  end if;
  if old.povucena and not new.povucena then
    raise exception 'povucena prijava se ne vraca' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists cuvaj_ulov_prijavu on public.ulov_prijave;
create trigger cuvaj_ulov_prijavu before insert or update on public.ulov_prijave
  for each row execute function public.cuvaj_ulov_prijavu();

revoke execute on function public.moze_prijaviti_ulov(uuid, uuid), public.vidi_prijavu(uuid, uuid) from public, anon;
grant execute on function public.moze_prijaviti_ulov(uuid, uuid), public.vidi_prijavu(uuid, uuid) to authenticated;
