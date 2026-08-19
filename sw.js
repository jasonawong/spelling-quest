const CACHE = 'spelling-quest-v13';
const DETECTIVE_WORDS = ['mask','track','stamp','stage','grade','they','batch','chance','graph','trade','raise','eight','safety','wrapped','laugh','ramp','crane','flame','magical','station'];
const ASSETS = ['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./word-picture-sprite.png',...DETECTIVE_WORDS.map(word=>`./word-detective/${word}.png`)];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
    const copy = resp.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return resp;
  }).catch(()=>caches.match('./index.html'))));
});
