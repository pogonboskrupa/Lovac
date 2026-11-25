-- Test 041: ponovno dijeljenje sa istim lovcem poslije isteklog (neobrisanog) reda radi kroz upsert (PostgREST
-- šalje INSERT … ON CONFLICT DO UPDATE); isteklo dijeljenje i dalje ne vidi primalac; granica od 30 broji samo aktivna.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000041c1', 'x41@t', '{"ime":"Xavi","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000041c2', 'y41@t', '{"ime":"Yan","prezime":"Dva"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000041%';
-- staro dijeljenje x → y koje je isteklo dok app nije bila otvorena (red nije obrisan)
insert into public.lokacije_izabranih (vlasnik_id, primalac_id, lat, lon, do_) values
  ('00000000-0000-0000-0000-0000000041c1', '00000000-0000-0000-0000-0000000041c2', 44.8, 16.1, now() - interval '2 hours');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000041c2', true); end $$;
do $$ begin assert (select count(*) from public.lokacije_izabranih) = 0, 'primalac ne vidi isteklo'; end $$;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000041c1', true); end $$;
insert into public.lokacije_izabranih (primalac_id, lat, lon, do_) values
  ('00000000-0000-0000-0000-0000000041c2', 44.9, 16.2, now() + interval '1 hour')
  on conflict (vlasnik_id, primalac_id) do update set lat = excluded.lat, lon = excluded.lon, do_ = excluded.do_;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000041c2', true); end $$;
do $$ begin
  assert (select count(*) from public.lokacije_izabranih) = 1, 'primalac vidi novo dijeljenje';
  assert (select lat from public.lokacije_izabranih) = 44.9, 'nova pozicija';
end $$;
reset role;
rollback;
