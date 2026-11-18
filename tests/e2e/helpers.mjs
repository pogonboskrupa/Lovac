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
  await page.route(/api\.github\.com/, (r) => r.fulfill({ status: 404, body: '{}' }));
  return counter;
}

// Podmeće config.js sa "podešenim" serverom čiji pozivi vise (mrtva veza).
export async function fakeServerConfigHanging(page) {
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    const src = (await res.text())
      .replace("SUPABASE_URL = ''", "SUPABASE_URL = 'https://lazni.supabase.test'")
      .replace("SUPABASE_ANON_KEY = ''", "SUPABASE_ANON_KEY = 'anon'");
    return route.fulfill({ response: res, body: src });
  });
  await page.route(/lazni\.supabase\.test/, () => new Promise(() => {}));
}
