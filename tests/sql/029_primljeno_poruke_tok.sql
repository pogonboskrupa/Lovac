-- Test 029: primljeno na porukama i toku lova postavlja server (klijent ga ne podmeće), postoje indeksi.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000029a1', 'gv29@t', '{"ime":"Goran","prezime":"Grupovođa"}');
update public.korisnici set odobren = true where id = '00000000-0000-0000-0000-0000000029a1';
insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
  ('55555555-0000-4000-8000-000000000291', (select id from public.reviri where naziv = 'Krupa'), 'Sekcija 29', '00000000-0000-0000-0000-0000000029a1');
insert into public.lovovi (id, revir_id, sekcija_id, naziv, datum, status, organizator_id) values
  ('77777777-0000-4000-8000-000000000291', (select id from public.reviri where naziv = 'Krupa'), '55555555-0000-4000-8000-000000000291',
   'Lov 29', current_date, 'planiran', '00000000-0000-0000-0000-0000000029a1');
insert into public.lov_ucesnici (lov_id, korisnik_id, uloga) values
  ('77777777-0000-4000-8000-000000000291', '00000000-0000-0000-0000-0000000029a1', 'vodja');
update public.lovovi set status = 'u_toku' where id = '77777777-0000-4000-8000-000000000291';

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000029a1', true); end $$;
-- poruka napisana bez signala prije 2 h stiže sada: created_at ostaje, primljeno je sada
insert into public.poruke (id, sekcija_id, autor_id, tekst, created_at, primljeno) values
  ('99999999-0000-4000-8000-000000000291', '55555555-0000-4000-8000-000000000291', '00000000-0000-0000-0000-0000000029a1',
   'Bez signala', now() - interval '2 hours', '2000-01-01');
insert into public.lov_dogadjaji (id, lov_id, autor_id, vrsta, created_at, primljeno) values
  ('99999999-0000-4000-8000-000000000292', '77777777-0000-4000-8000-000000000291', '00000000-0000-0000-0000-0000000029a1',
   'na_stanu', now() - interval '1 hour', '2000-01-01');
do $$ begin
  assert (select primljeno > now() - interval '1 minute' and created_at < now() - interval '1 hour'
          from public.poruke where id = '99999999-0000-4000-8000-000000000291'), 'poruka: primljeno postavlja server, created_at ostaje';
  assert (select primljeno > now() - interval '1 minute'
          from public.lov_dogadjaji where id = '99999999-0000-4000-8000-000000000292'), 'događaj: primljeno postavlja server';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from pg_indexes where indexname = 'poruke_sekcija_primljeno'), 'indeks poruka';
  assert exists (select 1 from pg_indexes where indexname = 'lov_dogadjaji_lov_primljeno'), 'indeks toka';
end $$;

rollback;
