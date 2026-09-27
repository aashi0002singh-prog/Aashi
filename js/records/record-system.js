/*
 * Record presentation boundary.
 * Data loading, filtering, upload/storage and application state remain in app.js.
 * This module owns only record cards + the dedicated record preview workspace.
 */
export function createRecordSystem(ctx){
  const esc=ctx.escapeHtml;
  const colorFor=category=>ctx.getCategoryColors?.()[category]||ctx.getCategoryColors?.().Specification||"#2563eb";

  function recordViewModel(key,item){
    const entries=ctx.getExpandedFileMap().get(key)||[];
    const presentCount=entries.filter(entry=>entry.present).length;
    const totalSlots=entries.length;
    const versionTotal=entries.reduce((sum,entry)=>sum+(entry.versionCount||0),0);
    const statusClass=presentCount>0?"all-present":"all-missing";
    const statusText=presentCount>0?"DOCUMENT READY":"DOCUMENT MISSING";
    const fileText=presentCount===1?"1 document ready":`${presentCount} documents ready`;
    return {
      key,item,entries,presentCount,totalSlots,versionTotal,statusClass,statusText,
      summary:presentCount?fileText:"No document uploaded"
    };
  }

  function renderExpandedFiles(vm){
    if(!vm.entries.length)return `<div class="expanded-empty">No document entries configured.</div>`;
    return vm.entries.map(entry=>{
      const selector=entry.selectorValue??entry.sourceKey??"";
      const actions=entry.present
        ? `<button type="button" class="text-action primary" data-preview-record="${esc(vm.key)}"><i class="fa-solid fa-eye"></i> Preview</button><button type="button" class="text-action" data-download="${esc(entry.storageKey)}" data-filename="${esc(entry.filename||"document")}"><i class="fa-solid fa-download"></i> Download</button>${ctx.getIsAdmin()?`<button type="button" class="text-action" data-open-upload="${esc(vm.key)}" data-subpart-index="${esc(selector)}"><i class="fa-solid fa-plus"></i> New Version</button>`:""}`
        : (ctx.getIsAdmin()?`<button type="button" class="text-action primary" data-open-upload="${esc(vm.key)}" data-subpart-index="${esc(selector)}"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</button>`:`<span class="missing-label">ADMIN UPLOAD REQUIRED</span>`);
      return `<div class="expanded-file-row ${entry.present?"is-present":"is-missing"}">
        <div class="expanded-file-main">
          <div class="expanded-file-title"><i class="fa-solid ${entry.present?"fa-file-circle-check":"fa-file-circle-xmark"}"></i><span>${esc(entry.name)}</span><span class="expanded-status ${entry.present?"present":"missing"}">${entry.present?"PRESENT":"MISSING"}</span></div>
          <div class="expanded-file-meta"><span>${entry.present?`Latest: ${esc(entry.versionLabel||"Current")}`:"No uploaded document"}</span><span>${esc(entry.size||"—")}</span><span>${entry.versionCount?`${entry.versionCount} version${entry.versionCount===1?"":"s"}`:"Ready to upload"}</span></div>
        </div>
        <div class="expanded-file-actions">${actions}</div>
      </div>`;
    }).join("");
  }

  function renderCard(key,item){
    const vm=recordViewModel(key,item);
    const color=colorFor(item.category);
    const favKey=`${ctx.getCurrentModel()}:${key}`;
    const isFav=ctx.getFavorites().includes(favKey);
    const groupView=ctx.getActiveCategory()!=="all";
    const expanded=groupView||ctx.getExpandedCards().has(key);
    const detail=expanded?`<div class="record-expanded-panel">
      <div class="record-detail-summary">
        <div><span class="detail-label">STATUS</span><strong class="${vm.statusClass}">${esc(vm.statusText)}</strong></div>
        <div><span class="detail-label">DOCUMENT STATUS</span><strong class="${vm.statusClass}">${esc(vm.statusText)}</strong></div>
        <div><span class="detail-label">UPLOADED</span><strong>${vm.presentCount} document${vm.presentCount===1?"":"s"}</strong></div>
      </div>
      <div class="expanded-file-list">${renderExpandedFiles(vm)}</div>
      <div class="expanded-footer">
        <button type="button" class="text-action primary" data-preview-record="${esc(key)}"><i class="fa-solid fa-eye"></i> Open Preview</button>
        <button type="button" class="text-action" data-copy-record="${esc(key)}"><i class="fa-regular fa-copy"></i> Copy details</button>
        <button type="button" class="text-action" data-link-record="${esc(key)}"><i class="fa-solid fa-link"></i> Copy link</button>
      </div>
    </div>`:"";

    return `<article id="record-${esc(key)}" class="record-card ${expanded?"is-expanded":""} ${isFav?"is-favorite":""}" style="--record-accent:${color}" data-record="${esc(key)}" tabindex="0" aria-expanded="${expanded}">
      <div class="record-stripe" style="background:${color}"></div>
      <div class="record-collapsed-face">
        <div class="record-icon" style="background:${color}"><i class="fa-solid ${esc(item.icon)}"></i></div>
        <div class="record-card-identity">
          <div class="record-title-only" title="${esc(item.title)}">${esc(item.title)}</div>
          <div class="record-card-subtitle"><span class="record-subtitle-status ${vm.statusClass}"><span class="status-dot ${vm.presentCount?"present":"missing"}"></span></span><strong class="record-document-state ${vm.statusClass}">${esc(vm.statusText)}</strong>${vm.presentCount>1?` · ${vm.presentCount} files`:""}</div>
        </div>
        <button type="button" class="favorite-btn ${isFav?"active":""}" data-favorite="${esc(favKey)}" title="Favorite" aria-label="Favorite"><i class="fa-${isFav?"solid":"regular"} fa-star"></i></button>
        <span class="expand-cue" aria-hidden="true"><i class="fa-solid fa-chevron-down"></i></span>
      </div>
      <div class="record-card-actions">
        <button type="button" class="card-action card-preview-action" data-preview-record="${esc(key)}"><i class="fa-solid fa-eye"></i><span>Preview</span></button>
        ${vm.presentCount?`<button type="button" class="card-action" data-download-latest="${esc(key)}"><i class="fa-solid fa-download"></i><span>Download</span></button>`:""}
        ${ctx.getIsAdmin()?`<button type="button" class="card-action" data-open-upload="${esc(key)}" data-subpart-index=""><i class="fa-solid fa-cloud-arrow-up"></i><span>Upload</span></button>`:""}
      </div>
      ${detail}
    </article>`;
  }

  function renderCards(){
    ctx.ensureSchematicCardsVisible();
    const grid=document.getElementById("cardsGrid");
    if(!grid)return;
    const entries=ctx.getFilteredEntries();
    const items=ctx.getCurrentItems();
    const total=ctx.getRecordOrder().filter(key=>items[key]).length;
    const groupView=ctx.getActiveCategory()!=="all";
    document.body.dataset.recordView=groupView?"group":"all";
    document.body.dataset.activeRecordCategory=ctx.getActiveCategory();
    const count=document.getElementById("recordCount");
    if(count)count.textContent=groupView?`${entries.length} records • Group view`:`${total} records`;
    const telemetryRecords=document.getElementById("telemetryRecords");
    if(telemetryRecords)telemetryRecords.textContent=String(total);
    const activeFilters=document.getElementById("activeFilters");
    const hasSecondaryFilters=Boolean(ctx.getQuery?.()||ctx.getFavoritesOnly?.()||ctx.getSortMode?.()!=="default");
    if(activeFilters){
      activeFilters.classList.toggle("hidden",!hasSecondaryFilters);
      activeFilters.innerHTML=`${ctx.getQuery?.()?`<span class="filter-chip">Search: ${esc(ctx.getQuery())}</span>`:""}${ctx.getFavoritesOnly?.()?`<span class="filter-chip">Favorites only</span>`:""}${ctx.getSortMode?.()!=="default"?`<span class="filter-chip">Sort: ${esc(ctx.getSortMode())}</span>`:""}`;
    }
    grid.innerHTML=entries.map(([key,item])=>renderCard(key,item)).join("")||`<div class="empty-state"><i class="fa-solid fa-filter-circle-xmark"></i><h3 class="font-bold mt-3">No records found</h3><p class="text-xs mt-1">Adjust the search or filters.</p><button class="btn btn-light mt-3" data-clear-filters>Clear filters</button></div>`;
  }

  async function previewRecord(key){
    const item=ctx.getCurrentItems()?.[key];
    if(!item)return;
    const entries=ctx.getExpandedFileMap().get(key)||[];
    const title=document.getElementById("filePreviewTitle");
    const meta=document.getElementById("filePreviewMeta");
    const body=document.getElementById("filePreviewBody");
    if(!body)return;
    const previousUrl=body.dataset.objectUrl;
    if(previousUrl)URL.revokeObjectURL(previousUrl);
    delete body.dataset.objectUrl;
    const present=entries.filter(entry=>entry.present).length;
    const versions=entries.reduce((sum,entry)=>sum+(entry.versionCount||0),0);
    title.textContent=`${item.title} — Preview`;
    meta.textContent=`${ctx.getCurrentModel()} · ${item.category} · ${present} document${present===1?"":"s"} ready · ${versions} version${versions===1?"":"s"}`;
    body.innerHTML=`<div class="record-preview-workspace">
      <aside class="record-preview-info">
        <div class="preview-section-title">RECORD INFORMATION</div>
        <div class="preview-info-grid">
          <span>Model</span><strong>${esc(ctx.getCurrentModel())}</strong>
          <span>Record</span><strong>${esc(key)}</strong>
          <span>Category</span><strong>${esc(item.category)}</strong>
          <span>Status</span><strong>${esc(item.status||"Engineering record")}</strong>
          <span>Documents</span><strong>${present} document${present===1?"":"s"} ready</strong>
          <span>Versions</span><strong>${versions}</strong>
        </div>
        <div class="preview-section-title">FILES</div>
        <div class="preview-file-list">
          ${entries.length?entries.map((entry,index)=>`<button type="button" class="preview-file-item ${entry.present?"present":"missing"}" data-preview-slot="${index}">
            <span class="preview-file-icon"><i class="fa-solid ${entry.present?"fa-file-circle-check":"fa-file-circle-xmark"}"></i></span>
            <span class="preview-file-copy"><strong>${esc(entry.name)}</strong><small>${esc(entry.present?entry.filename:"No uploaded document")}</small></span>
            <span class="preview-file-state">${entry.present?esc(entry.size):"MISSING"}</span>
          </button>`).join(""):"<div class='preview-empty'>No document uploaded yet.</div>"}
        </div>
        <div class="preview-bottom-actions"><button type="button" class="btn btn-dark" id="previewDownloadAll"><i class="fa-solid fa-download"></i> Download All Files</button></div>
      </aside>
      <section class="record-preview-viewer">
        <div class="preview-viewer-head"><span id="previewViewerLabel">Select a file</span><span id="previewViewerMeta">Preview</span></div>
        <div id="previewViewerCanvas" class="preview-viewer-canvas"><div class="preview-placeholder"><i class="fa-solid fa-eye"></i><strong>Select a file from the list</strong><span>Full file details stay in this workspace so the dashboard card remains compact.</span></div></div>
      </section>
    </div>`;
    document.getElementById("filePreviewModal")?.classList.remove("hidden");
    document.getElementById("previewDownloadAll")?.addEventListener("click",()=>downloadAllRecordFiles(key));
    body.querySelectorAll("[data-preview-slot]").forEach(button=>button.addEventListener("click",()=>previewRecordSlot(key,Number(button.dataset.previewSlot))));
    const firstPresent=entries.findIndex(entry=>entry.present);
    if(firstPresent>=0)await previewRecordSlot(key,firstPresent);
  }

  async function previewRecordSlot(key,index){
    const entries=ctx.getExpandedFileMap().get(key)||[];
    const entry=entries[index];
    const canvas=document.getElementById("previewViewerCanvas");
    const label=document.getElementById("previewViewerLabel");
    const meta=document.getElementById("previewViewerMeta");
    if(!canvas||!label||!meta||!entry)return;
    document.querySelectorAll(".preview-file-item").forEach((element,i)=>element.classList.toggle("active",i===index));
    if(!entry.present){
      label.textContent=entry.name;
      meta.textContent="No uploaded file";
      canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-file-circle-xmark"></i><strong>No file uploaded</strong><span>This document slot is currently missing.</span></div>`;
      return;
    }
    try{
      const record=await ctx.getFile(entry.storageKey);
      if(!record?.blob){
        canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><strong>Stored binary unavailable</strong><span>The document metadata exists but the binary is not available.</span></div>`;
        return;
      }
      const name=record.filename||entry.filename||"document";
      const ext=name.includes(".")?name.split(".").pop().toLowerCase():"";
      const url=URL.createObjectURL(record.blob);
      const body=document.getElementById("filePreviewBody");
      const previous=body?.dataset?.objectUrl;
      if(previous)URL.revokeObjectURL(previous);
      if(body)body.dataset.objectUrl=url;
      label.textContent=name;
      meta.textContent=`${entry.versionLabel||"Latest"} · ${entry.size||ctx.formatBytes(record.size||record.blob.size)}`;
      if(record.blob.type?.startsWith("image/")||["png","jpg","jpeg","webp","gif","svg"].includes(ext)){
        canvas.innerHTML=`<img class="record-preview-image" src="${url}" alt="${esc(name)}">`;
      }else if(record.blob.type==="application/pdf"||ext==="pdf"){
        canvas.innerHTML=`<iframe class="record-preview-frame" src="${url}" title="PDF preview"></iframe>`;
      }else if(record.blob.type?.startsWith("text/")||["csv","txt","log","md"].includes(ext)){
        const text=await record.blob.text();
        canvas.innerHTML=`<pre class="record-preview-text">${esc(text.slice(0,250000))}</pre>`;
      }else{
        canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-file-lines"></i><strong>${esc(ext.toUpperCase()||"FILE")} document</strong><span>Browser preview is unavailable for this file type.</span><button type="button" class="btn btn-dark" id="previewSelectedDownload"><i class="fa-solid fa-download"></i> Download File</button></div>`;
        document.getElementById("previewSelectedDownload")?.addEventListener("click",()=>ctx.downloadRecord(entry.storageKey,name));
      }
    }catch(error){
      console.error("Record preview failed",error);
      canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><strong>Preview failed</strong><span>Use Download File to open the original document.</span></div>`;
    }
  }

  async function downloadAllRecordFiles(key){
    const present=(ctx.getExpandedFileMap().get(key)||[]).filter(entry=>entry.present);
    if(!present.length){ctx.toast("No uploaded files are available for this record.","info");return;}
    for(const entry of present)await ctx.downloadRecord(entry.storageKey,entry.filename);
    ctx.toast(`${present.length} file${present.length===1?"":"s"} queued for download.` ,"success");
  }

  async function downloadLatestForRecord(key){
    const entry=(ctx.getExpandedFileMap().get(key)||[]).find(item=>item.present);
    if(entry)await ctx.downloadRecord(entry.storageKey,entry.filename);
  }

  return {renderCards,previewRecord,downloadAllRecordFiles,downloadLatestForRecord};
}
