/* Scan & Go - static PWA, local-first */
const $ = s => document.querySelector(s);
const DB_NAME = "scan-go-db", STORE = "documents";
let db, currentDoc = null, currentPages = [], lastPdfBlob = null;

const settings = {
  quality: localStorage.getItem("quality") || "high",
  autoDetect: localStorage.getItem("autoDetect") !== "false",
  keepOriginals: localStorage.getItem("keepOriginals") === "true"
};

document.addEventListener("DOMContentLoaded", async () => {
  $("#qualitySelect").value = settings.quality;
  $("#autoDetect").checked = settings.autoDetect;
  $("#keepOriginals").checked = settings.keepOriginals;
  await openDB();
  bindUI();
  renderRecent();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
});

function bindUI(){
  $("#startScanBtn").onclick = () => openScanner();
  $("#newScanBtn").onclick = () => openScanner();
  $("#importQuick").onclick = () => $("#fileInput").click();
  $("#addPageQuick").onclick = () => {
    if(currentDoc) $("#fileInput").click(); else openScanner();
  };
  $("#viewPdfQuick").onclick = () => {
    if(lastPdfBlob) downloadBlob(lastPdfBlob, "scan.pdf");
    else alert("Scannez d'abord un document.");
  };
  $("#shareQuick").onclick = () => {
    if(lastPdfBlob) shareBlob(lastPdfBlob, "scan.pdf");
    else alert("Scannez d'abord un document.");
  };
  $("#fileInput").onchange = e => [...e.target.files].forEach(f => addImageFile(f));
  $("#viewAllBtn").onclick = () => switchView("scansView");
  $("#settingsBtn").onclick = () => switchView("settingsView");
  document.querySelectorAll(".nav-item").forEach(b => b.onclick = () => switchView(b.dataset.view));
  $("#qualitySelect").onchange = e => localStorage.setItem("quality", e.target.value);
  $("#autoDetect").onchange = e => localStorage.setItem("autoDetect", e.target.checked);
  $("#keepOriginals").onchange = e => localStorage.setItem("keepOriginals", e.target.checked);
  $("#clearAllBtn").onclick = async () => { if(confirm("Supprimer tous les scans de cet appareil ?")) { await clearDB(); renderRecent(); renderAll(); } };
}

function switchView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  window.scrollTo(0,0);
}

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:"id"});
    req.onsuccess=()=>{db=req.result;resolve()};
    req.onerror=()=>reject(req.error);
  });
}
function putDoc(doc){return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(doc);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function getDocs(){return new Promise((res,rej)=>{const tx=db.transaction(STORE);const r=tx.objectStore(STORE).getAll();r.onsuccess=()=>res(r.result.sort((a,b)=>b.created-a.created));r.onerror=()=>rej(r.error)})}
function delDoc(id){return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function clearDB(){return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}

async function renderRecent(){
  const docs=await getDocs(), box=$("#recentList");
  box.innerHTML=docs.slice(0,5).map(rowHTML).join("");
  $("#emptyRecent").style.display=docs.length?"none":"block";
  attachRows();
}
async function renderAll(){
  const docs=await getDocs(), box=$("#allScansList");
  box.innerHTML=docs.map(rowHTML).join("");
  $("#emptyAll").style.display=docs.length?"none":"block";
  attachRows();
}
function rowHTML(d){
  const thumb=d.pages?.[0]?.data || "";
  const date=new Date(d.created).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"});
  return `<div class="scan-row" data-id="${d.id}">
    <img class="thumb" src="${thumb}" alt="">
    <div class="scan-info"><strong>${escapeHTML(d.name)}</strong><small>${date} · ${d.pages.length} page${d.pages.length>1?"s":""}</small></div>
    <button class="more-btn" data-action="open" aria-label="Ouvrir">•••</button>
  </div>`;
}
function attachRows(){
  document.querySelectorAll(".scan-row").forEach(r=>r.querySelector("[data-action=open]").onclick=()=>openDoc(r.dataset.id));
}
async function openDoc(id){
  const docs=await getDocs(), d=docs.find(x=>x.id===id); if(!d)return;
  currentDoc=d; currentPages=d.pages;
  lastPdfBlob=await makePdf(currentPages);
  const action=prompt("Document ouvert. Tapez :\n1 = télécharger PDF\n2 = partager\n3 = supprimer","1");
  if(action==="1")downloadBlob(lastPdfBlob,safeName(d.name)+".pdf");
  if(action==="2")shareBlob(lastPdfBlob,safeName(d.name)+".pdf");
  if(action==="3"){await delDoc(id);renderRecent();renderAll();}
}

async function openScanner(){
  const ok = await ensureCameraPermission();
  if(!ok){ $("#fileInput").click(); return; }
  showCameraModal();
}
async function ensureCameraPermission(){
  try{
    if(!navigator.mediaDevices?.getUserMedia) return false;
    const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}}});
    s.getTracks().forEach(t=>t.stop()); return true;
  }catch(e){return false}
}
function showCameraModal(){
  const m=document.createElement("div");m.className="modal";
  m.innerHTML=`<div class="camera-card"><div class="camera-head"><b>Scanner</b><button id="closeCam">✕</button></div>
    <video id="camVideo" autoplay playsinline muted></video><canvas id="camOverlay"></canvas>
    <div class="scan-hint">Cadrez la feuille dans l'image. Les coins sont détectés automatiquement.</div>
    <div class="camera-actions"><button id="galleryCam">Galerie</button><button id="snap" class="snap">●</button><button id="finishCam">Terminer</button></div></div>`;
  document.body.appendChild(m);
  injectModalCSS();
  const video=$("#camVideo");
  let stream;
  navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:2560},height:{ideal:1440}}}).then(s=>{stream=s;video.srcObject=s}).catch(()=>{m.remove();$("#fileInput").click()});
  $("#closeCam").onclick=()=>{stream?.getTracks().forEach(t=>t.stop());m.remove()};
  $("#galleryCam").onclick=()=>{$("#fileInput").click();};
  $("#snap").onclick=async()=>{
    const c=document.createElement("canvas");c.width=video.videoWidth;c.height=video.videoHeight;c.getContext("2d").drawImage(video,0,0);
    const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.95));await processCaptured(blob);
  };
  $("#finishCam").onclick=()=>{stream?.getTracks().forEach(t=>t.stop());m.remove();if(currentPages.length) finalizeDocument()};
}
async function processCaptured(blob){
  const img=await blobToImage(blob);
  let processed=img;
  if(settings.autoDetect && window.cv) {
    try { const corners=detectDocumentCorners(img); if(corners) processed=perspectiveCrop(img,corners); } catch(e){}
  }
  const enhanced=enhanceCanvas(processed);
  const data=enhanced.toDataURL("image/jpeg", settings.quality==="small"?.72:settings.quality==="medium"?.84:.92);
  currentPages.push({data});
  showToast(`Page ${currentPages.length} ajoutée`);
}
async function addImageFile(file){
  if(!file.type.startsWith("image/"))return;
  const img=await blobToImage(file); let processed=img;
  if(settings.autoDetect && window.cv){try{const corners=detectDocumentCorners(img);if(corners)processed=perspectiveCrop(img,corners)}catch(e){}}
  const enhanced=enhanceCanvas(processed);
  currentPages.push({data:enhanced.toDataURL("image/jpeg",.92)});
  if(!currentDoc) currentDoc={id:crypto.randomUUID(),created:Date.now(),name:"Document sans titre",pages:currentPages};
  if(confirm(`Page ajoutée (${currentPages.length}). Ajouter une autre page ?`)) $("#fileInput").click(); else finalizeDocument();
}
async function finalizeDocument(){
  if(!currentPages.length)return;
  const name=prompt("Nom du document :", currentDoc?.name==="Document sans titre"?"Mon scan":currentDoc?.name||"Mon scan")||"Mon scan";
  const doc={id:currentDoc?.id||crypto.randomUUID(),created:currentDoc?.created||Date.now(),name,pages:currentPages};
  await putDoc(doc);currentDoc=doc;lastPdfBlob=await makePdf(currentPages);
  await renderRecent();await renderAll();
  const choice=prompt("Document enregistré.\n\n1 = Télécharger le PDF\n2 = Partager\n3 = Ne rien faire","2");
  if(choice==="1")downloadBlob(lastPdfBlob,safeName(name)+".pdf");
  if(choice==="2")shareBlob(lastPdfBlob,safeName(name)+".pdf");
  currentPages=[];currentDoc=null;
}
async function makePdf(pages){
  const pdf=await PDFLib.PDFDocument.create();
  for(const p of pages){
    const imgBytes=dataURLToBytes(p.data);
    const jpg=await pdf.embedJpg(imgBytes);
    const ratio=jpg.height/jpg.width; const w=595.28,h=Math.max(841.89,w*ratio);
    const page=pdf.addPage([w,h]); page.drawImage(jpg,{x:0,y:0,width:w,height:h});
  }
  const bytes=await pdf.save();
  return new Blob([bytes],{type:"application/pdf"});
}
async function shareBlob(blob,name){
  const file=new File([blob],name,{type:"application/pdf"});
  if(navigator.canShare?.({files:[file]}) && navigator.share){
    try{await navigator.share({title:name,text:"Document scanné",files:[file]});return}catch(e){if(e.name==="AbortError")return}
  }
  downloadBlob(blob,name);
}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function blobToImage(blob){return new Promise((res,rej)=>{const u=URL.createObjectURL(blob),i=new Image();i.onload=()=>{URL.revokeObjectURL(u);res(i)};i.onerror=rej;i.src=u})}
function dataURLToBytes(data){const b=atob(data.split(",")[1]),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
function enhanceCanvas(img){
  const max=2400,scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  const c=document.createElement("canvas");c.width=Math.round((img.naturalWidth||img.width)*scale);c.height=Math.round((img.naturalHeight||img.height)*scale);
  const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(img,0,0,c.width,c.height);
  const d=x.getImageData(0,0,c.width,c.height),p=d.data;
  for(let i=0;i<p.length;i+=4){const y=.299*p[i]+.587*p[i+1]+.114*p[i+2];p[i]=p[i+1]=p[i+2]=Math.max(0,Math.min(255,(y-128)*1.12+128));}
  x.putImageData(d,0,0);return c;
}

/* OpenCV: find largest quadrilateral contour, then warp it to a rectangle. */
function detectDocumentCorners(img){
  const c=document.createElement("canvas");c.width=img.naturalWidth||img.width;c.height=img.naturalHeight||img.height;c.getContext("2d").drawImage(img,0,0);
  const src=cv.imread(c), gray=new cv.Mat(), blur=new cv.Mat(), edges=new cv.Mat(), contours=new cv.MatVector(), hier=new cv.Mat();
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);cv.Canny(blur,edges,60,180);cv.findContours(edges,contours,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
  let best=null,bestArea=0;
  for(let i=0;i<contours.size();i++){const cnt=contours.get(i),peri=cv.arcLength(cnt,true),approx=new cv.Mat();cv.approxPolyDP(cnt,approx,.02*peri,true);const area=Math.abs(cv.contourArea(approx));if(approx.rows===4&&area>bestArea&&area>.20*src.rows*src.cols){bestArea=area;best=approx.clone()}approx.delete();cnt.delete()}
  let pts=null;
  if(best){pts=[];for(let i=0;i<4;i++)pts.push({x:best.intAt(i,0),y:best.intAt(i,1)});}
  src.delete();gray.delete();blur.delete();edges.delete();contours.delete();hier.delete();best?.delete();return pts;
}
function perspectiveCrop(img,pts){
  pts=orderPoints(pts);const tl=pts[0],tr=pts[1],br=pts[2],bl=pts[3];
  const w=Math.round(Math.max(dist(tl,tr),dist(bl,br))),h=Math.round(Math.max(dist(tl,bl),dist(tr,br)));
  const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0);
  if(!window.cv)return img;
  const src=cv.imread(img),dst=new cv.Mat();
  const srcPts=cv.matFromArray(4,1,cv.CV_32FC2,[tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y]);
  const dstPts=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w-1,0,w-1,h-1,0,h-1]);
  const M=cv.getPerspectiveTransform(srcPts,dstPts);cv.warpPerspective(src,dst,M,new cv.Size(w,h),cv.INTER_CUBIC,cv.BORDER_REPLICATE,new cv.Scalar());
  cv.imshow(c,dst);src.delete();dst.delete();srcPts.delete();dstPts.delete();M.delete();return c;
}
function orderPoints(p){const sum=p.map(x=>x.x+x.y),diff=p.map(x=>x.x-x.y);return[p[sum.indexOf(Math.min(...sum))],p[diff.indexOf(Math.max(...diff))],p[sum.indexOf(Math.max(...sum))],p[diff.indexOf(Math.min(...diff))]]}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function safeName(s){return s.replace(/[\\/:*?"<>|]/g,"-").trim()||"scan"}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function showToast(t){const x=document.createElement("div");x.className="toast";x.textContent=t;document.body.appendChild(x);setTimeout(()=>x.remove(),1800)}
function injectModalCSS(){
 if($("#modalStyle"))return;const s=document.createElement("style");s.id="modalStyle";s.textContent=`.modal{position:fixed;inset:0;background:#000c;z-index:99;display:grid;place-items:center;padding:12px}.camera-card{background:#0c1220;color:#fff;width:min(700px,100%);border-radius:24px;overflow:hidden}.camera-head{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 18px}.camera-head button{color:#fff;font-size:22px}.camera-card video{display:block;width:100%;max-height:70vh;object-fit:contain;background:#000}.scan-hint{text-align:center;padding:12px;color:#bdc8dc;font-size:13px}.camera-actions{display:flex;align-items:center;justify-content:space-around;padding:16px}.camera-actions button{color:#fff;background:#26334b;border-radius:12px;padding:10px 15px}.camera-actions .snap{width:66px;height:66px;border-radius:50%;background:#fff;color:#1677ff;font-size:31px;border:5px solid #aac7ff}.toast{position:fixed;left:50%;bottom:100px;transform:translateX(-50%);background:#14223d;color:#fff;padding:11px 16px;border-radius:13px;z-index:120;box-shadow:0 8px 30px #0003}`;document.head.appendChild(s)}
