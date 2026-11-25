-- 041: ponovno dijeljenje lokacije sa istim lovcem (iz 037) je padalo sa
-- "new row violates row-level security policy (USING expression) for table lokacije_izabranih".
-- Uzrok: klijent šalje upsert (INSERT … ON CONFLICT DO UPDATE), a Postgres tada traži da POSTOJEĆI red prođe
-- i SELECT politiku. Ranije dijeljenje sa tim lovcem koje je isteklo dok aplikacija nije bila otvorena ostaje u
-- tabeli (do_ u prošlosti), politika `citanje` ga skriva i od vlasnika, pa je svako novo dijeljenje sa njim odbijeno.
-- Sada vlasnik vidi i svoje istekle redove (samo svoje — primalac i dalje vidi samo dok traje), a granica od
-- 30 primalaca broji samo aktivna dijeljenja.
-- Idempotentno; ako 037 još nije pokrenuta (nema tabele), ne radi ništa.

do $mig$
begin
  if to_regclass('public.lokacije_izabranih') is null then
    raise notice '041: tabela lokacije_izabranih ne postoji (pokreni 037) — preskačem';
    return;
  end if;

  execute 'drop policy if exists citanje on public.lokacije_izabranih';
  execute $p$create policy citanje on public.lokacije_izabranih for select to authenticated
    using (vlasnik_id = auth.uid() or (do_ > now() and primalac_id = auth.uid()))$p$;

  execute $f$
  create or replace function public.zastiti_lokaciju_izabranih()
  returns trigger language plpgsql as $t$
  begin
    if tg_op = 'UPDATE' then
      new.vlasnik_id := old.vlasnik_id;
      new.primalac_id := old.primalac_id;
    else
      if auth.uid() is not null then new.vlasnik_id := auth.uid(); end if;
      if (select count(*) from public.lokacije_izabranih
          where vlasnik_id = new.vlasnik_id and primalac_id <> new.primalac_id and do_ > now()) >= 30 then
        raise exception 'previse_primalaca' using errcode = '54000';
      end if;
    end if;
    new.t := now();
    return new;
  end;
  $t$$f$;
end
$mig$;
