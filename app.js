/* Scan & Go - workflow: PHOTO -> RECADRAGE -> PDF */
const $ = s => document.querySelector(s);
const DB_NAME = "scan-go-db", STORE = "documents";
let db, currentDoc = null, currentPages = [], lastPdfBlob = null;
let cameraStream = null, cropState = null;

const settings = {
  quality: localStorage.getItem("quality") || "high",
  autoDetect: localStorage.getItem("autoDetect") !== "false"
};

document.addEventListener("DOMContentLoaded", async () => {
  $("#qualitySelect").value = settings.quality;
  $("#autoDetect").checked = settings.autoDetect;
  await openDB();
  bindUI();
  await renderRecent();
  await renderAll();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
});

function bindUI(){
  $("#startScanBtn").onclick = startPhoto;
  $("#newScanBtn").onclick = startPhoto;
  $("#importQuick").onclick = () => { currentPages=[]; currentDoc=null; $("#fileInput").click(); };
  $("#fileInput").onchange = async e => {
    const files=[...e.target.files];
    e.target.value="";
    if(files[0]) await openCropForFile(files[0]);
  };
  $("#addPageQuick").onclick = () => {
    if(currentPages.length) $("#fileInput").click();
    else startPhoto();
  };
  $("#viewPdfQuick").onclick = () => {
    if(lastPdfBlob) downloadBlob(lastPdfBlob, "scan.pdf");
    else alert("Aucun PDF récent. Scannez un document.");
  };
  $("#shareQuick").onclick = () => {
    if(lastPdfBlob) shareBlob(lastPdfBlob, "scan.pdf");
    else alert("Aucun PDF récent. Scannez un document.");
  };
  $("#viewAllBtn").onclick = () => switchView("scansView");
  $("#settingsBtn").onclick = () => switchView("settingsView");
  document.querySelectorAll(".nav-item").forEach(b => b.onclick=()=>switchView(b.dataset.view));
  $("#qualitySelect").onchange=e=>localStorage.setItem("quality",e.target.value);
  $("#autoDetect").onchange=e=>localStorage.setItem("autoDetect",e.target.checked);
  $("#clearAllBtn").onclick=async()=>{
    if(confirm("Supprimer tous les scans de cet appareil ?")){
      await clearDB(); lastPdfBlob=null; renderRecent(); renderAll();
    }
  };
}

function switchView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  window.scrollTo(0,0);
}

/* ---------- IndexedDB ---------- */
function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:"id"});
    req.onsuccess=()=>{db=req.result;resolve()};
    req.onerror=()=>reject(req.error);
  });
}
function putDoc(doc){return new Promise((res,rej)=>{
  const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).put(doc);
  tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
})}
function getDocs(){return new Promise((res,rej)=>{
  const tx=db.transaction(STORE); const r=tx.objectStore(STORE).getAll();
  r.onsuccess=()=>res(r.result.sort((a,b)=>b.created-a.created));
  r.onerror=()=>rej(r.error);
})}
function delDoc(id){return new Promise((res,rej)=>{
  const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).delete(id);
  tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
})}
function clearDB(){return new Promise((res,rej)=>{
  const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).clear();
  tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
})}

/* ---------- Home / documents ---------- */
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
    <div class="scan-info"><strong>${escapeHTML(d.name)}</strong>
    <small>${date} · ${d.pages.length} page${d.pages.length>1?"s":""}</small></div>
    <button class="more-btn" data-action="open" aria-label="Ouvrir">•••</button>
  </div>`;
}
function attachRows(){
  document.querySelectorAll(".scan-row").forEach(r=>{
    const b=r.querySelector("[data-action=open]");
    if(b) b.onclick=()=>openDoc(r.dataset.id);
  });
}
async function openDoc(id){
  const d=(await getDocs()).find(x=>x.id===id); if(!d)return;
  lastPdfBlob=await makePdf(d.pages);
  const action=prompt(`« ${d.name} »\n\n1 = télécharger PDF\n2 = partager\n3 = supprimer`,"1");
  if(action==="1")downloadBlob(lastPdfBlob,safeName(d.name)+".pdf");
  if(action==="2")shareBlob(lastPdfBlob,safeName(d.name)+".pdf");
  if(action==="3"){await delDoc(id);renderRecent();renderAll();}
}

/* ---------- PHOTO ---------- */
async function startPhoto(){
  // Always offer a very reliable native camera input as an immediate fallback.
  // On supported browsers we open our camera UI.
  if(!navigator.mediaDevices?.getUserMedia){
    $("#fileInput").click(); return;
  }
  try {
    cameraStream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},
      audio:false
    });
    showCameraModal();
  } catch(e) {
    // If permission is denied or browser/PWA blocks getUserMedia, use the OS camera.
    $("#fileInput").click();
  }
}

function showCameraModal(){
  removeModal();
  const m=document.createElement("div");
  m.className="modal";
  m.innerHTML=`<div class="camera-card">
    <div class="camera-head"><b>Prendre une photo</b><button id="closeCam">✕</button></div>
    <div class="camera-preview"><video id="camVideo" autoplay playsinline muted></video></div>
    <div class="scan-hint">Placez le document dans le cadre puis appuyez sur le bouton PHOTO.</div>
    <div class="camera-actions">
      <button id="galleryCam" class="secondary-action">🖼 Galerie</button>
      <button id="snap" class="photo-button" aria-label="Prendre la photo"><span>●</span></button>
      <button id="finishCam" class="secondary-action">Annuler</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  injectModalCSS();

  const video=$("#camVideo");
  video.srcObject=cameraStream;
  video.play().catch(()=>{});

  $("#closeCam").onclick=()=>{stopCamera();removeModal()};
  $("#galleryCam").onclick=()=>{stopCamera();removeModal();$("#fileInput").click()};
  $("#snap").onclick=async()=>{
    if(!video.videoWidth){showToast("La caméra n'est pas encore prête");return}
    const c=document.createElement("canvas");
    c.width=video.videoWidth;c.height=video.videoHeight;
    c.getContext("2d").drawImage(video,0,0,c.width,c.height);
    const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.95));
    stopCamera();removeModal();
    await openCropForBlob(blob);
  };
  $("#finishCam").onclick=()=>{stopCamera();removeModal()};
}
function stopCamera(){
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}
}
function removeModal(){document.querySelectorAll(".modal").forEach(x=>x.remove())}

/* ---------- CROP ---------- */
async function openCropForFile(file){
  if(!file.type.startsWith("image/"))return;
  await openCropForBlob(file);
}
async function openCropForBlob(blob){
  const img=await blobToImage(blob);
  showCropModal(img);
}

function showCropModal(img){
  removeModal();
  const max=1800;
  const scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  const w=Math.round((img.naturalWidth||img.width)*scale), h=Math.round((img.naturalHeight||img.height)*scale);

  const c=document.createElement("canvas");c.width=w;c.height=h;
  c.getContext("2d").drawImage(img,0,0,w,h);

  cropState={canvas:c,w,h,points:null,dragIndex:-1};
  if(settings.autoDetect && window.cv) {
    try { cropState.points=detectDocumentCornersFromCanvas(c); } catch(e) {}
  }
  if(!cropState.points) cropState.points=[
    {x:w*.05,y:h*.05},{x:w*.95,y:h*.05},
    {x:w*.95,y:h*.95},{x:w*.05,y:h*.95}
  ];
  renderCropModal();
}

function renderCropModal(){
  const m=document.createElement("div");m.className="modal";
  m.innerHTML=`<div class="crop-card">
    <div class="crop-head"><div><b>Recadrer le document</b><small>Déplacez les 4 coins si nécessaire</small></div><button id="cancelCrop">✕</button></div>
    <div class="crop-stage"><canvas id="cropCanvas"></canvas></div>
    <div class="crop-tools">
      <button id="autoCropBtn" class="secondary-action">🔎 Détecter les coins</button>
      <button id="fullCropBtn" class="secondary-action">↔ Pleine image</button>
    </div>
    <div class="crop-actions">
      <button id="cancelCrop2" class="secondary-action">Annuler</button>
      <button id="usePageBtn" class="primary-action">✓ Utiliser cette page</button>
    </div>
  </div>`;
  document.body.appendChild(m);injectModalCSS();
  drawCrop();

  $("#cancelCrop").onclick=removeModal;
  $("#cancelCrop2").onclick=removeModal;
  $("#autoCropBtn").onclick=()=>{
    if(window.cv){const p=detectDocumentCornersFromCanvas(cropState.canvas);if(p)cropState.points=p;else showToast("Coins non détectés");drawCrop()}
    else showToast("Détection automatique indisponible");
  };
  $("#fullCropBtn").onclick=()=>{
    const {w,h}=cropState;cropState.points=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];drawCrop();
  };
  $("#usePageBtn").onclick=useCroppedPage;

  const canvas=$("#cropCanvas");
  const pos=e=>{
    const r=canvas.getBoundingClientRect(), sx=cropState.w/r.width, sy=cropState.h/r.height;
    const p=e.touches?.[0]||e; return {x:(p.clientX-r.left)*sx,y:(p.clientY-r.top)*sy};
  };
  const down=e=>{
    e.preventDefault();const p=pos(e);
    let best=-1,bd=Infinity;
    cropState.points.forEach((q,i)=>{const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<bd){bd=d;best=i}});
    if(bd<70)cropState.dragIndex=best;
  };
  const move=e=>{
    if(cropState.dragIndex<0)return;e.preventDefault();
    const p=pos(e);p.x=Math.max(0,Math.min(cropState.w,p.x));p.y=Math.max(0,Math.min(cropState.h,p.y));
    cropState.points[cropState.dragIndex]=p;drawCrop();
  };
  const up=()=>cropState.dragIndex=-1;
  canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);
  window.addEventListener("pointerup",up,{once:true});
}

function drawCrop(){
  const out=$("#cropCanvas"); if(!out)return;
  const maxW=Math.min(cropState.w,Math.max(280,window.innerWidth-36));
  const scale=maxW/cropState.w;out.width=Math.round(cropState.w*scale);out.height=Math.round(cropState.h*scale);
  out.style.width=out.width+"px";out.style.height=out.height+"px";
  const x=out.getContext("2d");x.drawImage(cropState.canvas,0,0,out.width,out.height);
  const p=cropState.points.map(q=>({x:q.x*scale,y:q.y*scale}));
  x.fillStyle="rgba(0,0,0,.42)";
  x.beginPath();x.rect(0,0,out.width,out.height);x.moveTo(p[0].x,p[0].y);x.lineTo(p[1].x,p[1].y);x.lineTo(p[2].x,p[2].y);x.lineTo(p[3].x,p[3].y);x.closePath();x.fill("evenodd");
  x.strokeStyle="#20e0d0";x.lineWidth=3;x.beginPath();x.moveTo(p[0].x,p[0].y);p.slice(1).forEach(q=>x.lineTo(q.x,q.y));x.closePath();x.stroke();
  p.forEach(q=>{x.fillStyle="#fff";x.beginPath();x.arc(q.x,q.y,11,0,Math.PI*2);x.fill();x.strokeStyle="#1677ff";x.lineWidth=3;x.stroke()});
}

async function useCroppedPage(){
  const p=cropState.points, src=cropState.canvas;
  const ordered=orderPoints(p);
  const tl=ordered[0],tr=ordered[1],br=ordered[2],bl=ordered[3];
  const outW=Math.max(600,Math.round(Math.max(dist(tl,tr),dist(bl,br))));
  const outH=Math.max(800,Math.round(Math.max(dist(tl,bl),dist(tr,br))));
  const out=document.createElement("canvas");out.width=outW;out.height=outH;
  const ctx=out.getContext("2d");

  if(window.cv){
    try{
      const mat=cv.imread(src), dst=new cv.Mat();
      const sp=cv.matFromArray(4,1,cv.CV_32FC2,[tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y]);
      const dp=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,outW-1,0,outW-1,outH-1,0,outH-1]);
      const M=cv.getPerspectiveTransform(sp,dp);
      cv.warpPerspective(mat,dst,M,new cv.Size(outW,outH),cv.INTER_CUBIC,cv.BORDER_REPLICATE,new cv.Scalar());
      cv.imshow(out,dst);
      mat.delete();dst.delete();sp.delete();dp.delete();M.delete();
    }catch(e){drawFallbackPerspective(out,src,ordered)}
  }else drawFallbackPerspective(out,src,ordered);

  const quality=settings.quality==="small"?.72:settings.quality==="medium"?.84:.93;
  const data=enhanceCanvas(out).toDataURL("image/jpeg",quality);
  currentPages.push({data});
  removeModal();
  showAfterPageActions();
}

function drawFallbackPerspective(out,src,p){
  // This branch is only used if OpenCV is unavailable. It uses an axis-aligned crop
  // rather than pretending to correct perspective.
  const xs=p.map(q=>q.x),ys=p.map(q=>q.y);
  const x=Math.max(0,Math.min(...xs)),y=Math.max(0,Math.min(...ys));
  const w=Math.min(src.width-x,Math.max(1,Math.max(...xs)-x));
  const h=Math.min(src.height-y,Math.max(1,Math.max(...ys)-y));
  out.getContext("2d").drawImage(src,x,y,w,h,0,0,out.width,out.height);
}

function showAfterPageActions(){
  const m=document.createElement("div");m.className="modal";
  m.innerHTML=`<div class="after-page-card">
    <div class="success-icon">✓</div><h2>Page ajoutée</h2>
    <p>${currentPages.length} page${currentPages.length>1?"s":""} dans le document</p>
    <button id="addAnother" class="primary-action wide">＋ Ajouter une autre page</button>
    <button id="createPdf" class="primary-action wide">📄 Créer le PDF</button>
    <button id="discardPage" class="secondary-action wide">Annuler cette page</button>
  </div>`;
  document.body.appendChild(m);injectModalCSS();
  $("#addAnother").onclick=()=>{removeModal();$("#fileInput").click()};
  $("#createPdf").onclick=()=>{removeModal();finalizeDocument()};
  $("#discardPage").onclick=()=>{currentPages.pop();removeModal();if(currentPages.length)showAfterPageActions()};
}

async function finalizeDocument(){
  if(!currentPages.length)return;
  const name=prompt("Nom du document :",currentDoc?.name||"Mon scan")||"Mon scan";
  const doc={id:currentDoc?.id||crypto.randomUUID(),created:currentDoc?.created||Date.now(),name,pages:currentPages};
  await putDoc(doc);currentDoc=doc;lastPdfBlob=await makePdf(currentPages);
  await renderRecent();await renderAll();
  const choice=confirm("PDF créé.\n\nVoulez-vous le partager maintenant ?");
  if(choice) await shareBlob(lastPdfBlob,safeName(name)+".pdf");
  currentPages=[];currentDoc=null;
}

/* ---------- PDF / share ---------- */
async function makePdf(pages){
  const pdf=await PDFLib.PDFDocument.create();
  for(const p of pages){
    const jpg=await pdf.embedJpg(dataURLToBytes(p.data));
    const maxW=595.28,maxH=841.89;
    const ratio=jpg.width/jpg.height;
    let w=maxW,h=w/ratio;
    if(h>maxH){h=maxH;w=h*ratio}
    const page=pdf.addPage([maxW,maxH]);
    page.drawImage(jpg,{x:(maxW-w)/2,y:(maxH-h)/2,width:w,height:h});
  }
  return new Blob([await pdf.save()],{type:"application/pdf"});
}
async function shareBlob(blob,name){
  const file=new File([blob],name,{type:"application/pdf"});
  if(navigator.share && navigator.canShare?.({files:[file]})){
    try{await navigator.share({title:name,text:"Document scanné",files:[file]});return}
    catch(e){if(e.name==="AbortError")return}
  }
  downloadBlob(blob,name);
}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

/* ---------- image processing ---------- */
function blobToImage(blob){return new Promise((res,rej)=>{
  const u=URL.createObjectURL(blob),i=new Image();
  i.onload=()=>{URL.revokeObjectURL(u);res(i)};i.onerror=rej;i.src=u;
})}
function dataURLToBytes(data){
  const b=atob(data.split(",")[1]),a=new Uint8Array(b.length);
  for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;
}
function enhanceCanvas(img){
  const c=document.createElement("canvas");c.width=img.width;c.height=img.height;
  const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(img,0,0);
  const d=x.getImageData(0,0,c.width,c.height),p=d.data;
  for(let i=0;i<p.length;i+=4){
    const y=.299*p[i]+.587*p[i+1]+.114*p[i+2];
    p[i]=p[i+1]=p[i+2]=Math.max(0,Math.min(255,(y-128)*1.10+128));
  }
  x.putImageData(d,0,0);return c;
}
function detectDocumentCornersFromCanvas(canvas){
  if(!window.cv)return null;
  const src=cv.imread(canvas),gray=new cv.Mat(),blur=new cv.Mat(),edges=new cv.Mat();
  const contours=new cv.MatVector(),hier=new cv.Mat();
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
  cv.Canny(blur,60,180,edges);
  cv.findContours(edges,contours,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
  let best=null,bestArea=0;
  for(let i=0;i<contours.size();i++){
    const cnt=contours.get(i), peri=cv.arcLength(cnt,true), approx=new cv.Mat();
    cv.approxPolyDP(cnt,approx,.02*peri,true);
    const area=Math.abs(cv.contourArea(approx));
    if(approx.rows===4 && area>bestArea && area>.18*src.rows*src.cols){bestArea=area;best=approx.clone()}
    approx.delete();cnt.delete();
  }
  let pts=null;
  if(best){pts=[];for(let i=0;i<4;i++)pts.push({x:best.intAt(i,0),y:best.intAt(i,1)})}
  src.delete();gray.delete();blur.delete();edges.delete();contours.delete();hier.delete();best?.delete();
  return pts;
}
function orderPoints(p){
  const sum=p.map(x=>x.x+x.y),diff=p.map(x=>x.x-x.y);
  return [
    p[sum.indexOf(Math.min(...sum))],
    p[diff.indexOf(Math.max(...diff))],
    p[sum.indexOf(Math.max(...sum))],
    p[diff.indexOf(Math.min(...diff))]
  ];
}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function safeName(s){return String(s).replace(/[\\/:*?"<>|]/g,"-").trim()||"scan"}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function showToast(t){const x=document.createElement("div");x.className="toast";x.textContent=t;document.body.appendChild(x);setTimeout(()=>x.remove(),1800)}

function injectModalCSS(){
 if($("#modalStyle"))return;
 const s=document.createElement("style");s.id="modalStyle";
 s.textContent=`
 .modal{position:fixed;inset:0;background:rgba(5,12,25,.86);z-index:99;display:grid;place-items:center;padding:12px}
 .camera-card,.crop-card,.after-page-card{background:#0c1220;color:#fff;width:min(760px,100%);border-radius:24px;overflow:hidden;box-shadow:0 20px 60px #0008}
 .camera-head,.crop-head{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 18px}
 .camera-head button,.crop-head button{color:#fff;font-size:22px}
 .camera-preview{background:#000;display:flex;justify-content:center;min-height:300px}
 .camera-card video{display:block;width:100%;max-height:65vh;object-fit:contain}
 .scan-hint{text-align:center;padding:13px 18px;color:#bdc8dc;font-size:14px}
 .camera-actions,.crop-actions{display:flex;align-items:center;justify-content:space-around;padding:16px;gap:12px}
 .photo-button{width:78px;height:78px;border-radius:50%;background:#fff;color:#1677ff;font-size:40px;border:6px solid #8ebcff;box-shadow:0 0 0 3px #fff2}
 .photo-button span{font-size:35px}
 .secondary-action,.primary-action{border-radius:12px;padding:12px 16px;font-weight:700}
 .secondary-action{color:#fff;background:#26334b}
 .primary-action{background:#1677ff;color:#fff}
 .wide{width:100%;margin:7px 0}
 .crop-card{padding-bottom:12px}
 .crop-head small{display:block;color:#9baac5;font-size:12px;margin-top:4px}
 .crop-stage{display:flex;justify-content:center;align-items:center;background:#070b13;min-height:300px;padding:12px;overflow:hidden}
 #cropCanvas{touch-action:none;max-width:100%;height:auto;display:block}
 .crop-tools{display:flex;gap:8px;padding:12px 16px 0;flex-wrap:wrap}
 .crop-tools .secondary-action{font-size:13px}
 .success-icon{width:70px;height:70px;border-radius:50%;background:#19b987;color:white;display:grid;place-items:center;font-size:38px;margin:30px auto 10px}
 .after-page-card{padding:0 20px 24px;text-align:center}
 .after-page-card h2{margin:5px 0}
 .after-page-card p{color:#aab6ca;margin-top:0}
 .toast{position:fixed;left:50%;bottom:100px;transform:translateX(-50%);background:#14223d;color:#fff;padding:11px 16px;border-radius:13px;z-index:120;box-shadow:0 8px 30px #0003}
 `;
 document.head.appendChild(s);
}
