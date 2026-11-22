-- Test 023: statistika i rejting — opseg: admin sve, lovočuvar revir, grupovođa/član svoju sekciju; izvan opsega prazno.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000023a1', 'admin23@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000023b1', 'gv23@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000023b2', 'gv23b@t', '{"ime":"Goran","prezime":"Drugi"}'),
  ('00000000-0000-0000-0000-0000000023c1', 'clan23@t', '{"ime":"Clan","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000023c2', 'clan23b@t', '{"ime":"Clan","prezime":"Dva"}'),
  ('00000000-0000-0000-0000-0000000023c3', 'clan23c@t', '{"ime":"Clan","prezime":"Tri"}'),
  ('00000000-0000-0000-0000-0000000023d1', 'lcK23@t', '{"ime":"Lovocuvar","prezime":"Krupe"}'),
  ('00000000-0000-0000-0000-0000000023d2', 'lcO23@t', '{"ime":"Lovocuvar","prezime":"Otoke"}'),
  ('00000000-0000-0000-0000-0000000023e1', 'van23@t', '{"ime":"Van","prezime":"Sekcije"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000023a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000023b1', '00000000-0000-0000-0000-0000000023b2', '00000000-0000-0000-0000-0000000023c1',
  '00000000-0000-0000-0000-0000000023c2', '00000000-0000-0000-0000-0000000023c3', '00000000-0000-0000-0000-0000000023d1',
  '00000000-0000-0000-0000-0000000023d2', '00000000-0000-0000-0000-0000000023e1');

-- Postavka (kao superuser): Krupa ima sekcije A i B, Otoka sekciju C; lovovi, učešća i prijave.
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        otoka uuid := (select id from public.reviri where naziv = 'Otoka');
begin
  insert into public.revir_lovocuvari values (krupa, '00000000-0000-0000-0000-0000000023d1'), (otoka, '00000000-0000-0000-0000-0000000023d2');
  insert into public.grupovodje values ('00000000-0000-0000-0000-0000000023b1', krupa), ('00000000-0000-0000-0000-0000000023b2', krupa);
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
    ('55555555-0000-4000-8000-000000000231', krupa, 'Sekcija A', '00000000-0000-0000-0000-0000000023b1'),
    ('55555555-0000-4000-8000-000000000232', krupa, 'Sekcija B', '00000000-0000-0000-0000-0000000023b2'),
    ('55555555-0000-4000-8000-000000000233', otoka, 'Sekcija C', null);
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000231', '00000000-0000-0000-0000-0000000023c1', 'odobren'),
    ('55555555-0000-4000-8000-000000000231', '00000000-0000-0000-0000-0000000023c2', 'odobren'),
    ('55555555-0000-4000-8000-000000000232', '00000000-0000-0000-0000-0000000023c3', 'odobren'),
    ('55555555-0000-4000-8000-000000000233', '00000000-0000-0000-0000-0000000023e1', 'odobren');
  -- A: 2 održana lova (jan, mar) + 1 planiran; c1 bio na oba, c2 samo na jednom
  insert into public.lovovi (id, revir_id, sekcija_id, naziv, datum, status, organizator_id) values
    ('99999999-0000-4000-8000-000000000231', krupa, '55555555-0000-4000-8000-000000000231', 'A1', '2026-01-10', 'zavrsen', '00000000-0000-0000-0000-0000000023b1'),
    ('99999999-0000-4000-8000-000000000232', krupa, '55555555-0000-4000-8000-000000000231', 'A2', '2026-03-10', 'zavrsen', '00000000-0000-0000-0000-0000000023b1'),
    ('99999999-0000-4000-8000-000000000233', krupa, '55555555-0000-4000-8000-000000000231', 'A3', '2026-04-10', 'planiran', '00000000-0000-0000-0000-0000000023b1'),
    ('99999999-0000-4000-8000-000000000234', krupa, '55555555-0000-4000-8000-000000000232', 'B1', '2026-02-10', 'zavrsen', '00000000-0000-0000-0000-0000000023b2');
  insert into public.lov_ucesnici (lov_id, korisnik_id) values
    ('99999999-0000-4000-8000-000000000231', '00000000-0000-0000-0000-0000000023c1'),
    ('99999999-0000-4000-8000-000000000232', '00000000-0000-0000-0000-0000000023c1'),
    ('99999999-0000-4000-8000-000000000231', '00000000-0000-0000-0000-0000000023c2'),
    ('99999999-0000-4000-8000-000000000233', '00000000-0000-0000-0000-0000000023c2'),
    ('99999999-0000-4000-8000-000000000234', '00000000-0000-0000-0000-0000000023c3');
  alter table public.ulov_prijave disable trigger cuvaj_ulov_prijavu; -- test postavlja vrijeme prijave unaprijed
  insert into public.ulov_prijave (id, lovac_id, revir_id, sekcija_id, vrsta, tezina, vrijeme) values
    ('88888888-0000-4000-8000-000000000231', '00000000-0000-0000-0000-0000000023c1', krupa, '55555555-0000-4000-8000-000000000231', 'zec', 3, '2026-01-10 10:00+00'),
    ('88888888-0000-4000-8000-000000000232', '00000000-0000-0000-0000-0000000023c1', krupa, '55555555-0000-4000-8000-000000000231', 'srna', 20, '2026-03-10 10:00+00'),
    ('88888888-0000-4000-8000-000000000233', '00000000-0000-0000-0000-0000000023c3', krupa, '55555555-0000-4000-8000-000000000232', 'zec', 4, '2026-02-10 10:00+00'),
    ('88888888-0000-4000-8000-000000000234', '00000000-0000-0000-0000-0000000023e1', otoka, '55555555-0000-4000-8000-000000000233', 'srna', 25, '2026-03-12 10:00+00'),
    ('88888888-0000-4000-8000-000000000235', '00000000-0000-0000-0000-0000000023c1', krupa, '55555555-0000-4000-8000-000000000231', 'zec', 99, '2026-03-11 10:00+00');
  update public.ulov_prijave set povucena = true where id = '88888888-0000-4000-8000-000000000235';
  -- c1: prva prijava u roku (odmah), druga zakašnjela (3 dana poslije)
  update public.ulov_prijave set prijavljeno = vrijeme + interval '1 hour' where id = '88888888-0000-4000-8000-000000000231';
  update public.ulov_prijave set prijavljeno = vrijeme + interval '3 days' where id = '88888888-0000-4000-8000-000000000232';
  update public.ulov_prijave set prijavljeno = vrijeme + interval '1 hour' where id not in ('88888888-0000-4000-8000-000000000231', '88888888-0000-4000-8000-000000000232');
  alter table public.ulov_prijave enable trigger cuvaj_ulov_prijavu;
end $$;

-- Opseg: ko šta vidi. Sekcija A (statistika_lovovi): admin, gv A, član A, lovočuvar Krupe vide red; gv B, član B, lovočuvar Otoke, vanjski ne.
do $$
declare uid text; n int; ocekivano int;
begin
  for uid, ocekivano in values
    ('00000000-0000-0000-0000-0000000023a1', 1), ('00000000-0000-0000-0000-0000000023b1', 1), ('00000000-0000-0000-0000-0000000023c1', 1),
    ('00000000-0000-0000-0000-0000000023d1', 1), ('00000000-0000-0000-0000-0000000023b2', 0), ('00000000-0000-0000-0000-0000000023c3', 0),
    ('00000000-0000-0000-0000-0000000023d2', 0)
  loop
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', uid, true);
    select count(*) into n from public.statistika_lovovi('55555555-0000-4000-8000-000000000231', null, null, null);
    execute 'reset role';
    if n <> ocekivano then raise exception 'FAIL sekcija A: % vidi % redova, očekivano %', uid, n, ocekivano; end if;
  end loop;
end $$;

-- Revir Krupa: admin 2 sekcije, lovočuvar Krupe 2, lovočuvar Otoke 0, grupovođa 0 (nije lovočuvar revira), član 0.
do $$
declare uid text; n int; ocekivano int;
begin
  for uid, ocekivano in values
    ('00000000-0000-0000-0000-0000000023a1', 2), ('00000000-0000-0000-0000-0000000023d1', 2), ('00000000-0000-0000-0000-0000000023d2', 0),
    ('00000000-0000-0000-0000-0000000023b1', 0), ('00000000-0000-0000-0000-0000000023c1', 0)
  loop
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', uid, true);
    select count(*) into n from public.statistika_lovovi(null, (select id from public.reviri where naziv = 'Krupa'), null, null);
    execute 'reset role';
    if n <> ocekivano then raise exception 'FAIL revir Krupa: % vidi % redova, očekivano %', uid, n, ocekivano; end if;
  end loop;
end $$;

-- Društvo (bez opsega): samo admin (3 sekcije).
do $$
declare uid text; n int; ocekivano int;
begin
  for uid, ocekivano in values
    ('00000000-0000-0000-0000-0000000023a1', 3), ('00000000-0000-0000-0000-0000000023d1', 0), ('00000000-0000-0000-0000-0000000023b1', 0),
    ('00000000-0000-0000-0000-0000000023c1', 0)
  loop
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', uid, true);
    select count(*) into n from public.statistika_lovovi(null, null, null, null);
    execute 'reset role';
    if n <> ocekivano then raise exception 'FAIL društvo: % vidi % redova, očekivano %', uid, n, ocekivano; end if;
  end loop;
end $$;

-- Brojke sekcije A: 2 održana lova, 3 učešća (c1: 2, c2: 1; planirani se ne računa), 2 člana.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000023c1', true); end $$;
do $$ declare l int; u int; c int; k int; kg numeric; begin
  select lovova, ucesca, clanova into l, u, c from public.statistika_lovovi('55555555-0000-4000-8000-000000000231', null, null, null);
  if (l, u, c) <> (2, 3, 2) then raise exception 'FAIL lovovi A: % % %', l, u, c; end if;
  -- ulov A: zec 3 kg (jan), srna 20 kg (mar); povučena prijava se ne računa
  select count(*)::int, sum(x.kg) into k, kg from public.statistika_ulov('55555555-0000-4000-8000-000000000231', null, null, null) x;
  if k <> 2 or kg <> 23 then raise exception 'FAIL ulov A: % redova, % kg', k, kg; end if;
  -- ulov B član A ne vidi
  select count(*) into k from public.statistika_ulov('55555555-0000-4000-8000-000000000232', null, null, null);
  if k <> 0 then raise exception 'FAIL: član A vidi ulov sekcije B'; end if;
  -- i dalje NE vidi tuđe pojedinačne prijave direktno
  select count(*) into k from public.ulov_prijave where lovac_id <> '00000000-0000-0000-0000-0000000023c1';
  if k <> 0 then raise exception 'FAIL: član vidi % tuđih pojedinačnih prijava', k; end if;
end $$;
reset role;

-- Period: samo februar-mart → A ima 1 održan lov (mart), ulov samo srna.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000023b1', true); end $$;
do $$ declare l int; k int; begin
  select lovova into l from public.statistika_lovovi('55555555-0000-4000-8000-000000000231', null, '2026-02-01', '2026-03-31');
  if l <> 1 then raise exception 'FAIL period lovovi: %', l; end if;
  select count(*) into k from public.statistika_ulov('55555555-0000-4000-8000-000000000231', null, '2026-02-01', '2026-03-31') where vrsta = 'srna';
  if k <> 1 then raise exception 'FAIL period ulov'; end if;
end $$;
reset role;

-- Rejting sekcije A (kao član c2): c1 i c2 + grupovođa; c1: odaziv 2/2, 2 prijave, 1 u roku, 2 mjeseca, 2 vrste, 23 kg.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000023c2', true); end $$;
do $$ declare r record; n int; begin
  select count(*) into n from public.rejting_podaci('55555555-0000-4000-8000-000000000231', null, null, null);
  if n <> 3 then raise exception 'FAIL rejting A: % redova (c1, c2, grupovođa)', n; end if;
  select * into r from public.rejting_podaci('55555555-0000-4000-8000-000000000231', null, null, null) where korisnik_id = '00000000-0000-0000-0000-0000000023c1';
  if (r.lovova_odrzano, r.lovova_ucesce, r.mjeseci_lovova, r.mjeseci_ucesce, r.komada, r.vrsta, r.prijava_ukupno, r.prijava_u_roku)
     <> (2, 2, 2, 2, 2, 2, 2, 1) or r.kg <> 23 then raise exception 'FAIL rejting c1: %', r; end if;
  select * into r from public.rejting_podaci('55555555-0000-4000-8000-000000000231', null, null, null) where korisnik_id = '00000000-0000-0000-0000-0000000023c2';
  if (r.lovova_ucesce, r.mjeseci_ucesce, r.komada) <> (1, 1, 0) then raise exception 'FAIL rejting c2: %', r; end if;
  -- tuđa sekcija: prazno
  select count(*) into n from public.rejting_podaci('55555555-0000-4000-8000-000000000233', null, null, null);
  if n <> 0 then raise exception 'FAIL: član vidi rejting tuđe sekcije'; end if;
end $$;
reset role;

-- Kriteriji: svi odobreni čitaju, piše samo admin; trigger bilježi ko je mijenjao.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000023c1', true); end $$;
do $$ declare n int; t int; begin
  select count(*) into n from public.rejting_kriteriji;
  if n <> 5 then raise exception 'FAIL: kriteriji vidljivi % od 5', n; end if;
  update public.rejting_kriteriji set tezina = 99 where kod = 'odaziv';
  select tezina into t from public.rejting_kriteriji where kod = 'odaziv';
  if t <> 40 then raise exception 'FAIL: član mijenja težinu'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000023a1', true); end $$;
do $$ declare t int; who uuid; begin
  update public.rejting_kriteriji set tezina = 50 where kod = 'odaziv';
  select tezina, izmijenio into t, who from public.rejting_kriteriji where kod = 'odaziv';
  if t <> 50 or who <> '00000000-0000-0000-0000-0000000023a1' then raise exception 'FAIL: admin težina/izmijenio'; end if;
end $$;
reset role;

rollback;
