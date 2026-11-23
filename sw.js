// Service worker: permite instalar la app en el teléfono y abrirla rápido.
// Nunca guarda datos de la base: las consultas al servidor siempre van a internet.
const CACHE = 'dc-maquinaria-v8';
const APP = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/data.js', 'js/importer.js', 'js/config.js', 'manifest.webmanifest',
  'assets/logo_color.png', 'assets/logo_negativo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || /script\.google(usercontent)?\.com$/.test(u.hostname) || u.hostname.endsWith('googleusercontent.com')) return; // API: siempre en línea
  if (u.origin === location.origin) {
    // Archivos de la app: primero la red (para recibir actualizaciones); sin internet, la copia guardada
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
  } else {
    // Librerías y tipografía: primero la copia guardada
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; })));
  }
});
