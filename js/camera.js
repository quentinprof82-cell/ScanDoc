let stream=null;
export async function open(){
  if(!navigator.mediaDevices?.getUserMedia)throw Error('unsupported');
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:2560,max:4096},height:{ideal:1440,max:4096},frameRate:{ideal:30,max:30}},audio:false});
  const track=stream.getVideoTracks()[0];
  try{const cap=track.getCapabilities?.();if(cap?.width?.max&&cap?.height?.max)await track.applyConstraints({width:{ideal:Math.min(cap.width.max,4096)},height:{ideal:Math.min(cap.height.max,4096)}});}catch{}
  return stream;
}
export function stop(){stream?.getTracks().forEach(t=>t.stop());stream=null}
export async function photo(video){
  if(!video.videoWidth)throw Error('notready');
  const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;
  c.getContext('2d',{alpha:false}).drawImage(video,0,0,c.width,c.height);
  return new Promise(r=>c.toBlob(r,'image/jpeg',.98));
}
