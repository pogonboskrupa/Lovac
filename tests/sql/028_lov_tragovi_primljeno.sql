-- Test 028: primljeno postavlja server (klijent ga ne može podmetnuti) i postoji indeks za inkrementalno čitanje.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000028a1', 'gv28@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000028b1', 'van28@t', '{"ime":"Vanja","prezime":"Van"}'),
  ('00000000-0000-0000-0000-0000000028c1', 'neodobren28@t', '{"ime":"Neo","prezime":"Neodobren"}');
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000028a1', '00000000-0000-0000-0000-0000000028b1');
insert into public.lovovi (id, revir_id, naziv, datum, status, organizator_id) values
  ('77777777-0000-4000-8000-000000000281', (select id from public.reviri where naziv = 'Krupa'), 'Lov 28', current_date, 'u_toku',
   '00000000-0000-0000-0000-0000000028a1');
insert into public.lov_ucesnici (lov_id, korisnik_id, uloga) values
  ('77777777-0000-4000-8000-000000000281', '00000000-0000-0000-0000-0000000028a1', 'vodja');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000028a1', true); end $$;
insert into public.lov_tragovi (lov_id, korisnik_id, t, lat, lon, primljeno) values
  ('77777777-0000-4000-8000-000000000281', '00000000-0000-0000-0000-0000000028a1', now() - interval '3 hours', 44.8, 16.1, '2000-01-01');
do $$ begin
  assert (select primljeno > now() - interval '1 minute' from public.lov_tragovi
          where lov_id = '77777777-0000-4000-8000-000000000281'), 'primljeno postavlja server, ne klijent';
  assert (select count(*) from public.lov_tragovi
          where lov_id = '77777777-0000-4000-8000-000000000281' and primljeno > now() - interval '1 minute') = 1,
         'stara tačka (t prije 3 h) je nova po primljeno';
end $$;
-- lov_trag: učesnik vidi trag (cijeli, po primljeno, po t)
do $$ begin
  assert (select count(*) from public.lov_trag('77777777-0000-4000-8000-000000000281')) = 1, 'učesnik vidi trag';
  assert (select count(*) from public.lov_trag('77777777-0000-4000-8000-000000000281', 'primljeno', now() - interval '1 minute')) = 1, 'novo po primljeno';
  assert (select count(*) from public.lov_trag('77777777-0000-4000-8000-000000000281', 't', now() - interval '1 hour')) = 0, 'po t: tačka je starija';
end $$;
-- ko nije u lovu ni u sekciji, i neodobren nalog: prazno
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000028b1', true); end $$;
do $$ begin
  assert (select count(*) from public.lov_trag('77777777-0000-4000-8000-000000000281')) = 0, 'tuđi lov je prazan';
end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000028c1', true); end $$;
do $$ begin
  assert (select count(*) from public.lov_trag('77777777-0000-4000-8000-000000000281')) = 0, 'neodobren ne vidi ništa';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from pg_indexes where indexname = 'lov_tragovi_lov_primljeno'), 'indeks za inkrementalno čitanje';
end $$;

rollback;
