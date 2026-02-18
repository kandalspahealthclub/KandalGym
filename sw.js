const CACHE_NAME = 'kandalgym-v12';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './data.js',
    './manifest.json',
    './logo.png',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://unpkg.com/jsqr/dist/jsQR.js'
];

// Instalação - Caching dos ativos iniciais
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
    );
});

// Ativação - Limpa caches antigas para libertar espaço
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - Estratégia Stale-While-Revalidate
// Usa cache primeiro para velocidade, mas tenta atualizar em background
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                    });
                    return networkResponse;
                }).catch(() => {
                    // Fail gracefully if offline
                });
                return cachedResponse || fetchPromise;
            })
    );
});
