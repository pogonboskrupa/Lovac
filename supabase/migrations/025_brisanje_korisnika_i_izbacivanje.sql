-- 025: brisanje naloga i izbacivanje iz sekcije.
-- 1) Admin nije mogao obrisati korisnika koji je organizovao lov, dodao kameru ili mijenjao težine rejtinga: strani ključ
--    bez ON DELETE pravila je odbijao brisanje ("violates foreign key constraint"). Zapisi ostaju, autor postaje prazan.
-- 2) Član izbačen iz sekcije je ostajao učesnik lovova te sekcije (planiranih i u toku) i dalje dijelio lokaciju sa
--    sekcijom, pa je i dalje vidio raspored i pozicije. Sada se to čisti pri svakom izlasku iz sekcije.

alter table public.lovovi alter column organizator_id drop not null;
alter table public.lovovi drop constraint if exists lovovi_organizator_id_fkey;
alter table public.lovovi add constraint lovovi_organizator_id_fkey
  foreign key (organizator_id) references public.korisnici (id) on delete set null;

alter table public.kamere alter column autor_id drop not null;
alter table public.kamere drop constraint if exists kamere_autor_id_fkey;
alter table public.kamere add constraint kamere_autor_id_fkey
  foreign key (autor_id) references public.korisnici (id) on delete set null;

alter table public.rejting_kriteriji drop constraint if exists rejting_kriteriji_izmijenio_fkey;
alter table public.rejting_kriteriji add constraint rejting_kriteriji_izmijenio_fkey
  foreign key (izmijenio) references public.korisnici (id) on delete set null;

-- Autor kamere se ne mijenja ručno, ali ga smije isprazniti brisanje naloga (FK akcija radi UPDATE unutar triggera).
create or replace function public.zastiti_kameru()
returns trigger language plpgsql as $$
begin
  new.revir_id := old.revir_id;
  if pg_trigger_depth() <= 1 then new.autor_id := old.autor_id; end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.ocisti_izbacenog_clana()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.lov_ucesnici u using public.lovovi l
   where u.lov_id = l.id and l.sekcija_id = old.sekcija_id and u.korisnik_id = old.korisnik_id
     and l.status in ('planiran', 'u_toku');
  delete from public.sekcija_lokacije where sekcija_id = old.sekcija_id and korisnik_id = old.korisnik_id;
  return old;
end;
$$;
revoke execute on function public.ocisti_izbacenog_clana() from public, anon, authenticated;
drop trigger if exists ocisti_izbacenog on public.sekcija_clanovi;
create trigger ocisti_izbacenog after delete on public.sekcija_clanovi
  for each row execute function public.ocisti_izbacenog_clana();
