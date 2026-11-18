/* Service worker (red primero y siempre revalidando con el servidor: la caché HTTP de GitHub Pages dura 10 min): la app (código) funciona sin conexión. precios.json siempre de red; datos personales nunca pasan por aquí. */
const C = 'mi-cartera-v69', F = ['./', 'index.html', 'css/app.css', 'js/val.js', 'js/logic.js', 'js/store.js', 'js/drive.js', 'js/cribado.js', 'js/app.js', 'js/enlaces-ui.js', 'js/datos-web.js', 'js/cribado-ui.js', 'js/valoracion-ui.js', 'js/resultados-ui.js', 'js/extras-ui.js', 'manifest.webmanifest', 'icons/icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(F)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('precios.json') || u.searchParams.has('_')) return;   // «?_=hora» es la comprobación de versión: siempre a la red y sin guardar (antes dejaba una entrada nueva en la caché en cada arranque)
  const clave = u.origin + u.pathname;   // una entrada por archivo, sin «?v=…»: la caché no crece con cada versión
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(C).then(c => c.put(clave, cp)); } return r; }).catch(() => caches.match(clave).then(r => r || caches.match(e.request, { ignoreSearch: true }))));   // un 404/500 no sustituye a la copia buena
});
