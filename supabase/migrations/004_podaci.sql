-- 004: podaci lovaca (objekti, opažanja, odstrel, tragovi) sa vidljivošću koju provodi SERVER.
-- Idempotentno.
--
-- Vidljivost: 'privatno' (samo vlasnik), 'drustvo' (svi odobreni lovci + admin),
-- 'izabrani' (vlasnik + korisnici u dijeli_sa). Admin NE vidi tuđe privatne zapise.
-- id = klijentski UUID (offline unos), pa je ponovno slanje istog zapisa idempotentno.
-- Stariji rev nikad ne prepisuje noviji (red slanja može poslati staru verziju poslije nove).

-- Server čuva: vlasnika (ne može se prebaciti), datum nastanka, i noviji rev.
create or replace function public.cuvaj_rev()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.rev < old.rev then
      return old; -- zakašnjela starija verzija iz reda slanja: ništa se ne mijenja
    end if;
    new.vlasnik_id := old.vlasnik_id;
    new.created_at := old.created_at;
  end if;
  new.server_at := now();
  return new;
end;
$$;

revoke execute on function public.cuvaj_rev() from public, anon;

do $$
declare t text;
begin
  foreach t in array array['objekti', 'opazanja', 'odstrel', 'tragovi'] loop
    execute format($f$
      create table if not exists public.%I (
        id uuid primary key,
        vlasnik_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
        vidljivost text not null default 'privatno' check (vidljivost in ('privatno', 'drustvo', 'izabrani')),
        dijeli_sa uuid[] not null default '{}',
        lat double precision,
        lon double precision,
        podaci jsonb not null default '{}'::jsonb,
        rev int not null default 1,
        obrisan boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        server_at timestamptz not null default now()
      )$f$, t);
    execute format('create index if not exists %I on public.%I (server_at)', t || '_server_at', t);
    execute format('create index if not exists %I on public.%I (vlasnik_id)', t || '_vlasnik', t);
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists samo_odobreni on public.%I', t);
    execute format('create policy samo_odobreni on public.%I as restrictive for all to authenticated using (public.je_odobren()) with check (public.je_odobren())', t);
    execute format('drop policy if exists citanje on public.%I', t);
    execute format($p$create policy citanje on public.%I for select to authenticated using (
      vlasnik_id = auth.uid()
      or vidljivost = 'drustvo'
      or (vidljivost = 'izabrani' and auth.uid() = any (dijeli_sa))
    )$p$, t);
    execute format('drop policy if exists unos on public.%I', t);
    execute format('create policy unos on public.%I for insert to authenticated with check (vlasnik_id = auth.uid())', t);
    execute format('drop policy if exists izmjena on public.%I', t);
    execute format('create policy izmjena on public.%I for update to authenticated using (vlasnik_id = auth.uid()) with check (vlasnik_id = auth.uid())', t);
    execute format('drop policy if exists brisanje on public.%I', t);
    execute format('create policy brisanje on public.%I for delete to authenticated using (vlasnik_id = auth.uid())', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop trigger if exists cuvaj_rev on public.%I', t);
    execute format('create trigger cuvaj_rev before insert or update on public.%I for each row execute function public.cuvaj_rev()', t);
  end loop;
end $$;
