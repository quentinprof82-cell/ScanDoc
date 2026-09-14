import{open as openCam,stop,photo}from'./camera.js';
import{prepare,render,hit,move,autodetect,full,exportPage}from'./editor.js';

let modal,video,editor,drag=-1;
const $=s=>document.querySelector(s);
export function close(){stop();modal?.remove();modal=null;editor=null;drag=-1}

export async function takePhoto(onPage){
  try{
    const stream=await openCam();
    modal=document.createElement('div');modal.className='modal';
    modal.innerHTML='<section class="capture-screen"><div class="capture-top"><b>Prendre une photo</b><button class="capture-close">✕</button></div><div class="capture-stage"><video autoplay playsinline muted></video></div><div class="capture-guide"><span>Placez tout le document dans le cadre</span></div><div class="capture-help">Une bonne lumière et un fond contrasté améliorent la détection.</div><div class="capture-bottom"><button class="capture-side" id="gal">🖼 Galerie</button><button class="photo-button" id="shot"><i></i></button><button class="capture-side" id="cancel">Annuler</button></div></section>';
    document.body.appendChild(modal);video=modal.querySelector('video');video.srcObject=stream;await video.play();
    modal.querySelector('#shot').onclick=async()=>{try{const b=await photo(video);stop();modal.remove();modal=null;await showCrop(b,onPage)}catch(e){alert('Impossible de prendre la photo.');}};
    modal.querySelectorAll('#cancel,.capture-close').forEach(b=>b.onclick=close);
    modal.querySelector('#gal').onclick=()=>{stop();close();$('#fileInput').click()};
  }catch(e){$('#fileInput').click()}
}

async function showCrop(blob,onPage){
  try{ editor=await prepare(blob); }catch(e){ console.error(e); alert('La photo a bien été prise, mais son traitement a échoué. Réessayez avec une photo moins lourde ou importez l’image depuis la galerie.'); return; }
  modal=document.createElement('div');modal.className='modal';
  modal.innerHTML='<section class="crop-screen"><div class="capture-top"><div><b>Recadrer le document</b><small id="detectStatus">Détection automatique…</small></div><button class="capture-close">✕</button></div><div class="crop-stage"><canvas class="crop-canvas"></canvas></div><div class="crop-toolbar"><button id="auto">🔎 Détecter les coins</button><button id="full">↔ Toute l’image</button></div><div class="crop-actions"><button class="crop-cancel" id="cc">Annuler</button><button class="crop-confirm" id="use">✓ Utiliser cette page</button></div></section>';
  document.body.appendChild(modal);
  const cv=modal.querySelector('canvas'),status=modal.querySelector('#detectStatus'),draw=()=>render(cv,editor);requestAnimationFrame(draw);
  status.textContent=editor.detected?'✓ Coins détectés automatiquement':'Coins à placer manuellement';status.className=editor.detected?'ok':'';
  modal.querySelector('#auto').onclick=async()=>{status.textContent='Détection en cours…';const ok=await autodetect(editor);status.textContent=ok?'✓ Coins détectés automatiquement':'⚠️ Coins non trouvés — placez-les manuellement';status.className=ok?'ok':'warn';draw()};
  modal.querySelector('#full').onclick=()=>{full(editor);status.textContent='Image entière sélectionnée';status.className='warn';draw()};
  modal.querySelector('#cc').onclick=close;modal.querySelector('.capture-close').onclick=close;
  modal.querySelector('#use').onclick=()=>{const q=localStorage.getItem('quality')||'high',mode=localStorage.getItem('mode')||'document';onPage({data:exportPage(editor,q==='small'?.82:q==='medium'?.9:.96,mode)});close()};
  const down=e=>{if(e.type==='pointerdown'){drag=hit(e,cv,editor);if(drag>=0)cv.setPointerCapture?.(e.pointerId)}else if(e.type==='pointermove'&&drag>=0){e.preventDefault();move(e,cv,editor,drag);draw()}else if(e.type==='pointerup'||e.type==='pointercancel'){drag=-1}};
  ['pointerdown','pointermove','pointerup','pointercancel'].forEach(t=>cv.addEventListener(t,down,{passive:false}));
}
export async function openCrop(blob,onPage){await showCrop(blob,onPage)}

export function actionSheet(doc,{onPdf,onShare,onDelete,onAdd}){
  const m=document.createElement('div');m.className='action-modal';m.innerHTML=`<div class="action-card"><div class="action-head"><div><strong>${escapeHtml(doc.name)}</strong><small>${doc.pages.length} page${doc.pages.length>1?'s':''}</small></div><button class="action-close">✕</button></div><div class="action-buttons"><button data-a="add">＋ Ajouter une page</button><button data-a="pdf">📄 Créer / télécharger le PDF</button><button data-a="share">📤 Partager</button><button data-a="delete" class="danger">🗑 Supprimer</button></div></div>`;
  document.body.appendChild(m);const done=()=>m.remove();m.onclick=e=>{if(e.target===m)done()};m.querySelector('.action-close').onclick=done;
  m.querySelector('[data-a="add"]').onclick=()=>{done();onAdd?.()};m.querySelector('[data-a="pdf"]').onclick=()=>{done();onPdf?.()};m.querySelector('[data-a="share"]').onclick=()=>{done();onShare?.()};m.querySelector('[data-a="delete"]').onclick=()=>{done();onDelete?.()};
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
