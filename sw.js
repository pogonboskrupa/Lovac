// Service worker: app shell offline. Pločice kešira tiles.js (Cache API), ne ovaj fajl.
const APP_VERSION = 'v0.1.3';
const SHELL_CACHE = `shell-${APP_VERSION}`;

const SHELL = [
  './',
  'index.html',
  'static/css/app.css',
  'static/libs/leaflet/leaflet.css',
  'static/libs/leaflet/leaflet.js',
  'static/libs/supabase.js',
  'static/libs/turf.min.js',
  'static/js/auth.js',
  'static/js/boot.js',
  'static/js/config.js',
  'static/js/geo.js',
  'static/js/gps.js',
  'static/js/map.js',
  'static/js/net.js',
  'static/js/postavke.js',
  'static/js/storage.js',
  'static/js/tiles.js',
  'static/js/ui.js',
  'static/js/update.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)),
  );
});
