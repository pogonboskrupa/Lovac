-- 054: spisak za registraciju uključuje i revire koji još nemaju nijednu aktivnu sekciju (npr. Jezerski), da se vide
-- pri registraciji. Red takvog revira ima sekcija_id = null. Zavisi samo od 001–025. Idempotentno.
create or replace function public.javne_sekcije()
returns table (sekcija_id uuid, naziv text, revir_id uuid, revir text)
language sql stable security definer
set search_path = public
as $$
  select s.id, s.naziv, r.id, r.naziv
    from public.reviri r left join public.sekcije s on s.revir_id = r.id and s.aktivno
   where r.aktivno
   order by r.naziv, s.naziv;
$$;
revoke execute on function public.javne_sekcije() from public;
grant execute on function public.javne_sekcije() to anon, authenticated;
