// Zorgt dat het spel als app werkt, ook zonder internet.
// Eerst proberen van internet (zodat je altijd de nieuwste versie hebt), anders uit de opslag.
const CACHE = 'nieuwe-game';
const BESTANDEN = ['./', 'index.html', 'style.css', 'config.js', 'map.js', 'game.js',
  'vendor/three.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BESTANDEN)));
  self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const kopie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, kopie)); return r; })
      .catch(() => caches.match(e.request))
  );
});
