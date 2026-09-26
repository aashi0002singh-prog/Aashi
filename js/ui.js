export function toast(message,type="info"){
  let box=document.getElementById("toastContainer");
  if(!box){box=document.createElement("div");box.id="toastContainer";box.className="toast-container";document.body.appendChild(box)}
  const el=document.createElement("div");
  el.className=`toast ${type}`;
  const icon=type==="success"?"fa-circle-check":type==="error"?"fa-circle-exclamation":"fa-circle-info";
  el.innerHTML=`<i class="fa-solid ${icon}"></i><span>${escapeHtml(message)}</span>`;
  box.appendChild(el);
  setTimeout(()=>{el.style.opacity="0";setTimeout(()=>el.remove(),180)},3200);
}
export function escapeHtml(value=""){
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
export function formatBytes(bytes){
  if(!bytes)return "0 B";
  const units=["B","KB","MB","GB"]; const i=Math.floor(Math.log(bytes)/Math.log(1024));
  return `${(bytes/Math.pow(1024,i)).toFixed(i?1:0)} ${units[i]}`;
}
export function fileExtension(filename=""){
  const name=String(filename||"").split("?")[0].split("#")[0];
  const dot=name.lastIndexOf(".");
  return dot>=0 ? name.slice(dot+1).toLowerCase() : "";
}
export function mimeForFilename(filename="",fallback="application/octet-stream"){
  const map={pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif",csv:"text/csv",txt:"text/plain",json:"application/json",xml:"application/xml",html:"text/html",htm:"text/html",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",xls:"application/vnd.ms-excel",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",doc:"application/msword",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",ppt:"application/vnd.ms-powerpoint",zip:"application/zip",dwg:"application/acad",bin:"application/octet-stream"};
  return map[fileExtension(filename)]||fallback||"application/octet-stream";
}
export function normalizeFileBlob(blob,filename=""){
  if(!(blob instanceof Blob)) return blob;
  const extensionType=mimeForFilename(filename,"");
  const type=extensionType && extensionType!=="application/octet-stream" ? extensionType : (blob.type||"application/octet-stream");
  return blob.type===type ? blob : new Blob([blob],{type});
}
export function downloadBlob(blob,filename){
  try{
    const safeName=String(filename||"download").replace(/[\\/:*?"<>|]+/g,"_");
    const normalized=normalizeFileBlob(blob,safeName);
    const url=URL.createObjectURL(normalized);
    const a=document.createElement("a");
    a.href=url;a.download=safeName;a.rel="noopener";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    return true;
  }catch(err){
    console.error("Download failed",err);
    return false;
  }
}
export function downloadText(text,filename,type="application/json"){
  downloadBlob(new Blob([text],{type}),filename);
}
