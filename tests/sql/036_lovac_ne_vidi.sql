-- Test 036: OBIČAN LOVAC (odobren član jedne sekcije) ne vidi i ne radi ono što je rezervisano za admina, lovočuvara i
-- grupovođu: tuđe sekcije i lovove, dojave, kamere, prijave ulova, kanal Rukovodstvo, tuđe privatne zapise, tuđe
-- kontakte/opremu/slike/zahtjeve, admin funkcije i upis u administrativne tabele. Podaci se pišu kao superuser (bez RLS),
-- a provjera ide kao lovac `x`.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000036a1', 'admin36@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000036b1', 'gv36@t',    '{"ime":"Goran","prezime":"Grupovodja"}'),
  ('00000000-0000-0000-0000-0000000036c1', 'lc36@t',    '{"ime":"Luka","prezime":"Lovocuvar"}'),
  ('00000000-0000-0000-0000-0000000036d1', 'x36@t',     '{"ime":"Xavi","prezime":"Lovac"}'),
  ('00000000-0000-0000-0000-0000000036d2', 'y36@t',     '{"ime":"Yan","prezime":"Drugi"}'),
  ('00000000-0000-0000-0000-0000000036d3', 'z36@t',     '{"ime":"Zlatan","prezime":"Treci"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000036%';
update public.korisnici set is_admin = true where id = '00000000-0000-0000-0000-0000000036a1';

do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.revir_lovocuvari values (krupa, '00000000-0000-0000-0000-0000000036c1');
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
    ('55555555-0000-4000-8000-000000000361', krupa, 'A36', null),
    ('55555555-0000-4000-8000-000000000362', krupa, 'B36', '00000000-0000-0000-0000-0000000036b1');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000361', '00000000-0000-0000-0000-0000000036d1', 'odobren'),
    ('55555555-0000-4000-8000-000000000362', '00000000-0000-0000-0000-0000000036d2', 'odobren');
  insert into public.lovovi (id, revir_id, sekcija_id, naziv, datum, status, organizator_id) values
    ('77777777-0000-4000-8000-000000000362', krupa, '55555555-0000-4000-8000-000000000362', 'Lov B', current_date, 'u_toku', '00000000-0000-0000-0000-0000000036b1');
  insert into public.lov_ucesnici (lov_id, korisnik_id, uloga) values
    ('77777777-0000-4000-8000-000000000362', '00000000-0000-0000-0000-0000000036d2', 'strijelac');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036d2', true);
  insert into public.dojave (id, autor_id, revir_id, vrsta) values ('d0000000-0000-4000-8000-000000000361', '00000000-0000-0000-0000-0000000036d2', krupa, 'krivolov');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036c1', true);
  insert into public.kamere (id, revir_id, naziv, lat, lon, autor_id) values ('c0000000-0000-4000-8000-000000000361', krupa, 'Kamera 1', 44.9, 16.1, '00000000-0000-0000-0000-0000000036c1');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036d2', true);
  insert into public.ulov_prijave (id, lovac_id, revir_id, sekcija_id, vrsta, vrijeme) values
    ('e0000000-0000-4000-8000-000000000361', '00000000-0000-0000-0000-0000000036d2', krupa, '55555555-0000-4000-8000-000000000362', 'srna', now());
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036b1', true);
  insert into public.poruke (kanal, autor_id, tekst) values ('rukovodstvo', '00000000-0000-0000-0000-0000000036b1', 'tajna rukovodstva');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036d2', true);
  insert into public.poruke (kanal, sekcija_id, autor_id, tekst) values ('sekcija', '55555555-0000-4000-8000-000000000362', '00000000-0000-0000-0000-0000000036d2', 'poruka sekcije B');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036d2', true);
  insert into public.sekcija_lokacije (sekcija_id, korisnik_id, lat, lon, do_) values ('55555555-0000-4000-8000-000000000362', '00000000-0000-0000-0000-0000000036d2', 44.9, 16.1, now() + interval '1 hour');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036d2', true);
  insert into public.lov_pozicije (lov_id, korisnik_id, lat, lon) values ('77777777-0000-4000-8000-000000000362', '00000000-0000-0000-0000-0000000036d2', 44.9, 16.1);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036d2', true);
  insert into public.lov_tragovi (lov_id, korisnik_id, t, lat, lon) values ('77777777-0000-4000-8000-000000000362', '00000000-0000-0000-0000-0000000036d2', now(), 44.9, 16.1);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036d2', true);
  insert into public.sos (id, lov_id, korisnik_id, lat, lon) values ('f0000000-0000-4000-8000-000000000361', '77777777-0000-4000-8000-000000000362', '00000000-0000-0000-0000-0000000036d2', 44.9, 16.1);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036b1', true);
  insert into public.lov_dogadjaji (id, lov_id, autor_id, vrsta) values ('a0000000-0000-4000-8000-000000000361', '77777777-0000-4000-8000-000000000362', '00000000-0000-0000-0000-0000000036b1', 'prekid');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036d2', true);
  insert into public.kontakti (korisnik_id, telefon) values ('00000000-0000-0000-0000-0000000036d2', '061 000 000');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036d2', true);
  insert into public.profili_oprema (korisnik_id, oprema) values ('00000000-0000-0000-0000-0000000036d2', '[{"naziv":"puška"}]');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036d2', true);
  insert into public.slike_lovcima (id, posiljalac_id, primalac_id, slika) values ('b0000000-0000-4000-8000-000000000361', '00000000-0000-0000-0000-0000000036d2', '00000000-0000-0000-0000-0000000036d3', 'data:image/png;base64,AA==');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036b1', true);
  insert into public.lokacija_zahtjevi (id, sekcija_id, od_id, za_id) values ('a1000000-0000-4000-8000-000000000361', '55555555-0000-4000-8000-000000000362', '00000000-0000-0000-0000-0000000036b1', '00000000-0000-0000-0000-0000000036d2');
  -- privatni zapisi drugih (administrator i lovac y) — x ih ne smije vidjeti
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036a1', true);
  insert into public.objekti (id, vlasnik_id, vidljivost, lat, lon) values
    ('11111111-0000-4000-8000-000000000361', '00000000-0000-0000-0000-0000000036a1', 'privatno', 1, 1),
    ('11111111-0000-4000-8000-000000000362', '00000000-0000-0000-0000-0000000036d2', 'privatno', 1, 1),
    ('11111111-0000-4000-8000-000000000363', '00000000-0000-0000-0000-0000000036d2', 'izabrani', 1, 1);
  insert into public.opazanja (id, vlasnik_id, vidljivost, lat, lon) values ('22222222-0000-4000-8000-000000000361', '00000000-0000-0000-0000-0000000036d2', 'privatno', 1, 1);
  insert into public.odstrel (id, vlasnik_id, vidljivost, lat, lon) values ('33333333-0000-4000-8000-000000000361', '00000000-0000-0000-0000-0000000036d2', 'privatno', 1, 1);
  insert into public.tragovi (id, vlasnik_id, vidljivost, lat, lon) values ('44444444-0000-4000-8000-000000000361', '00000000-0000-0000-0000-0000000036d2', 'privatno', 1, 1);
end $$;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000036d1', true); end $$;

-- 1) ČITANJE: sve što pripada drugima ili rukovodstvu je prazno
do $$
declare t text; n int;
begin
  foreach t in array array[
    'dojave', 'kamere', 'ulov_prijave', 'sekcija_lokacije', 'lov_pozicije', 'lov_tragovi', 'sos', 'lov_dogadjaji', 'lov_ucesnici',
    'lovovi', 'stanovi', 'lov_slike', 'kontakti', 'profili_oprema', 'slike_lovcima', 'lokacija_zahtjevi', 'objekti', 'opazanja',
    'odstrel', 'tragovi', 'lov_uklonjeni', 'lov_odazivi'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'FAIL: lovac x vidi % red(ova) u tabeli %', n, t; end if;
  end loop;
  select count(*) into n from public.poruke;
  if n <> 0 then raise exception 'FAIL: lovac x vidi % poruka (rukovodstvo ili tuđa sekcija)', n; end if;
  -- spisak članova: samo svoje i odobrene članove SVOJE sekcije; ne i člana sekcije B
  select count(*) into n from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000036d2';
  if n <> 0 then raise exception 'FAIL: lovac x vidi člana tuđe sekcije'; end if;
end $$;

-- 2) FUNKCIJE: zbirke i rejting izvan opsega su prazni, telefoni tuđeg lova prazni, admin funkcije odbijene
do $$
declare n int;
begin
  select count(*) into n from public.statistika_ulov(null, null, null, null);
  if n <> 0 then raise exception 'FAIL: statistika_ulov (cijelo društvo) vraća % redova lovcu', n; end if;
  select count(*) into n from public.statistika_ulov('55555555-0000-4000-8000-000000000362', null, null, null);
  if n <> 0 then raise exception 'FAIL: statistika_ulov tuđe sekcije vraća % redova', n; end if;
  select count(*) into n from public.rejting_podaci(null, null, null, null);
  if n <> 0 then raise exception 'FAIL: rejting_podaci (cijelo društvo) vraća % redova', n; end if;
  select count(*) into n from public.lov_telefoni('77777777-0000-4000-8000-000000000362');
  if n <> 0 then raise exception 'FAIL: lov_telefoni tuđeg lova vraća % redova', n; end if;
  select count(*) into n from public.lov_trag('77777777-0000-4000-8000-000000000362', 'primljeno', null);
  if n <> 0 then raise exception 'FAIL: lov_trag tuđeg lova vraća % redova', n; end if;
end $$;

do $$
begin
  begin perform public.admin_odobri('00000000-0000-0000-0000-0000000036d2', false); raise exception 'FAIL: admin_odobri'; exception when insufficient_privilege then null; end;
  begin perform public.admin_postavi_ulogu('00000000-0000-0000-0000-0000000036d1', true); raise exception 'FAIL: admin_postavi_ulogu (samopromocija)'; exception when insufficient_privilege then null; end;
  begin perform public.admin_reset_pin('00000000-0000-0000-0000-0000000036d2', '123456'); raise exception 'FAIL: admin_reset_pin'; exception when insufficient_privilege then null; end;
  begin perform public.admin_obrisi_korisnika('00000000-0000-0000-0000-0000000036d2'); raise exception 'FAIL: admin_obrisi_korisnika'; exception when insufficient_privilege then null; end;
  begin perform public.obrisi_lov('77777777-0000-4000-8000-000000000362'); raise exception 'FAIL: obrisi_lov'; exception when insufficient_privilege then null; end;
  -- običan član smije samo PREDLOŽITI: nalog nastaje NEODOBREN (provjera dolje); u tuđu sekciju ne smije ni to
  begin perform public.kreiraj_korisnika('Tudji', 'Prijedlog', null, '123456', 'tudji.prijedlog@lovci.grmec.app', '55555555-0000-4000-8000-000000000362'); raise exception 'FAIL: prijedlog u tuđu sekciju'; exception when insufficient_privilege then null; end;
  perform public.kreiraj_korisnika('Novi', 'Lovac', null, '123456', 'novi.lovac@lovci.grmec.app', '55555555-0000-4000-8000-000000000361');
  begin perform public.odobri_pozvanog('55555555-0000-4000-8000-000000000361', '00000000-0000-0000-0000-0000000036d3'); raise exception 'FAIL: odobri_pozvanog'; exception when insufficient_privilege then null; end;
end $$;

-- 3) UPIS u administrativne tabele i samopromocija
do $$
begin
  begin insert into public.kamere (id, revir_id, naziv, lat, lon) values (gen_random_uuid(), (select id from public.reviri where naziv = 'Krupa'), 'x', 1, 1); raise exception 'FAIL: lovac dodaje kameru'; exception when insufficient_privilege then null; end;
  begin insert into public.reviri (naziv) values ('Moj revir'); raise exception 'FAIL: lovac dodaje revir'; exception when insufficient_privilege then null; end;
  begin insert into public.revir_lovocuvari values ((select id from public.reviri where naziv = 'Krupa'), '00000000-0000-0000-0000-0000000036d1'); raise exception 'FAIL: lovac postaje lovočuvar'; exception when insufficient_privilege then null; end;
  begin insert into public.grupovodje values ('00000000-0000-0000-0000-0000000036d1', (select id from public.reviri where naziv = 'Krupa')); raise exception 'FAIL: lovac postaje grupovođa'; exception when insufficient_privilege then null; end;
  begin insert into public.slojevi (naziv, geojson) values ('x', '{}'); raise exception 'FAIL: lovac objavljuje sloj'; exception when insufficient_privilege then null; end;
  begin insert into public.lovostaj (vrsta_kod, otvoreno_od, otvoreno_do) values ('srna', '01-01', '02-01'); raise exception 'FAIL: lovac unosi lovostaj'; exception when insufficient_privilege then null; end;
  begin insert into public.vrste (kod, naziv) values ('x', 'x'); raise exception 'FAIL: lovac unosi vrstu'; exception when insufficient_privilege then null; end;
  begin insert into public.lovovi (revir_id, sekcija_id, naziv, datum, organizator_id) values ((select id from public.reviri where naziv = 'Krupa'), '55555555-0000-4000-8000-000000000361', 'Moj lov', current_date, '00000000-0000-0000-0000-0000000036d1'); raise exception 'FAIL: lovac organizuje lov'; exception when insufficient_privilege then null; end;
  begin insert into public.ulov_prijave (id, revir_id, sekcija_id, vrsta, vrijeme) values (gen_random_uuid(), (select id from public.reviri where naziv = 'Krupa'), '55555555-0000-4000-8000-000000000362', 'srna', now()); raise exception 'FAIL: prijava ulova u tuđu sekciju'; exception when insufficient_privilege then null; end;
  begin insert into public.poruke (kanal, autor_id, tekst) values ('rukovodstvo', auth.uid(), 'ja sam rukovodstvo'); raise exception 'FAIL: lovac piše u Rukovodstvo'; exception when insufficient_privilege then null; end;
  begin update public.korisnici set is_admin = true where id = auth.uid(); raise exception 'FAIL: samopromocija is_admin'; exception when insufficient_privilege then null; end;
end $$;
-- is_admin/odobren se tiho ne mijenjaju ni kad update prođe
do $$ begin
  update public.korisnici set nadimak = 'xx' where id = auth.uid();
end $$;
reset role;
do $$ begin
  assert (select not is_admin from public.korisnici where id = '00000000-0000-0000-0000-0000000036d1'), 'x ne smije postati admin';
  assert (select not odobren and not is_admin from public.korisnici where prezime = 'Lovac' and ime = 'Novi'), 'prijedlog člana je neodobren nalog';
end $$;
rollback;
