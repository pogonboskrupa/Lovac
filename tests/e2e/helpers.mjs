// 1x1 PNG kao lažna pločica.
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
export const TILE_HOSTS = /opentopomap\.org|arcgisonline\.com|openstreetmap\.org/;

export async function serveTiles(page, counter = { n: 0 }) {
  await page.route(TILE_HOSTS, (route) => {
    counter.n++;
    return route.fulfill({ status: 200, body: PNG, headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' } });
  });
  // Provjera nove verzije ne smije ići na pravi server u testu.
  await page.route(/api\.github\.com|raw\.githubusercontent\.com/, (r) => r.fulfill({ status: 404, body: '{}' }));
  // Vjetar i DEM ne smiju ići na prave servere u testovima.
  await page.route(/api\.open-meteo\.com|elevation-tiles-prod/, (r) => r.fulfill({ status: 404, body: '' }));
  return counter;
}

async function overrideConfig(page, url, key) {
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    const src = (await res.text())
      .replace(/SUPABASE_URL = '[^']*'/, `SUPABASE_URL = '${url}'`)
      .replace(/SUPABASE_ANON_KEY = '[^']*'/, `SUPABASE_ANON_KEY = '${key}'`);
    return route.fulfill({ response: res, body: src });
  });
}

// Podmeće config.js sa "podešenim" serverom čiji pozivi vise (mrtva veza).
export async function fakeServerConfigHanging(page) {
  await overrideConfig(page, 'https://lazni.supabase.test', 'anon');
  await page.route(/lazni\.supabase\.test/, () => new Promise(() => {}));
}

// Server nije podešen: app ulazi direktno na kartu.
export async function fakeServerConfigUnset(page) {
  await overrideConfig(page, '', '');
}
