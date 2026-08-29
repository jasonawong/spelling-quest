const CACHE = 'spelling-quest-v56';
const APP_VERSION = '56';
const DETECTIVE_SPRITES = [1,2,3,4,5].map(number=>`./word-detective-sprites/set-${number}.png?v=${APP_VERSION}`);
const ASSETS = ['./','./index.html',`./island-quest.css?v=${APP_VERSION}`,`./island-quest.js?v=${APP_VERSION}`,'./vendor/three.module.min.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./word-picture-sprite-v55.png','./sound-the-word-capybara.png','./sky-high-balloon.png',...DETECTIVE_SPRITES];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(ASSETS.map(url => cache.add(new Request(new URL(url,self.location).href,{ cache:'reload' }))))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if(requestUrl.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(async resp => {
    if(resp.ok){
      const copy = resp.clone();
      await caches.open(CACHE).then(cache => cache.put(event.request,copy));
    }
    return resp;
  }).catch(async() => {
    const cached = await caches.match(event.request);
    if(cached) return cached;
    if(event.request.mode === 'navigate') return caches.match('./index.html');
    return Response.error();
  }));
});
