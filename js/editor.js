import{image,canvas,process,jpeg}from'./image.js';
import{detect,warp,order}from'./detect.js';

export async function prepare(blob){
  if(!blob) throw new Error('capture-empty');
  const img=await image(blob),src=canvas(img,1800);
  const p=[{x:src.width*.025,y:src.height*.025},{x:src.width*.975,y:src.height*.025},{x:src.width*.975,y:src.height*.975},{x:src.width*.025,y:src.height*.975}];
  return{src,p,detected:false};
}
export async function autodetect(e){const p=await detect(e.src);if(p){e.p=p;e.detected=true;}return!!p;}
export function full(e){e.p=[{x:0,y:0},{x:e.src.width,y:0},{x:e.src.width,y:e.src.height},{x:0,y:e.src.height}];e.detected=false;}
export function render(canvasEl,e){
  const r=canvasEl.parentElement.getBoundingClientRect(),scale=Math.min(r.width/e.src.width,r.height/e.src.height),w=Math.max(1,Math.round(e.src.width*scale)),h=Math.max(1,Math.round(e.src.height*scale));
  canvasEl.width=w;canvasEl.height=h;const x=canvasEl.getContext('2d');x.drawImage(e.src,0,0,w,h);
  const p=e.p.map(q=>({x:q.x*scale,y:q.y*scale}));
  x.fillStyle='rgba(0,0,0,.48)';x.beginPath();x.rect(0,0,w,h);x.moveTo(p[0].x,p[0].y);p.slice(1).forEach(q=>x.lineTo(q.x,q.y));x.closePath();x.fill('evenodd');
  x.strokeStyle='#20e0d0';x.lineWidth=4;x.beginPath();x.moveTo(p[0].x,p[0].y);p.slice(1).forEach(q=>x.lineTo(q.x,q.y));x.closePath();x.stroke();
  p.forEach(q=>{x.fillStyle='#fff';x.beginPath();x.arc(q.x,q.y,11,0,Math.PI*2);x.fill();x.strokeStyle='#1677ff';x.lineWidth=3;x.stroke()});
}
export function hit(e,el,ed){const r=el.getBoundingClientRect(),sx=ed.src.width/r.width,sy=ed.src.height/r.height,t=e.touches?.[0]||e,p={x:(t.clientX-r.left)*sx,y:(t.clientY-r.top)*sy};let i=-1,b=Infinity;ed.p.forEach((q,j)=>{const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<b){b=d;i=j}});return b<85?i:-1}
export function move(e,el,ed,i){if(i<0)return;const r=el.getBoundingClientRect(),sx=ed.src.width/r.width,sy=ed.src.height/r.height,t=e.touches?.[0]||e;ed.p[i]={x:Math.max(0,Math.min(ed.src.width,(t.clientX-r.left)*sx)),y:Math.max(0,Math.min(ed.src.height,(t.clientY-r.top)*sy))}}
export function exportPage(ed,q,mode){return jpeg(process(warp(ed.src,order(ed.p)),mode),q)}
