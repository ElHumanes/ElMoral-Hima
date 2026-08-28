/**
 * Service Worker de la PWA.
 *
 * - El "esqueleto" de la app (HTML, CSS, JS, manifest) va siempre primero a
 *   la red, para que cualquier actualización del código llegue de inmediato
 *   a quien ya tenga la app instalada. Si no hay conexión, se sirve la
 *   última copia guardada en caché.
 * - Las imágenes (logos, iconos) casi nunca cambian, así que van primero a
 *   caché para cargar rápido, y solo a la red si no están guardadas todavía.
 * - Las llamadas al backend (Apps Script) NUNCA se tocan: van siempre
 *   directas a la red, para que los datos estén siempre al día.
 */

var CACHE_NOMBRE = 'padel-app-cache-v5';

var ARCHIVOS_PARA_CACHEAR = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './assets/logo-club.png',
  './assets/logo-snp.png',
  './assets/logo-hima.png',
  './assets/logo-cocinadelsur.jpg',
  './assets/logo-baron.png',
  './assets/logo-opticalajara.jpg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png'
];

// Se calculan a partir de la propia ubicación del service worker, para que
// funcione igual tanto si la app vive en la raíz de un dominio (pruebas en
// local) como en una subcarpeta (GitHub Pages sirve en /padel-app/).
var ARCHIVOS_ESQUELETO = ['', 'index.html', 'styles.css', 'app.js', 'manifest.json']
  .map(function (nombre) { return new URL(nombre, self.location).pathname; });

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE_NOMBRE).then(function (cache) {
      return cache.addAll(ARCHIVOS_PARA_CACHEAR);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(
        nombres
          .filter(function (nombre) { return nombre !== CACHE_NOMBRE; })
          .map(function (nombre) { return caches.delete(nombre); })
      );
    })
  );
  self.clients.claim();
});

function esArchivoEsqueleto(pathname) {
  return ARCHIVOS_ESQUELETO.indexOf(pathname) !== -1;
}

self.addEventListener('fetch', function (evento) {
  var url = new URL(evento.request.url);

  // Las llamadas al backend (Apps Script) van siempre a la red, nunca a caché.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Solo interceptamos peticiones GET propias; el resto pasa directo a la red.
  if (evento.request.method !== 'GET') {
    return;
  }

  if (esArchivoEsqueleto(url.pathname) || evento.request.mode === 'navigate') {
    // Esqueleto de la app: red primero (sin pasar por la caché HTTP del
    // navegador, para que una actualización no se quede escondida detrás de
    // una copia que el propio navegador decidió guardar), caché del Service
    // Worker como respaldo sin conexión.
    evento.respondWith(
      fetch(evento.request, { cache: 'no-store' })
        .then(function (respuestaRed) {
          var copia = respuestaRed.clone();
          caches.open(CACHE_NOMBRE).then(function (cache) { cache.put(evento.request, copia); });
          return respuestaRed;
        })
        .catch(function () {
          return caches.match(evento.request).then(function (r) { return r || caches.match('./index.html'); });
        })
    );
    return;
  }

  // Resto de archivos (imágenes, iconos): caché primero, red como respaldo.
  evento.respondWith(
    caches.match(evento.request).then(function (respuestaCache) {
      if (respuestaCache) {
        return respuestaCache;
      }
      return fetch(evento.request).then(function (respuestaRed) {
        var copia = respuestaRed.clone();
        caches.open(CACHE_NOMBRE).then(function (cache) { cache.put(evento.request, copia); });
        return respuestaRed;
      });
    })
  );
});
