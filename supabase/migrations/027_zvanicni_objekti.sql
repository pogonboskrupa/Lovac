-- 027: zvanični lovački objekti društva (čeke, hranilišta…) koje postavlja rukovodstvo — administrator, lovočuvar ili
-- grupovođa. Oznaka je u podaci.zvanicni (zapis se šalje kao i svaki objekat), a server je provodi:
--   * rukovodstvo: objekat je uvijek vidljiv društvu (vidljivost = 'drustvo'), pa ga vide svi odobreni članovi;
--   * svi ostali: oznaka se tiho skida (lovac ne može svoj objekat proglasiti zvaničnim).
-- Idempotentno.

create or replace function public.zvanicni_objekat()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce((new.podaci ->> 'zvanicni')::boolean, false) then
    if public.je_rukovodstvo() then
      new.vidljivost := 'drustvo';
    else
      new.podaci := new.podaci - 'zvanicni';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.zvanicni_objekat() from public, anon, authenticated;

drop trigger if exists zvanicni_objekat on public.objekti;
create trigger zvanicni_objekat
  before insert or update on public.objekti
  for each row execute function public.zvanicni_objekat();
