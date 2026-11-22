-- Logo sekcije: grupovođa ili admin može učitati sliku (mala, ~128 px); bez nje aplikacija sama crta logo iz naziva.
alter table public.sekcije add column if not exists logo text check (logo is null or char_length(logo) <= 40000);
