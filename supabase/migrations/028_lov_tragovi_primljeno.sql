-- 028: trag kretanja lovaca se preuzima inkrementalno.
-- Uzrok: prikaz je svakih 30 s preuzimao CIJELI trag lova, a server vraća najviše 1000 redova — kod 10 lovaca
-- i nekoliko sati lova vidio se samo početak (najstarije tačke), uz ~1 MB po minuti po telefonu.
-- Kolona `primljeno` = kad je tačka stigla na server (ne kad je snimljena): tačke iz offline bafera stižu kasnije
-- sa starim `t`, pa se "šta je novo" ne može pouzdano odrediti po `t`. Postavlja je uvijek server.
-- Idempotentno.

alter table public.lov_tragovi add column if not exists primljeno timestamptz not null default now();
create index if not exists lov_tragovi_lov_primljeno on public.lov_tragovi (lov_id, primljeno);

create or replace function public.lov_trag_primljeno()
returns trigger
language plpgsql
as $$
begin
  new.primljeno := now();
  return new;
end;
$$;

drop trigger if exists lov_trag_primljeno on public.lov_tragovi;
create trigger lov_trag_primljeno
  before insert or update on public.lov_tragovi
  for each row execute function public.lov_trag_primljeno();

-- Čitanje traga lova jednim pozivom: pravo se provjerava JEDNOM (je_odobren + vidi_lov), a ne za svaki red.
-- Uzrok: RLS politika `vidi_lov(lov_id)` se izvršavala za svaki red — 3600 tačaka jednog lova ≈ 0,7 s na serveru,
-- a to se ponavljalo svakih 30 s na svakom telefonu. Ista pravila kao politika `citanje` (vidi_lov).
-- p_kolona: 'primljeno' ili 't' (samo redovi poslije p_od), inače cijeli trag; redoslijed je stabilan za stranice.
create or replace function public.lov_trag(p_lov uuid, p_kolona text default null, p_od timestamptz default null)
returns setof public.lov_tragovi
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.je_odobren() or not public.vidi_lov(p_lov) then
    return;
  end if;
  if p_kolona = 'primljeno' and p_od is not null then
    return query select * from public.lov_tragovi where lov_id = p_lov and primljeno > p_od order by primljeno, korisnik_id, t;
  elsif p_kolona = 't' and p_od is not null then
    return query select * from public.lov_tragovi where lov_id = p_lov and t > p_od order by t, korisnik_id;
  else
    return query select * from public.lov_tragovi where lov_id = p_lov order by t, korisnik_id;
  end if;
end;
$$;

revoke execute on function public.lov_trag(uuid, text, timestamptz) from public, anon;
grant execute on function public.lov_trag(uuid, text, timestamptz) to authenticated;
