-- Prijavljeni ulov nosi grupu lovca (hijerarhija: grupa je glavna jedinica lova), pa lovovođa sekcije i viši vide ulov
-- po grupama. Odstrel u lovu (`lov_odstrel`) grupu ne dobija kolonu: ona se izvodi iz lova (`lovovi.grupa_id`).
-- Kolona je neobavezna i prijava se i dalje ne mijenja poslije slanja. Zavisi od 022 (ulov_prijave) i 045 (grupe). Idempotentno.

alter table public.ulov_prijave add column if not exists grupa_id uuid references public.grupe (id) on delete set null;
create index if not exists ulov_prijave_grupa_idx on public.ulov_prijave (grupa_id);

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
     or new.grupa_id is distinct from old.grupa_id
     or new.vrsta <> old.vrsta or new.kategorija is distinct from old.kategorija
     or new.tezina is distinct from old.tezina or new.vrijeme <> old.vrijeme or new.prijavljeno <> old.prijavljeno then
    raise exception 'prijava se ne mijenja' using errcode = '42501';
  end if;
  if old.povucena and not new.povucena then
    raise exception 'povucena prijava se ne vraca' using errcode = '42501';
  end if;
  return new;
end $$;
