let cvPromise;

function getCv(timeout=15000){
  if(window.cv?.Mat && window.cv?.findContours && window.cv?.Canny) return Promise.resolve(window.cv);
  if(!cvPromise){
    cvPromise=new Promise(resolve=>{
      const start=Date.now();
      const timer=setInterval(()=>{
        if(window.cv?.Mat && window.cv?.findContours && window.cv?.Canny){clearInterval(timer);resolve(window.cv);}
        else if(Date.now()-start>timeout){clearInterval(timer);resolve(null);}
      },100);
    });
  }
  return cvPromise;
}

export function order(points){
  const pts=(points||[]).map(p=>({x:Number(p.x),y:Number(p.y)}));
  if(pts.length!==4 || pts.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) return pts;
  const cx=pts.reduce((s,p)=>s+p.x,0)/4, cy=pts.reduce((s,p)=>s+p.y,0)/4;
  pts.sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx));
  let start=0;
  for(let i=1;i<4;i++) if(pts[i].x+pts[i].y<pts[start].x+pts[start].y) start=i;
  const q=[pts[start],pts[(start+1)%4],pts[(start+2)%4],pts[(start+3)%4]];
  // Ensure clockwise TL,TR,BR,BL.
  if(q[1].x<q[3].x) [q[1],q[3]]=[q[3],q[1]];
  return q;
}
function d(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function area(p){let s=0;for(let i=0;i<4;i++){const a=p[i],b=p[(i+1)%4];s+=a.x*b.y-b.x*a.y}return Math.abs(s)/2}
function angle(a,b,c){const ab={x:a.x-b.x,y:a.y-b.y},cb={x:c.x-b.x,y:c.y-b.y};const den=Math.hypot(ab.x,ab.y)*Math.hypot(cb.x,cb.y)||1;return Math.acos(Math.max(-1,Math.min(1,(ab.x*cb.x+ab.y*cb.y)/den)))*180/Math.PI}
function valid(p,w,h){
  if(!p||p.length!==4)return false;
  const q=order(p), a=area(q)/(w*h); if(a<.12)return false;
  const s=[d(q[0],q[1]),d(q[1],q[2]),d(q[2],q[3]),d(q[3],q[0])];
  if(Math.min(...s)<Math.min(w,h)*.20)return false;
  const ang=[angle(q[3],q[0],q[1]),angle(q[0],q[1],q[2]),angle(q[1],q[2],q[3]),angle(q[2],q[3],q[0])];
  const err=ang.reduce((z,v)=>z+Math.abs(90-v),0)/4;
  return err<55;
}
function score(p,w,h){
  const q=order(p), a=area(q)/(w*h), s=[d(q[0],q[1]),d(q[1],q[2]),d(q[2],q[3]),d(q[3],q[0])];
  const ang=[angle(q[3],q[0],q[1]),angle(q[0],q[1],q[2]),angle(q[1],q[2],q[3]),angle(q[2],q[3],q[0])];
  const err=ang.reduce((z,v)=>z+Math.abs(90-v),0)/4;
  return a*12 + Math.max(0,1-err/70)*3 + Math.min(...s)/Math.max(...s);
}
function contourQuads(cv,bin,out,w,h){
  const contours=new cv.MatVector(),hier=new cv.Mat();
  try{
    cv.findContours(bin,contours,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    for(let i=0;i<contours.size();i++){
      const c=contours.get(i);
      try{
        const a=Math.abs(cv.contourArea(c));
        if(a<.10*w*h) continue;
        const peri=cv.arcLength(c,true), approx=new cv.Mat();
        try{
          cv.approxPolyDP(c,approx,Math.max(1,0.018*peri),true);
          if(approx.rows===4){
            const p=[]; for(let j=0;j<4;j++){p.push({x:approx.intAt(j,0),y:approx.intAt(j,1)});}
            if(valid(p,w,h)) out.push(order(p));
          }
        }finally{approx.delete()}
      }finally{c.delete()}
    }
  }finally{contours.delete();hier.delete()}
}
function lineCandidates(cv,edges,w,h){
  const lines=new cv.Mat(),out=[];
  try{
    cv.HoughLinesP(edges,lines,1,Math.PI/180,Math.max(30,Math.round(Math.min(w,h)*.10)),Math.max(25,Math.min(w,h)*.16),18);
    for(let i=0;i<lines.rows;i++){
      const a=lines.data32S.subarray(i*4,i*4+4), len=Math.hypot(a[2]-a[0],a[3]-a[1]);
      if(len<Math.min(w,h)*.18)continue;
      const ang=Math.abs(Math.atan2(a[3]-a[1],a[2]-a[0])*180/Math.PI)%180;
      const deg=ang>90?180-ang:ang;
      if(deg<25||deg>65) out.push({x1:a[0],y1:a[1],x2:a[2],y2:a[3],len,deg});
    }
  }finally{lines.delete()}
  const hs=out.filter(x=>x.deg<25).sort((a,b)=>b.len-a.len).slice(0,10);
  const vs=out.filter(x=>x.deg>65).sort((a,b)=>b.len-a.len).slice(0,10);
  const intersect=(a,b)=>{const den=(a.x1-a.x2)*(b.y1-b.y2)-(a.y1-a.y2)*(b.x1-b.x2);if(Math.abs(den)<1e-7)return null;return{x:((a.x1*a.y2-a.y1*a.x2)*(b.x1-b.x2)-(a.x1-a.x2)*(b.x1*b.y2-b.y1*b.x2))/den,y:((a.x1*a.y2-a.y1*a.x2)*(b.y1-b.y2)-(a.y1-a.y2)*(b.x1*b.y2-b.y1*b.x2))/den}};
  const candidates=[];
  for(let i=0;i<hs.length;i++)for(let j=i+1;j<hs.length;j++){
    const y1=(hs[i].y1+hs[i].y2)/2,y2=(hs[j].y1+hs[j].y2)/2;if(Math.abs(y1-y2)<h*.20)continue;
    for(let k=0;k<vs.length;k++)for(let m=k+1;m<vs.length;m++){
      const x1=(vs[k].x1+vs[k].x2)/2,x2=(vs[m].x1+vs[m].x2)/2;if(Math.abs(x1-x2)<w*.20)continue;
      const q=[intersect(hs[i],vs[k]),intersect(hs[i],vs[m]),intersect(hs[j],vs[m]),intersect(hs[j],vs[k])];
      if(q.every(p=>p&&p.x>-w*.10&&p.x<w*1.10&&p.y>-h*.10&&p.y<h*1.10)&&valid(q,w,h))candidates.push(order(q));
    }
  }
  return candidates;
}

export async function detect(canvas){
  const cv=await getCv();
  if(!cv||!canvas?.width||!canvas?.height)return null;
  let src=null,small=null,gray=null,blur=null,edges=null,bin=null,kernel=null;
  try{
    src=cv.imread(canvas);
    // Keep the detector deliberately small: this prevents iPhone Safari memory crashes.
    const scale=Math.min(1,1200/Math.max(src.cols,src.rows));
    small=new cv.Mat();
    if(scale<1) cv.resize(src,small,new cv.Size(Math.max(1,Math.round(src.cols*scale)),Math.max(1,Math.round(src.rows*scale))),0,0,cv.INTER_AREA);
    else src.copyTo(small);
    gray=new cv.Mat();blur=new cv.Mat();edges=new cv.Mat();bin=new cv.Mat();
    cv.cvtColor(small,gray,cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
    const candidates=[];

    // 1) Strong document borders.
    cv.Canny(blur,edges,30,100);
    kernel=cv.Mat.ones(3,3,cv.CV_8U);cv.dilate(edges,edges,kernel,new cv.Point(-1,-1),1);kernel.delete();kernel=null;
    candidates.push(...lineCandidates(cv,edges,small.cols,small.rows));
    contourQuads(cv,edges,candidates,small.cols,small.rows);

    // 2) Otsu. Reuse matrices to keep memory low.
    cv.threshold(blur,bin,0,255,cv.THRESH_BINARY+cv.THRESH_OTSU);
    kernel=cv.Mat.ones(7,7,cv.CV_8U);cv.morphologyEx(bin,bin,cv.MORPH_CLOSE,kernel);kernel.delete();kernel=null;
    contourQuads(cv,bin,candidates,small.cols,small.rows);

    // 3) Adaptive threshold for shadows / uneven light.
    cv.adaptiveThreshold(blur,bin,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY,31,7);
    contourQuads(cv,bin,candidates,small.cols,small.rows);

    let best=null,bestScore=-Infinity;
    for(const q of candidates){const s=score(q,small.cols,small.rows);if(s>bestScore){bestScore=s;best=q}}
    if(!best)return null;
    const inv=1/scale;
    return best.map(p=>({x:Math.max(0,Math.min(src.cols-1,p.x*inv)),y:Math.max(0,Math.min(src.rows-1,p.y*inv))}));
  }catch(err){console.warn('Document detection failed:',err);return null}
  finally{kernel?.delete?.();[src,small,gray,blur,edges,bin].forEach(x=>x?.delete?.())}
}

export function warp(canvas,p){
  p=order(p);const [tl,tr,br,bl]=p;
  const rawW=Math.max(d(tl,tr),d(bl,br)),rawH=Math.max(d(tl,bl),d(tr,br));
  const ratio=Math.max(.2,Math.min(5,rawW/rawH));
  let w=Math.max(900,Math.round(rawW)),h=Math.max(1200,Math.round(rawH));
  const maxPixels=9000000, pixels=w*h;
  if(pixels>maxPixels){const s=Math.sqrt(maxPixels/pixels);w=Math.max(900,Math.round(w*s));h=Math.max(1200,Math.round(h*s));}
  const out=document.createElement('canvas');out.width=w;out.height=h;
  const cv=window.cv;
  if(!cv?.Mat){out.getContext('2d').drawImage(canvas,tl.x,tl.y,rawW,rawH,0,0,w,h);return out;}
  let src=null,dst=null,sp=null,dp=null,m=null;
  try{
    src=cv.imread(canvas);dst=new cv.Mat();
    sp=cv.matFromArray(4,1,cv.CV_32FC2,[tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y]);
    dp=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w-1,0,w-1,h-1,0,h-1]);
    m=cv.getPerspectiveTransform(sp,dp);cv.warpPerspective(src,dst,m,new cv.Size(w,h),cv.INTER_LANCZOS4,cv.BORDER_REPLICATE,new cv.Scalar());cv.imshow(out,dst);
    return out;
  }finally{[src,dst,sp,dp,m].forEach(x=>x?.delete?.())}
}
