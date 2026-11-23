-- 029: poruke i tok lova se preuzimaju inkrementalno (štedi besplatni server: promet i broj redova).
-- Uzrok: poruke su se svakih 20–60 s preuzimale cijele (300 NAJSTARIJIH — poslije 300 poruka nove se nisu ni vidjele),
-- a tok lova svakih 15 s cijeli. created_at postavlja telefon (poruka napisana bez signala stiže kasnije sa starim
-- vremenom), pa "šta je novo" određuje kolona `primljeno` koju postavlja server, kao kod traga lova (028).
-- Idempotentno.

create or replace function public.postavi_primljeno()
returns trigger
language plpgsql
as $$
begin
  new.primljeno := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['poruke', 'lov_dogadjaji'] loop
    execute format('alter table public.%I add column if not exists primljeno timestamptz not null default now()', t);
    execute format('drop trigger if exists postavi_primljeno on public.%I', t);
    execute format('create trigger postavi_primljeno before insert or update on public.%I for each row execute function public.postavi_primljeno()', t);
  end loop;
end $$;

create index if not exists poruke_sekcija_primljeno on public.poruke (sekcija_id, primljeno);
create index if not exists poruke_kanal_primljeno on public.poruke (kanal, primljeno);
create index if not exists lov_dogadjaji_lov_primljeno on public.lov_dogadjaji (lov_id, primljeno);
