import{all,put,del,clear}from'./storage.js';
import{makePdf,download,share}from'./pdf.js';
import{takePhoto,openCrop,actionSheet}from'./ui.js';

const $=s=>document.querySelector(s);let pages=[],lastPdf=null;
document.addEventListener('DOMContentLoaded',async()=>{bind();load();await refresh()});
function bind(){
  ['#startScanBtn','#newScan','#newScan2'].forEach(s=>$(s).onclick=()=>newScan());
  $('#importBtn').onclick=()=>{$('#fileInput').click()};
  $('#fileInput').onchange=e=>{const f=e.target.files?.[0];e.target.value='';if(f){pages=[];openCrop(f,addPage)}};
  $('#lastPdf').onclick=()=>lastPdf?download(lastPdf,'scan.pdf'):alert('Aucun PDF récent.');
  $('#shareLast').onclick=()=>lastPdf?share(lastPdf,'scan.pdf'):alert('Aucun scan récent.');
  $('#allScans').onclick=()=>view('scansView');$('#settingsBtn').onclick=()=>view('settingsView');
  document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>view(b.dataset.view));
  $('#quality').onchange=e=>localStorage.setItem('quality',e.target.value);$('#mode').onchange=e=>localStorage.setItem('mode',e.target.value);
  $('#autoDetect').onchange=e=>localStorage.setItem('autoDetect',e.target.checked);
  $('#clearAll').onclick=async()=>{if(confirm('Supprimer tous les scans ?')){await clear();lastPdf=null;await refresh()}};
}
function load(){$('#quality').value=localStorage.getItem('quality')||'high';$('#mode').value=localStorage.getItem('mode')||'document';$('#autoDetect').checked=localStorage.getItem('autoDetect')!=='false'}
function view(id){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===id))}
function newScan(){pages=[];takePhoto(addPage)}
async function addPage(p){pages.push(p);showPageChoice()}
function showPageChoice(){
  const m=document.createElement('div');m.className='action-modal';m.innerHTML=`<div class="action-card"><div class="page-added"><div class="success-icon">✓</div><strong>Page ${pages.length} ajoutée</strong><small>Que voulez-vous faire ?</small></div><div class="action-buttons"><button data-a="add">＋ Ajouter une autre page</button><button data-a="finish" class="primary">✓ Terminer et créer le PDF</button><button data-a="cancel">Annuler le document</button></div></div>`;
  document.body.appendChild(m);m.onclick=e=>{if(e.target===m)m.remove()};
  m.querySelector('[data-a="add"]').onclick=()=>{m.remove();takePhoto(addPage)};
  m.querySelector('[data-a="finish"]').onclick=()=>{m.remove();finish()};
  m.querySelector('[data-a="cancel"]').onclick=()=>{m.remove();pages=[]};
}
async function finish(){
  if(!pages.length)return;
  const name=prompt('Nom du document :','Mon scan')||'Mon scan';
  const doc={id:crypto.randomUUID(),created:Date.now(),name,pages:[...pages]};
  await put(doc);lastPdf=await makePdf(pages);pages=[];await refresh();
  offerPdf(doc);
}
function offerPdf(doc){
  const m=document.createElement('div');m.className='action-modal';m.innerHTML=`<div class="action-card"><div class="page-added"><div class="success-icon">✓</div><strong>PDF prêt</strong><small>${esc(doc.name)} · ${doc.pages.length} page${doc.pages.length>1?'s':''}</small></div><div class="action-buttons"><button data-a="pdf" class="primary">📄 Télécharger le PDF</button><button data-a="share">📤 Partager le PDF</button><button data-a="close">Fermer</button></div></div>`;document.body.appendChild(m);m.querySelector('[data-a="pdf"]').onclick=()=>download(lastPdf,doc.name+'.pdf');m.querySelector('[data-a="share"]').onclick=()=>share(lastPdf,doc.name+'.pdf');m.querySelector('[data-a="close"]').onclick=()=>m.remove()}
async function refresh(){const docs=await all();render(docs.slice(0,5),$('#recentList'),$('#emptyRecent'));render(docs,$('#allScansList'),$('#emptyAll'))}
function render(docs,box,empty){
  box.innerHTML=docs.map(d=>`<button class="scan-row" data-id="${d.id}"><img class="thumb" src="${d.pages[0]?.data||''}"><span class="scan-info"><strong>${esc(d.name)}</strong><small>${new Date(d.created).toLocaleDateString('fr-FR')} · ${d.pages.length} page${d.pages.length>1?'s':''}</small></span><span class="more-btn">›</span></button>`).join('');
  empty.style.display=docs.length?'none':'block';box.querySelectorAll('.scan-row').forEach(b=>b.onclick=async()=>openDoc(b.dataset.id));
}
async function openDoc(id){
  const doc=(await all()).find(x=>x.id===id);if(!doc)return;
  actionSheet(doc,{
    onPdf:async()=>download(await makePdf(doc.pages),doc.name+'.pdf'),
    onShare:async()=>share(await makePdf(doc.pages),doc.name+'.pdf'),
    onDelete:async()=>{if(confirm(`Supprimer « ${doc.name} » ?`)){await del(doc.id);await refresh()}},
    onAdd:()=>{pages=[...doc.pages];takePhoto(async p=>{pages.push(p);const updated={...doc,pages:[...pages]};await put(updated);pages=[];await refresh()})}
  });
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
