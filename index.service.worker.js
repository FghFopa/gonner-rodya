const CACHE_VERSION = '1787677089';
const CACHE_PREFIX = 'guster-sw-cache-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const OFFLINE_URL = 'index.offline.html';
const ENSURE_CROSSORIGIN_ISOLATION_HEADERS = true;

const CACHED_FILES = ["index.html","index.js","index.offline.html","index.icon.png","index.apple-touch-icon.png","index.audio.worklet.js","index.audio.position.worklet.js"];
const CACHEABLE_FILES = ["index.wasm.br", "index.pck"];
const FULL_CACHE = CACHED_FILES.concat(CACHEABLE_FILES);

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHED_FILES)));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(caches.keys().then(
		(keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))
	).then(() => ('navigationPreload' in self.registration) ? self.registration.navigationPreload.enable() : Promise.resolve()));
});

function ensureCrossOriginIsolationHeaders(response) {
	if (response.headers.get('Cross-Origin-Embedder-Policy') === 'require-corp'
		&& response.headers.get('Cross-Origin-Opener-Policy') === 'same-origin') {
		return response;
	}
	const crossOriginIsolatedHeaders = new Headers(response.headers);
	crossOriginIsolatedHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
	crossOriginIsolatedHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: crossOriginIsolatedHeaders,
	});
}

async function fetchAndCache(event, request, cache, isCacheable) {
	let response = await event.preloadResponse;
	if (response == null) {
		response = await self.fetch(request);
	}
	if (ENSURE_CROSSORIGIN_ISOLATION_HEADERS) {
		response = ensureCrossOriginIsolationHeaders(response);
	}
	if (isCacheable) {
		cache.put(request, response.clone());
	}
	return response;
}

self.addEventListener('fetch', (event) => {
	let req = event.request;
	let url = req.url || '';

	if (url.endsWith('index.wasm')) {
		url += '.br';
		req = new Request(url, req);
	}

	const isNavigate = req.mode === 'navigate';
	const referrer = req.referrer || '';
	const base = referrer.slice(0, referrer.lastIndexOf('/') + 1);
	const local = url.startsWith(base) ? url.replace(base, '') : '';
	const isCacheable = FULL_CACHE.some((v) => v === local) || (base === referrer && base.endsWith(CACHED_FILES[0]));

	if (isNavigate || isCacheable) {
		event.respondWith((async () => {
			const cache = await caches.open(CACHE_NAME);
			if (isNavigate) {
				const fullCache = await Promise.all(FULL_CACHE.map((name) => cache.match(name)));
				if (fullCache.some((v) => v === undefined)) {
					try {
						return await fetchAndCache(event, req, cache, isCacheable);
					} catch (e) {
						return caches.match(OFFLINE_URL);
					}
				}
			}
			let cached = await cache.match(req);
			if (cached != null) {
				if (ENSURE_CROSSORIGIN_ISOLATION_HEADERS) {
					cached = ensureCrossOriginIsolationHeaders(cached);
				}
				return cached;
			}
			return await fetchAndCache(event, req, cache, isCacheable);
		})());
	} else if (ENSURE_CROSSORIGIN_ISOLATION_HEADERS) {
		event.respondWith((async () => {
			let response = await fetch(req);
			return ensureCrossOriginIsolationHeaders(response);
		})());
	}
});

self.addEventListener('message', (event) => {
	if (event.origin !== self.origin) return;
	const msg = event.data || '';
	if (msg === 'claim') {
		self.skipWaiting().then(() => self.clients.claim());
	}
});
