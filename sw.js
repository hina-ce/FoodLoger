const STATIC_CACHE = "foodloger-static-v2";
const RUNTIME_CACHE = "foodloger-runtime-v2";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

async function handleNavigation(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await runtimeCache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return (await runtimeCache.match(request)) || (await caches.match("./offline.html"));
  }
}

async function handleAsset(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  const cachedResponse = await caches.match(request);

  const networkResponse = fetch(request)
    .then((response) => {
      if (response.ok) {
        runtimeCache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cachedResponse || (await networkResponse) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || !isSameOrigin(request)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (["script", "style", "image", "font"].includes(request.destination) || request.url.endsWith(".webmanifest")) {
    event.respondWith(handleAsset(request));
  }
});
