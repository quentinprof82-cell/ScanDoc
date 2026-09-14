const CACHE='scan-go-v2';
const ASSETS=[
 './','./index.html','./manifest.webmanifest',
 './css/app.css','./css/camera.css','./css/responsive.css',
 './js/app.js','./js/storage.js','./js/pdf.js','./js/image.js','./js/detect.js','./js/camera.js','./js/editor.js','./js/ui.js',
 './icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./assets/logo-scan-go.png'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(u.protocol!=='http:'&&u.protocol!=='https:')return;
 e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{
   if(res.ok&&(u.origin===location.origin||u.hostname==='cdn.jsdelivr.net'||u.hostname==='docs.opencv.org')){
     caches.open(CACHE).then(c=>c.put(e.request,res.clone()));
   }
   return res;
 }).catch(()=>caches.match('./index.html'))));
});
