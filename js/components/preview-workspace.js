let currentState=null;

export async function openPreviewWorkspace({model,item,entries,selectedStorageKey,selectedFilename,getFile,formatBytes,escapeHtml,downloadRecord,openUploadModal,isAdmin}){
  const modal=document.getElementById("filePreviewModal");
  if(!modal)return;
  currentState={model,item,entries,getFile,formatBytes,escapeHtml,downloadRecord,openUploadModal,isAdmin,selectedStorageKey:selectedStorageKey||entries.find(x=>x.present)?.storageKey||"",selectedFilename:selectedFilename||entries.find(x=>x.present)?.filename||"",tab:"preview"};
  modal.classList.remove("hidden");
  renderWorkspace();
}

export function closePreviewWorkspace(){
  const body=document.getElementById("previewWorkspaceContent");
  const url=body?.dataset?.objectUrl;
  if(url)URL.revokeObjectURL(url);
  if(body){delete body.dataset.objectUrl;body.innerHTML="";}
  currentState=null;
}

function renderWorkspace(){
  const s=currentState,wrap=document.getElementById("previewWorkspaceContent");
  if(!s||!wrap)return;
  const item=s.item||{title:s.selectedFilename||"Engineering file",category:"Engineering",tags:[]};
  const entries=s.entries||[];
  const selected=entries.find(x=>x.storageKey===s.selectedStorageKey)||entries.find(x=>x.present);
  const tabs=[['preview','Preview'],['info','File Information'],['files','All Files'],['versions','Version History']];
  wrap.innerHTML=`<div class="preview-workspace-shell">
    <div class="preview-workspace-header">
      <div class="preview-title-block"><div class="preview-title-icon"><i class="fa-solid fa-file-circle-check"></i></div><div><div class="preview-eyebrow">DOCUMENT PREVIEW</div><h2>${s.escapeHtml(item.title||"Engineering file")}</h2><p>${s.escapeHtml(s.model)} • ${s.escapeHtml(item.category||"Engineering")}</p></div></div>
      <button class="modal-close preview-close" type="button" data-preview-close aria-label="Close preview"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="preview-tabs" role="tablist">${tabs.map(([id,label])=>`<button type="button" class="preview-tab ${s.tab===id?"active":""}" data-preview-tab="${id}" role="tab" aria-selected="${s.tab===id}">${label}</button>`).join("")}</div>
    <div class="preview-workspace-body">${renderTab(s,selected)}</div>
  </div>`;
  wrap.querySelectorAll('[data-preview-tab]').forEach(b=>b.addEventListener('click',()=>{s.tab=b.dataset.previewTab;renderWorkspace()}));
  wrap.querySelector('[data-preview-close]')?.addEventListener('click',()=>{document.getElementById('filePreviewModal')?.classList.add('hidden');closePreviewWorkspace()});
  wrap.querySelectorAll('[data-preview-select]').forEach(b=>b.addEventListener('click',()=>{s.selectedStorageKey=b.dataset.previewSelect;s.selectedFilename=b.dataset.previewFilename||"";s.tab='preview';renderWorkspace()}));
  wrap.querySelectorAll('[data-preview-download]').forEach(b=>b.addEventListener('click',()=>s.downloadRecord(b.dataset.previewDownload,b.dataset.previewFilename||"")));
  wrap.querySelector('[data-preview-download-all]')?.addEventListener('click',()=>downloadAll(s));
  wrap.querySelector('[data-preview-upload]')?.addEventListener('click',()=>s.openUploadModal(item._recordKey||""));
  loadPreviewBinary(s,selected);
}

function renderTab(s,selected){
  if(s.tab==='preview'){
    return `<div class="preview-main-layout">
      <aside class="preview-file-list"><div class="preview-pane-title">Files <span>${s.entries.length}</span></div>${s.entries.map(e=>`<button type="button" class="preview-file-item ${selected?.storageKey===e.storageKey?"active":""}" data-preview-select="${s.escapeHtml(e.storageKey||"")}" data-preview-filename="${s.escapeHtml(e.filename||"")}"><span class="preview-file-icon"><i class="fa-solid ${e.present?"fa-file-lines":"fa-file-circle-xmark"}"></i></span><span class="preview-file-copy"><strong>${s.escapeHtml(e.name||"Document")}</strong><small>${e.present?s.escapeHtml(e.filename||"Uploaded file"):"No uploaded version"}</small></span><span class="preview-file-count">${e.present?`${e.versionCount}v`:"—"}</span></button>`).join("")}<button type="button" class="preview-download-all" data-preview-download-all><i class="fa-solid fa-download"></i> Download All</button></aside>
      <section class="preview-canvas-pane"><div class="preview-canvas-toolbar"><span>${selected?.filename?s.escapeHtml(selected.filename):"No uploaded file"}</span><span class="preview-toolbar-meta">${selected?.size?s.escapeHtml(selected.size):""}</span></div><div id="previewBinaryPane" class="preview-binary-pane"><div class="preview-loading"><i class="fa-solid fa-spinner fa-spin"></i><span>Loading preview…</span></div></div></section>
    </div>`;
  }
  if(s.tab==='info') return `<div class="preview-info-layout"><div class="preview-info-card"><h3>File Information</h3>${infoRow('Record',s.item?.title||'—')}${infoRow('Category',s.item?.category||'—')}${infoRow('Status',statusFor(s.entries))}${infoRow('Documents',String(s.entries.length))}${infoRow('Uploaded versions',String(s.entries.reduce((n,e)=>n+(e.versionCount||0),0)))}</div><div class="preview-info-card"><h3>Tags</h3><div class="preview-tags">${(s.item?.tags||[]).map(t=>`<span class="tag-chip">${s.escapeHtml(t)}</span>`).join('')||'<span class="preview-muted">No tags configured.</span>'}</div></div></div>`;
  if(s.tab==='files') return `<div class="preview-table-wrap"><div class="preview-table-head"><span>Document</span><span>Status</span><span>Latest file</span><span>Versions</span><span>Action</span></div>${s.entries.map(e=>`<div class="preview-table-row"><strong>${s.escapeHtml(e.name||'Document')}</strong><span class="${e.present?'table-present':'table-missing'}">${e.present?'Present':'Missing'}</span><span title="${s.escapeHtml(e.filename||'')}">${s.escapeHtml(e.filename||'—')}</span><span>${e.versionCount||0}</span><span>${e.present?`<button class="card-action secondary" data-preview-download="${s.escapeHtml(e.storageKey)}" data-preview-filename="${s.escapeHtml(e.filename||'')}">Download</button>`:(s.isAdmin?`<button class="card-action secondary" data-preview-upload>Upload</button>`:'—')}</span></div>`).join('')}</div>`;
  return `<div class="preview-version-layout">${s.entries.map(e=>`<section class="preview-version-section"><h3>${s.escapeHtml(e.name||'Document')} <span>${e.versionCount||0} version${(e.versionCount||0)===1?'':'s'}</span></h3>${e.versions?.length?e.versions.slice().reverse().map(v=>`<div class="preview-version-row"><span class="version-badge">${s.escapeHtml(v.versionLabel||'Version')}</span><span class="preview-version-name">${s.escapeHtml(v.filename||'Uploaded document')}</span><span>${s.escapeHtml(v.size||'—')}</span><button class="card-action ghost" data-preview-select="${s.escapeHtml(v.key)}" data-preview-filename="${s.escapeHtml(v.filename||'')}">Preview</button><button class="card-action ghost" data-preview-download="${s.escapeHtml(v.key)}" data-preview-filename="${s.escapeHtml(v.filename||'')}">Download</button></div>`).join(''):'<div class="preview-muted">No uploaded versions.</div>'}</section>`).join('')}</div>`;
}

function infoRow(label,value){return `<div class="preview-info-row"><span>${label}</span><strong>${value}</strong></div>`}
function statusFor(entries){const present=entries.filter(e=>e.present).length;if(!present)return'Missing';if(present===entries.length)return'Present';return'Partial'}
async function loadPreviewBinary(s,selected){
  if(s.tab!=='preview'||!selected?.present)return;
  const host=document.getElementById('previewBinaryPane');if(!host)return;
  try{
    const record=await s.getFile(selected.storageKey);
    if(!record?.blob){host.innerHTML='<div class="preview-empty"><i class="fa-solid fa-file-circle-xmark"></i><strong>No stored binary is available.</strong><span>The metadata exists, but the file is not in the local repository.</span></div>';return;}
    const body=document.getElementById('previewWorkspaceContent');const old=body?.dataset?.objectUrl;if(old)URL.revokeObjectURL(old);
    const url=URL.createObjectURL(record.blob);if(body)body.dataset.objectUrl=url;
    const name=record.filename||selected.filename||'file',ext=name.split('.').pop().toLowerCase();
    if(record.blob.type?.startsWith('image/')||['png','jpg','jpeg','webp','gif','svg'].includes(ext))host.innerHTML=`<img class="preview-image" src="${url}" alt="${s.escapeHtml(name)}">`;
    else if(record.blob.type==='application/pdf'||ext==='pdf')host.innerHTML=`<iframe class="preview-pdf" src="${url}" title="PDF preview"></iframe>`;
    else if(record.blob.type?.startsWith('text/')||['csv','txt','log','md'].includes(ext)){const text=await record.blob.text();host.innerHTML=`<pre class="preview-text">${s.escapeHtml(text.slice(0,200000))}</pre>`;}
    else host.innerHTML=`<div class="preview-empty"><i class="fa-solid fa-file-lines"></i><strong>Preview is not available for this file type.</strong><span>Download the original file to open it in its native application.</span><button class="btn btn-dark" data-preview-download="${s.escapeHtml(selected.storageKey)}" data-preview-filename="${s.escapeHtml(name)}"><i class="fa-solid fa-download"></i> Download</button></div>`;
    host.querySelectorAll('[data-preview-download]').forEach(b=>b.addEventListener('click',()=>s.downloadRecord(b.dataset.previewDownload,b.dataset.previewFilename||'')));
  }catch(err){console.error('Preview workspace failed',err);host.innerHTML='<div class="preview-empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>Unable to render this file.</strong><span>Use Download to inspect the original.</span></div>'}
}
async function downloadAll(s){
  const files=[];for(const entry of s.entries||[]){for(const v of entry.versions||[]){files.push(v)}if(!entry.versions?.length&&entry.present)files.push(entry)}
  for(const f of files){if(f?.key)await s.downloadRecord(f.key,f.filename||'Engineering file')}
}
