-- Test 054: revir bez aktivne sekcije je u javnom spisku (sekcija_id null); neaktivan revir nije.
begin;
insert into public.reviri (id, naziv, aktivno) values
  ('77777777-0000-4000-8000-000000000541', 'Prazan revir 54', true),
  ('77777777-0000-4000-8000-000000000542', 'Ugašen revir 54', false);
set local role anon;
do $$ begin
  assert exists (select 1 from public.javne_sekcije() where revir_id = '77777777-0000-4000-8000-000000000541' and sekcija_id is null), 'revir bez sekcija je u spisku';
  assert not exists (select 1 from public.javne_sekcije() where revir_id = '77777777-0000-4000-8000-000000000542'), 'neaktivan revir nije';
end $$;
reset role;
rollback;
