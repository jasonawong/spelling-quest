const CACHE = 'spelling-quest-v53';
const APP_VERSION = '53';
const DETECTIVE_ART_VERSION = 48;
const DETECTIVE_WORDS = ['wrench','hello','yellow','bread','kept','better','sentence','eggshell','medal','metal','remember','reading','peaches','peace','piece','east','west','many','special','beanstalk'];
const PICTURE_OVERRIDES = ['peaches','peace','many','special','beanstalk'];
const ASSETS = ['./','./index.html',`./island-quest.css?v=${APP_VERSION}`,`./island-quest.js?v=${APP_VERSION}`,'./vendor/three.module.min.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./word-picture-sprite.png','./sound-the-word-capybara.png','./sky-high-balloon.png',...PICTURE_OVERRIDES.map(word=>`./word-pictures/${word}.png`),...DETECTIVE_WORDS.map(word=>`./word-detective/${word}.png?v=${DETECTIVE_ART_VERSION}`)];
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
