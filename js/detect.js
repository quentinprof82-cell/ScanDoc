let cvReady;

function waitForCv(timeout = 9000) {
  if (window.cv?.Mat) return Promise.resolve(window.cv);
  if (!cvReady) {
    cvReady = new Promise(resolve => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (window.cv?.Mat) { clearInterval(timer); resolve(window.cv); }
        else if (Date.now() - start > timeout) { clearInterval(timer); resolve(null); }
      }, 80);
    });
  }
  return cvReady;
}

export function order(p) {
  const s = p.map(q => q.x + q.y), d = p.map(q => q.x - q.y);
  return [p[s.indexOf(Math.min(...s))], p[d.indexOf(Math.max(...d))], p[s.indexOf(Math.max(...s))], p[d.indexOf(Math.min(...d))]];
}

function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function angle(a,b,c){
  const ab={x:a.x-b.x,y:a.y-b.y}, cb={x:c.x-b.x,y:c.y-b.y};
  const den=Math.hypot(ab.x,ab.y)*Math.hypot(cb.x,cb.y)||1;
  return Math.acos(Math.max(-1,Math.min(1,(ab.x*cb.x+ab.y*cb.y)/den)))*180/Math.PI;
}

export async function detect(c) {
  const cv = await waitForCv();
  if (!cv) return null;
  let src=null, small=null, gray=null, blur=null, edges=null, th=null, contours=null, hierarchy=null;
  try {
    src=cv.imread(c);
    const scale=Math.min(1,1400/Math.max(src.cols,src.rows));
    small=new cv.Mat();
    if(scale<1) cv.resize(src,small,new cv.Size(Math.round(src.cols*scale),Math.round(src.rows*scale)),0,0,cv.INTER_AREA); else src.copyTo(small);
    gray=new cv.Mat(); blur=new cv.Mat(); edges=new cv.Mat(); th=new cv.Mat(); contours=new cv.MatVector(); hierarchy=new cv.Mat();
    cv.cvtColor(small,gray,cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
    cv.Canny(blur,45,150,edges);
    cv.morphologyEx(edges,edges,cv.MORPH_CLOSE,cv.Mat.ones(5,5,cv.CV_8U));
    cv.adaptiveThreshold(blur,th,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY,31,9);
    cv.bitwise_not(th,th);
    cv.findContours(edges,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    // Add contours from adaptive threshold; this helps with pale documents and uneven light.
    const c2=new cv.MatVector(), h2=new cv.Mat();
    cv.findContours(th,c2,h2,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    for(let i=0;i<c2.size();i++) contours.push_back(c2.get(i));
    c2.delete(); h2.delete();

    const imageArea=small.rows*small.cols;
    let best=null,bestScore=0;
    for(let i=0;i<contours.size();i++){
      const cnt=contours.get(i), peri=cv.arcLength(cnt,true), ap=new cv.Mat();
      cv.approxPolyDP(cnt,ap,Math.max(2,0.018*peri),true);
      const ar=Math.abs(cv.contourArea(ap));
      if(ap.rows===4 && ar>imageArea*0.12 && cv.isContourConvex(ap)){
        const p=[]; for(let j=0;j<4;j++) p.push({x:ap.intAt(j,0),y:ap.intAt(j,1)});
        const po=order(p);
        const sides=[dist(po[0],po[1]),dist(po[1],po[2]),dist(po[2],po[3]),dist(po[3],po[0])];
        const minSide=Math.min(...sides), maxSide=Math.max(...sides);
        const ratio=minSide/(maxSide||1);
        const angles=[angle(po[3],po[0],po[1]),angle(po[0],po[1],po[2]),angle(po[1],po[2],po[3]),angle(po[2],po[3],po[0])];
        const angleErr=angles.reduce((s,a)=>s+Math.abs(90-a),0)/4;
        const border=po.reduce((s,q)=>s+Math.min(q.x,q.y,small.cols-q.x,small.rows-q.y),0)/4;
        const areaScore=ar/imageArea;
        // Prefer large, rectangular, well-proportioned contours without requiring them to touch the image border.
        const score=areaScore*4 + ratio*1.5 + Math.max(0,1-angleErr/55)*1.8 + Math.min(1,border/80)*0.35;
        if(score>bestScore && angleErr<45){ bestScore=score; best=po; }
      }
      ap.delete(); cnt.delete();
    }
    if(!best) return null;
    const inv=1/scale;
    return best.map(q=>({x:q.x*inv,y:q.y*inv}));
  }catch(e){ return null; }
  finally{ [src,small,gray,blur,edges,th,contours,hierarchy].forEach(x=>x?.delete?.()); }
}

export function warp(c,p){
  p=order(p); const [tl,tr,br,bl]=p;
  const rawW=Math.max(dist(tl,tr),dist(bl,br)), rawH=Math.max(dist(tl,bl),dist(tr,br));
  const ratio=rawW/(rawH||1);
  let w=Math.max(900,Math.round(rawW)), h=Math.max(1200,Math.round(rawH));
  const maxDim=2800;
  const scale=Math.min(1,maxDim/Math.max(w,h)); w=Math.max(900,Math.round(w*scale)); h=Math.max(1200,Math.round(h*scale));
  const o=document.createElement('canvas'); o.width=w; o.height=h;
  if(!window.cv?.Mat){
    o.getContext('2d').drawImage(c,tl.x,tl.y,rawW,rawH,0,0,w,h); return o;
  }
  const cv=window.cv,s=cv.imread(c),d=new cv.Mat();
  const sp=cv.matFromArray(4,1,cv.CV_32FC2,[tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y]);
  const dp=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w-1,0,w-1,h-1,0,h-1]);
  const m=cv.getPerspectiveTransform(sp,dp);
  cv.warpPerspective(s,d,m,new cv.Size(w,h),cv.INTER_LANCZOS4,cv.BORDER_REPLICATE,new cv.Scalar());
  cv.imshow(o,d); [s,d,sp,dp,m].forEach(x=>x.delete()); return o;
}
