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

// Dugmad vezana za lokaciju (opažanje, snimanje traga, praćenje, istraživač, centriranje) su u ploči "Moja lokacija".
export async function lok(page, selector) {
  if (!(await page.locator('#lok-ploca').isVisible())) await page.locator('#btn-moja-lokacija').click();
  await page.locator(selector).click();
}

// Postavke imaju tabove (opste | podaci | nalog | profil).
export async function postTab(page, tab) {
  await page.locator(`#p-tabovi [data-ptab="${tab}"]`).click();
}

// Dva prsta na karti (Istraživač): rotacija u stepenima (u smjeru kazaljke) i omjer razmaka prstiju (zum).
export async function twoFingers(page, { rotate = 0, scale = 1, cx = 180, cy = 450, r = 60 } = {}) {
  await page.evaluate(({ rotate, scale, cx, cy, r }) => {
    const el = document.getElementById('karta');
    const fire = (type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
    const pos = (ang, rad) => [cx + rad * Math.cos((ang * Math.PI) / 180), cy + rad * Math.sin((ang * Math.PI) / 180)];
    fire('pointerdown', 1, ...pos(180, r));
    fire('pointerdown', 2, ...pos(0, r));
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const ang = rotate * f;
      const rad = r * (1 + (scale - 1) * f);
      fire('pointermove', 1, ...pos(180 + ang, rad));
      fire('pointermove', 2, ...pos(ang, rad));
    }
    fire('pointerup', 1, 0, 0);
    fire('pointerup', 2, 0, 0);
  }, { rotate, scale, cx, cy, r });
}
