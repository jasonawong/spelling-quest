const CACHE = 'spelling-quest-v48';
const DETECTIVE_ART_VERSION = 48;
const DETECTIVE_WORDS = ['wrench','hello','yellow','bread','kept','better','sentence','eggshell','medal','metal','remember','reading','peaches','peace','piece','east','west','many','special','beanstalk'];
const PICTURE_OVERRIDES = ['peaches','peace','many','special','beanstalk'];
const ASSETS = ['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./word-picture-sprite.png','./sound-the-word-capybara.png','./sky-high-balloon.png',...PICTURE_OVERRIDES.map(word=>`./word-pictures/${word}.png`),...DETECTIVE_WORDS.map(word=>`./word-detective/${word}.png?v=${DETECTIVE_ART_VERSION}`)];
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
