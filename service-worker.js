
const CACHE_NAME = "our-little-space-v3";

const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./manifest.json",
    "./assets/css/style.css",
    "./assets/js/app.js",
    "./assets/js/firebase.js",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(FILES_TO_CACHE);
        })
    );

    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );

    self.clients.claim();
});


self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;

    event.respondWith(
        fetch(event.request).catch(async () => {
            const cachedResponse = await caches.match(
                event.request,
                { ignoreSearch: true }
            );

            if (cachedResponse) {
                return cachedResponse;
            }

            if (event.request.mode === "navigate") {
                return await caches.match("./index.html");
            }

            return new Response("Offline: Resource unavailable.", {
                status: 503,
                statusText: "Service Unavailable"
            });
        })
    );
});

