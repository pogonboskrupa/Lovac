-- Dijeljenje lokacije u lovu: učesnik može prestati dijeliti i obrisati SVOJU zadnju poziciju
-- (isključivanje u aplikaciji, kraj lova). Tuđu poziciju niko ne briše. Idempotentno.
drop policy if exists svoja_brisanje on public.lov_pozicije;
create policy svoja_brisanje on public.lov_pozicije for delete to authenticated
  using (korisnik_id = auth.uid());
