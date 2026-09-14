let cvReady;

function waitForCv(timeout = 30000) {
  if (window.cv?.Mat && window.cv?.findContours && window.cv?.Canny) return Promise.resolve(window.cv);
  if (!cvReady) {
    cvReady = new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (window.cv?.Mat && window.cv?.findContours && window.cv?.Canny) { clearInterval(timer); resolve(window.cv); }
        else if (Date.now() - started > timeout) { clearInterval(timer); resolve(null); }
      }, 100);
    });
  }
  return cvReady;
}

export function order(points) {
  if (!points?.length) return points;
  const pts = points.map(p => ({x:Number(p.x), y:Number(p.y)}));
  const c = pts.reduce((a,p)=>({x:a.x+p.x/pts.length,y:a.y+p.y/pts.length}),{x:0,y:0});
  pts.sort((a,b)=>Math.atan2(a.y-c.y,a.x-c.x)-Math.atan2(b.y-c.y,b.x-c.x));
  let tl=0; for(let i=1;i<4;i++) if(pts[i].x+pts[i].y<pts[tl].x+pts[tl].y) tl=i;
  const out=[pts[tl]];
  for(let k=1;k<4;k++) out.push(pts[(tl+k)%4]);
  if(out[1].x<out[3].x) [out[1],out[3]]=[out[3],out[1]];
  return out;
}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function polygonArea(p){let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a.x*b.y-b.x*a.y}return Math.abs(s)/2}
function angle(a,b,c){const ab={x:a.x-b.x,y:a.y-b.y},cb={x:c.x-b.x,y:c.y-b.y};const den=Math.hypot(ab.x,ab.y)*Math.hypot(cb.x,cb.y)||1;return Math.acos(Math.max(-1,Math.min(1,(ab.x*cb.x+ab.y*cb.y)/den)))*180/Math.PI}
function pointFromMat(m,i){return{x:m.intAt(i,0),y:m.intAt(i,1)}}
function validQuad(p,w,h){
  if(!p||p.length!==4)return false;
  const q=order(p), area=polygonArea(q)/(w*h);
  if(area<.12)return false;
  const sides=[dist(q[0],q[1]),dist(q[1],q[2]),dist(q[2],q[3]),dist(q[3],q[0])];
  if(Math.min(...sides)<Math.min(w,h)*.15)return false;
  const angles=[angle(q[3],q[0],q[1]),angle(q[0],q[1],q[2]),angle(q[1],q[2],q[3]),angle(q[2],q[3],q[0])];
  const err=angles.reduce((s,a)=>s+Math.abs(90-a),0)/4;
  return err<45;
}
function quadScore(p,w,h){
  const q=order(p), area=polygonArea(q)/(w*h);
  const sides=[dist(q[0],q[1]),dist(q[1],q[2]),dist(q[2],q[3]),dist(q[3],q[0])];
  const angles=[angle(q[3],q[0],q[1]),angle(q[0],q[1],q[2]),angle(q[1],q[2],q[3]),angle(q[2],q[3],q[0])];
  const err=angles.reduce((s,a)=>s+Math.abs(90-a),0)/4;
  const edge= q.reduce((s,p)=>s+Math.min(p.x,p.y,w-p.x,h-p.y),0)/4;
  return area*10 + Math.max(0,1-err/60)*2 + Math.min(1,edge/120)*.4 + Math.min(...sides)/Math.max(...sides);
}
function lineFrom(a,b){return{x1:a.x,y1:a.y,x2:b.x,y2:b.y,len:Math.hypot(b.x-a.x,b.y-a.y),ang:Math.atan2(b.y-a.y,b.x-a.x)}}
function intersect(a,b){
  const x1=a.x1,y1=a.y1,x2=a.x2,y2=a.y2,x3=b.x1,y3=b.y1,x4=b.x2,y4=b.y2;
  const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4); if(Math.abs(den)<1e-7)return null;
  const px=((x1*y2-y1*x2)*(x3-x4)-(x1-x2)*(x3*y4-y3*x4))/den;
  const py=((x1*y2-y1*x2)*(y3-y4)-(y1-y2)*(x3*y4-y3*x4))/den;
  return{x:px,y:py};
}
function angleDeg(l){let a=Math.abs(l.ang*180/Math.PI)%180;return a>90?180-a:a}
function houghCandidates(cv,edges,w,h){
  const lines=new cv.Mat(); const out=[];
  try{
    cv.HoughLinesP(edges,lines,1,Math.PI/180,Math.max(35,Math.round(Math.min(w,h)*.12)),Math.max(30,Math.min(w,h)*.18),20);
    for(let i=0;i<lines.rows;i++){const d=lines.data32S.slice(i*4,i*4+4);const l=lineFrom({x:d[0],y:d[1]},{x:d[2],y:d[3]});if(l.len>Math.min(w,h)*.18)out.push(l)}
  } finally{lines.delete()}
  const hs=out.filter(l=>angleDeg(l)<28).sort((a,b)=>b.len-a.len).slice(0,16);
  const vs=out.filter(l=>angleDeg(l)>62).sort((a,b)=>b.len-a.len).slice(0,16);
  const candidates=[];
  for(let i=0;i<hs.length;i++)for(let j=i+1;j<hs.length;j++){
    const hp=[hs[i],hs[j]]; const hsep=Math.min(Math.abs((hs[i].y1+hs[i].y2)/2-(hs[j].y1+hs[j].y2)/2),h);
    if(hsep< h*.18) continue;
    for(let k=0;k<vs.length;k++)for(let m=k+1;m<vs.length;m++){
      const vp=[vs[k],vs[m]]; const vsep=Math.min(Math.abs((vs[k].x1+vs[k].x2)/2-(vs[m].x1+vs[m].x2)/2),w);
      if(vsep<w*.18)continue;
      const tl=intersect(hp[0],vp[0]),tr=intersect(hp[0],vp[1]),br=intersect(hp[1],vp[1]),bl=intersect(hp[1],vp[0]);
      if([tl,tr,br,bl].some(p=>!p||p.x<-w*.15||p.x>w*1.15||p.y<-h*.15||p.y>h*1.15))continue;
      const q=order([tl,tr,br,bl]); if(validQuad(q,w,h)) candidates.push(q);
    }
  }
  return candidates;
}
function addContourCandidates(cv,mat,out,eps){
  const contours=new cv.MatVector(),hier=new cv.Mat();
  try{cv.findContours(mat,contours,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    for(let i=0;i<contours.size();i++){const cnt=contours.get(i);try{const area=Math.abs(cv.contourArea(cnt));if(area<.06*mat.rows*mat.cols)continue;const peri=cv.arcLength(cnt,true),approx=new cv.Mat();cv.approxPolyDP(cnt,approx,Math.max(1,eps*peri),true);if(approx.rows===4){const p=[];for(let j=0;j<4;j++)p.push(pointFromMat(approx,j));if(validQuad(p,mat.cols,mat.rows))out.push(order(p))}approx.delete()}finally{cnt.delete()}}
  }finally{contours.delete();hier.delete()}
}

export async function detect(canvas){
  const cv=await waitForCv(); if(!cv)return null;
  let src,small,gray,blur,edges,thr,work,close;
  try{
    src=cv.imread(canvas); const scale=Math.min(1,1800/Math.max(src.cols,src.rows)); small=new cv.Mat();
    if(scale<1)cv.resize(src,small,new cv.Size(Math.round(src.cols*scale),Math.round(src.rows*scale)),0,0,cv.INTER_AREA);else src.copyTo(small);
    gray=new cv.Mat();blur=new cv.Mat();edges=new cv.Mat();thr=new cv.Mat();work=new cv.Mat();close=new cv.Mat();
    cv.cvtColor(small,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
    const candidates=[];
    // Multi-scale edge detection. The lower threshold is intentional: document edges can be faint.
    cv.Canny(blur,edges,15,80);
    cv.dilate(edges,close,cv.Mat.ones(3,3,cv.CV_8U),new cv.Point(-1,-1),1);
    candidates.push(...houghCandidates(cv,close,small.cols,small.rows));
    candidates.push(...houghCandidates(cv,edges,small.cols,small.rows));
    addContourCandidates(cv,close,candidates,.012);
    cv.threshold(blur,thr,0,255,cv.THRESH_BINARY+cv.THRESH_OTSU);cv.morphologyEx(thr,work,cv.MORPH_CLOSE,cv.Mat.ones(9,9,cv.CV_8U));addContourCandidates(cv,work,candidates,.012);
    cv.adaptiveThreshold(blur,thr,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY,41,5);cv.morphologyEx(thr,work,cv.MORPH_CLOSE,cv.Mat.ones(7,7,cv.CV_8U));addContourCandidates(cv,work,candidates,.012);
    let best=null,score=-Infinity; for(const q of candidates){const s=quadScore(q,small.cols,small.rows);if(s>score){score=s;best=q}}
    if(!best){
      // Soft fallback: estimate the sheet from the strongest large edge component's bounding quadrilateral.
      const contours=new cv.MatVector(),hier=new cv.Mat();cv.findContours(close,contours,hier,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
      let largest=null,la=0;for(let i=0;i<contours.size();i++){const c=contours.get(i),a=Math.abs(cv.contourArea(c));if(a>la){largest?.delete?.();largest=c;la=a}else c.delete()}
      if(largest&&la>.18*small.cols*small.rows){const r=cv.minAreaRect(largest);const pts=cv.RotatedRect.points(r);const q=order(Array.from(pts).map(p=>({x:p.x,y:p.y})));if(validQuad(q,small.cols,small.rows))best=q;else largest.delete()} else largest?.delete?.();contours.delete();hier.delete();
    }
    if(!best)return null; const inv=1/scale; return order(best).map(p=>({x:Math.max(0,Math.min(src.cols-1,p.x*inv)),y:Math.max(0,Math.min(src.rows-1,p.y*inv))}));
  }catch(e){console.warn('Document detection failed',e);return null}
  finally{[src,small,gray,blur,edges,thr,work,close].forEach(x=>x?.delete?.())}
}

export function warp(canvas,p){
  p=order(p);const [tl,tr,br,bl]=p;const rawW=Math.max(dist(tl,tr),dist(bl,br)),rawH=Math.max(dist(tl,bl),dist(tr,br));let w=Math.max(1000,Math.round(rawW)),h=Math.max(1400,Math.round(rawH));const maxDim=3600,s=Math.min(1,maxDim/Math.max(w,h));w=Math.max(1000,Math.round(w*s));h=Math.max(1400,Math.round(h*s));const out=document.createElement('canvas');out.width=w;out.height=h;
  if(!window.cv?.Mat){out.getContext('2d').drawImage(canvas,tl.x,tl.y,rawW,rawH,0,0,w,h);return out}
  const cv=window.cv,src=cv.imread(canvas),dst=new cv.Mat(),sp=cv.matFromArray(4,1,cv.CV_32FC2,[tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y]),dp=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w-1,0,w-1,h-1,0,h-1]),m=cv.getPerspectiveTransform(sp,dp);cv.warpPerspective(src,dst,m,new cv.Size(w,h),cv.INTER_LANCZOS4,cv.BORDER_REPLICATE,new cv.Scalar());cv.imshow(out,dst);[src,dst,sp,dp,m].forEach(x=>x.delete());return out;
}
