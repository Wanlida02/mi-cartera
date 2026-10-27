/* Service worker: la app (código) funciona sin conexión. precios.json siempre de red; datos personales nunca pasan por aquí. */
const C = 'mi-cartera-v3', F = ['./', 'index.html', 'css/app.css', 'js/val.js', 'js/logic.js', 'js/store.js', 'js/drive.js', 'js/cribado.js', 'js/app.js', 'js/cribado-ui.js', 'js/valoracion-ui.js', 'manifest.webmanifest', 'icons/icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(F)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('precios.json')) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
