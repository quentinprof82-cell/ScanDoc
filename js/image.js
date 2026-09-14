export function image(blob){return new Promise((res,rej)=>{const u=URL.createObjectURL(blob),i=new Image();i.onload=()=>{URL.revokeObjectURL(u);res(i)};i.onerror=rej;i.src=u})}
export function canvas(img,max=3000){const s=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*s);c.height=Math.round(img.naturalHeight*s);c.getContext('2d',{alpha:false}).drawImage(img,0,0,c.width,c.height);return c}
export function process(c,mode='document'){
  const o=document.createElement('canvas');o.width=c.width;o.height=c.height;const x=o.getContext('2d',{willReadFrequently:true,alpha:false});x.drawImage(c,0,0);
  const d=x.getImageData(0,0,o.width,o.height),p=d.data;
  if(mode==='color'){
    for(let i=0;i<p.length;i+=4){for(let k=0;k<3;k++)p[i+k]=Math.max(0,Math.min(255,(p[i+k]-128)*1.08+128));}
  }else{
    for(let i=0;i<p.length;i+=4){const y=.299*p[i]+.587*p[i+1]+.114*p[i+2];const contrast=mode==='document'?1.22:1.08;const v=Math.max(0,Math.min(255,(y-128)*contrast+128));p[i]=p[i+1]=p[i+2]=v;}
  }
  x.putImageData(d,0,0);
  // Mild sharpening for printed text without aggressive halos.
  const sh=document.createElement('canvas');sh.width=o.width;sh.height=o.height;const sx=sh.getContext('2d');sx.filter='contrast(1.03)';sx.drawImage(o,0,0);return sh;
}
export function jpeg(c,q=.95){return c.toDataURL('image/jpeg',q)}
