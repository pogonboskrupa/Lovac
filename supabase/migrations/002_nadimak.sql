-- 002: nadimak ili broj člana — razlikuje lovce istog imena i prezimena (npr. otac i sin).
-- Idempotentno.

alter table public.korisnici add column if not exists nadimak text;

create or replace function public.novi_korisnik()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.korisnici (id, ime, prezime, nadimak, drustvo_id)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'ime'), ''), '?'), 40),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'prezime'), ''), '?'), 40),
    left(nullif(trim(new.raw_user_meta_data ->> 'nadimak'), ''), 20),
    (select d.id from public.drustva d order by d.created_at limit 1)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.novi_korisnik() from public, anon;
