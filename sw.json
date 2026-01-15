if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swCode = `
            const CACHE_NAME = 'studrive-v1';
            
            self.addEventListener('install', (e) => {
                console.log('[SW] Installation');
                self.skipWaiting();
            });
            
            self.addEventListener('activate', (e) => {
                console.log('[SW] Activation');
                e.waitUntil(self.clients.claim());
            });
            
            self.addEventListener('fetch', (e) => {
                e.respondWith(
                    fetch(e.request)
                        .then(response => {
                            const clonedResponse = response.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(e.request, clonedResponse);
                            });
                            return response;
                        })
                        .catch(() => {
                            return caches.match(e.request);
                        })
                );
            });
        `;
        
        const blob = new Blob([swCode], { type: 'application/javascript' });
        const swUrl = URL.createObjectURL(blob);
        
        navigator.serviceWorker.register(swUrl)
            .then(reg => console.log('[SW] Enregistré avec succès'))
            .catch(err => console.error('[SW] Erreur d\'enregistrement:', err));
    });
}
