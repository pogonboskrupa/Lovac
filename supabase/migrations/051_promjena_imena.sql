-- 051: promjena imena i prezimena. Mijenja ih sam korisnik (svoje) ili administrator (bilo čije), SAMO kroz funkciju
-- `promijeni_ime`: interni email za prijavu (ime.prezime[.nadimak]@lovci.grmec.app) se računa iz imena, pa se uz ime mijenja
-- i email u auth.users / auth.identities — inače bi se lovac poslije promjene imena nije mogao prijaviti. Email računa KLIJENT
-- (isti kod kao pri prijavi), server provjerava oblik i da ga nema drugi korisnik. Direktna izmjena imena, prezimena i
-- nadimka preko tabele je zabranjena (trigger). Zavisi samo od 001; sama dodaje probni_do jer ga zastiti_korisnika koristi.

alter table public.korisnici add column if not exists probni_do timestamptz;

create or replace function public.zastiti_korisnika()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.id is distinct from old.id
    or new.is_admin is distinct from old.is_admin
    or new.odobren is distinct from old.odobren
    or new.probni_do is distinct from old.probni_do
    or new.drustvo_id is distinct from old.drustvo_id
    or new.promijenio is distinct from old.promijenio
    or new.promijenjeno is distinct from old.promijenjeno
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Ulogu i odobrenje mijenja samo administrator'
      using errcode = '42501';
  end if;
  if current_user in ('anon', 'authenticated') and (
       new.ime is distinct from old.ime or new.prezime is distinct from old.prezime or new.nadimak is distinct from old.nadimak) then
    raise exception 'Ime se mijenja kroz promijeni_ime' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.promijeni_ime(p_korisnik uuid, p_ime text, p_prezime text, p_email text)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_ime text := trim(coalesce(p_ime, ''));
  v_prezime text := trim(coalesce(p_prezime, ''));
begin
  if auth.uid() is null or not public.je_odobren() then
    raise exception 'Nije dozvoljeno' using errcode = '42501';
  end if;
  if p_korisnik is distinct from auth.uid() and not public.je_admin() then
    raise exception 'Tuđe ime mijenja samo administrator' using errcode = '42501';
  end if;
  if char_length(v_ime) not between 1 and 40 or char_length(v_prezime) not between 1 and 40 then
    raise exception 'Ime i prezime su obavezni (do 40 znakova)' using errcode = '22023';
  end if;
  if p_email !~ '^[a-z0-9-]+\.[a-z0-9-]+(\.[a-z0-9-]+)?@lovci\.grmec\.app$' then
    raise exception 'Neispravan interni email' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where u.email = p_email and u.id <> p_korisnik) then
    raise exception 'Lovac sa tim imenom i prezimenom već postoji (dodaj nadimak / broj člana)' using errcode = '23505';
  end if;
  if not exists (select 1 from public.korisnici where id = p_korisnik) then
    raise exception 'Korisnik ne postoji' using errcode = 'P0002';
  end if;
  update public.korisnici set ime = v_ime, prezime = v_prezime where id = p_korisnik;
  update auth.users set email = p_email, updated_at = now() where id = p_korisnik;
  update auth.identities set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(p_email)), updated_at = now()
   where user_id = p_korisnik and provider = 'email';
end;
$$;
revoke execute on function public.promijeni_ime(uuid, text, text, text) from public, anon;
grant execute on function public.promijeni_ime(uuid, text, text, text) to authenticated;
