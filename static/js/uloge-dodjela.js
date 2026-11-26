// Dodjela uloge korisniku (admin): ista pravila kao u Korisnici → Upravljanje → Uloge, ali iz koda, da ih može
// koristiti i ekran "Novi korisnik" odmah poslije pravljenja naloga. Server (RLS, migracija 045) provodi prava.
import { ULOGA_LOVOCUVAR, ULOGA_LOVOVODJA_DRUSTVA, ULOGA_PREDSJEDNIK } from './hijerarhija.js';

export const ULOGE_NOVOG = [
  { id: 'clan', tekst: 'Član sekcije' },
  { id: 'grupovodja_grupe', tekst: 'Grupovođa (nova grupa u sekciji)' },
  { id: 'lovovodja_sekcije', tekst: 'Lovovođa sekcije' },
  { id: 'lovovodja_revira', tekst: 'Lovovođa revira' },
  { id: ULOGA_PREDSJEDNIK, tekst: 'Predsjednik' },
  { id: ULOGA_LOVOCUVAR, tekst: 'Lovočuvar društva' },
  { id: ULOGA_LOVOVODJA_DRUSTVA, tekst: 'Lovovođa društva' },
];

const must = ({ error }) => { if (error) throw new Error(error.message); };

// sb = Supabase klijent; sekcija = { id, revir_id } sekcija u koju je korisnik primljen.
export async function assignRole(sb, uloga, { userId, sekcija }) {
  switch (uloga) {
    case 'clan': return;
    case 'grupovodja_grupe': {
      const { data, error } = await sb.from('grupe').insert({ sekcija_id: sekcija.id, grupovodja_id: userId }).select('id');
      if (error) throw new Error(error.message);
      must(await sb.rpc('dodijeli_grupu', { p_sekcija: sekcija.id, p_korisnik: userId, p_grupa: data[0].id }));
      return;
    }
    case 'lovovodja_sekcije':
      must(await sb.from('sekcije').update({ grupovodja_id: userId }).eq('id', sekcija.id));
      return;
    case 'lovovodja_revira':
      // jedan po reviru: sadašnji se prvo skida (server to traži)
      must(await sb.from('revir_vodje').delete().eq('revir_id', sekcija.revir_id));
      must(await sb.from('revir_vodje').insert({ revir_id: sekcija.revir_id, korisnik_id: userId }));
      return;
    case ULOGA_PREDSJEDNIK:
    case ULOGA_LOVOCUVAR:
    case ULOGA_LOVOVODJA_DRUSTVA:
      must(await sb.from('drustvo_uloge').insert({ korisnik_id: userId, uloga }));
      return;
    default: throw new Error('Nepoznata uloga');
  }
}
