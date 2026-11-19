-- Test 006: zajednički lov — ko organizuje, ko vidi raspored, ko dobija telefone.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000006a1', 'admin6@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000006b1', 'vodja6@t', '{"ime":"Vojo","prezime":"Vođa"}'),
  ('00000000-0000-0000-0000-0000000006b2', 'vodja6b@t', '{"ime":"Drugi","prezime":"Vođa"}'),
  ('00000000-0000-0000-0000-0000000006c1', 'ucesnik6@t', '{"ime":"Uroš","prezime":"Učesnik"}'),
  ('00000000-0000-0000-0000-0000000006d1', 'van6@t', '{"ime":"Vanja","prezime":"Vanlovni"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000006a1';
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-0000000006b2',
  '00000000-0000-0000-0000-0000000006c1', '00000000-0000-0000-0000-0000000006d1');

-- Admin pravi revire i postavlja vođe.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006a1', true); end $$;
do $$ begin
  insert into public.reviri (id, naziv) values
    ('66666666-0000-4000-8000-0000000000a1', 'Revir Bara'), ('66666666-0000-4000-8000-0000000000a2', 'Revir Grmeč');
  insert into public.revir_vodje values
    ('66666666-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-0000000006b1'),
    ('66666666-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-0000000006b2');
end $$;
reset role;

-- Lovci postavljaju svoje telefone (samo svoje).
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006c1', true); end $$;
do $$ begin
  insert into public.kontakti (telefon) values ('+387 61 111 222');
  begin
    insert into public.kontakti (korisnik_id, telefon) values ('00000000-0000-0000-0000-0000000006d1', '061999999');
    raise exception 'FAIL: unos tuđeg telefona prošao';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_odobri('00000000-0000-0000-0000-0000000006c1', true);
    raise exception 'FAIL: lovac pozvao admin funkciju';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006d1', true); end $$;
do $$ begin
  insert into public.kontakti (telefon) values ('061 333 444');
  assert (select count(*) from public.kontakti) = 1, 'lovac vidi samo svoj telefon';
end $$;
reset role;

-- Vođa revira Bara pravi lov u svom reviru; ne smije u tuđem.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006b1', true); end $$;
do $$ begin
  insert into public.lovovi (id, revir_id, naziv, datum) values
    ('77777777-0000-4000-8000-000000000001', '66666666-0000-4000-8000-0000000000a1', 'Pogon na svinje', '2026-12-05');
  begin
    insert into public.lovovi (revir_id, naziv, datum) values ('66666666-0000-4000-8000-0000000000a2', 'Tuđi revir', '2026-12-05');
    raise exception 'FAIL: vođa napravio lov u tuđem reviru';
  exception when insufficient_privilege then null;
  end;
  insert into public.lov_ucesnici values
    ('77777777-0000-4000-8000-000000000001', '00000000-0000-0000-0000-0000000006c1', 'strijelac'),
    ('77777777-0000-4000-8000-000000000001', '00000000-0000-0000-0000-0000000006b1', 'vodja');
  insert into public.stanovi (id, lov_id, broj, lat, lon, korisnik_id) values
    ('88888888-0000-4000-8000-000000000001', '77777777-0000-4000-8000-000000000001', 1, 44.88, 16.15, '00000000-0000-0000-0000-0000000006c1');
  insert into public.sektori (stan_id, od_azimut, do_azimut, razlog) values
    ('88888888-0000-4000-8000-000000000001', 340, 15, 'Selo');
  begin
    insert into public.sektori (stan_id, od_azimut, do_azimut, razlog) values ('88888888-0000-4000-8000-000000000001', 400, 10, 'x');
    raise exception 'FAIL: azimut van 0-360 prihvaćen';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Drugi vođa (drugi revir) ne vidi ni ne mijenja ovaj lov.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006b2', true); end $$;
do $$ begin
  assert (select count(*) from public.lovovi) = 0, 'vođa drugog revira ne vidi lov';
  assert (select count(*) from public.stanovi) = 0, 'vođa drugog revira ne vidi stanove';
  begin
    insert into public.stanovi (lov_id, broj, lat, lon) values ('77777777-0000-4000-8000-000000000001', 9, 1, 1);
    raise exception 'FAIL: vođa drugog revira dodao stan';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Učesnik: vidi lov, svoj raspored i sektore; ne mijenja ništa; telefoni tek kad je lov u toku.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006c1', true); end $$;
do $$ begin
  assert (select count(*) from public.lovovi) = 1, 'učesnik vidi lov';
  assert (select count(*) from public.stanovi) = 1, 'učesnik vidi stanove';
  assert (select count(*) from public.sektori) = 1, 'učesnik vidi sektore';
  update public.stanovi set lat = 0;
  assert (select lat from public.stanovi) = 44.88, 'učesnik ne mijenja stan';
  update public.lovovi set status = 'u_toku';
  assert (select status from public.lovovi) = 'planiran', 'učesnik ne pokreće lov';
  assert (select count(*) from public.lov_telefoni('77777777-0000-4000-8000-000000000001')) = 0, 'telefoni nisu dostupni prije početka lova';
end $$;
reset role;

-- Nije učesnik: ne vidi ništa.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006d1', true); end $$;
do $$ begin
  assert (select count(*) from public.lovovi) = 0, 'neučesnik ne vidi lov';
  assert (select count(*) from public.lov_ucesnici) = 0, 'neučesnik ne vidi učesnike';
end $$;
reset role;

-- Vođa pokreće lov: učesnik sada dobija telefone učesnika (ali ne i lovca van lova).
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006b1', true); end $$;
do $$ begin update public.lovovi set status = 'u_toku' where id = '77777777-0000-4000-8000-000000000001'; end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006c1', true); end $$;
do $$ begin
  assert (select count(*) from public.lov_telefoni('77777777-0000-4000-8000-000000000001')) = 1, 'telefon učesnika (sa brojem) dostupan';
  assert not exists (select 1 from public.lov_telefoni('77777777-0000-4000-8000-000000000001') where telefon = '061 333 444'),
    'telefon lovca koji nije u lovu ne smije procuriti';
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006d1', true); end $$;
do $$ begin
  assert (select count(*) from public.lov_telefoni('77777777-0000-4000-8000-000000000001')) = 0, 'neučesnik ne dobija telefone';
end $$;
reset role;

-- Admin vidi i organizuje svaki lov.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006a1', true); end $$;
do $$ begin
  assert (select count(*) from public.lovovi) = 1, 'admin vidi lov';
  assert public.moze_organizovati('77777777-0000-4000-8000-000000000001'), 'admin organizuje';
end $$;
reset role;

rollback;
