export function createRecordSystem(ctx){
  const esc=ctx.escapeHtml;
  const colorFor=ctx.getColorForCategory;

  function renderVersionHistory(entry,color){
    if(!entry.present||!entry.versions?.length)return "";
    const rows=[...entry.versions].reverse().map(v=>`<div class="version-row"><span class="version-badge">${esc(v.versionLabel||"Version")}</span><span class="version-name" title="${esc(v.filename||"")}">${esc(v.filename||"Uploaded document")}</span><span class="version-size">${esc(v.size||"—")}</span><span class="version-note">${esc(v.note||"")}</span><span class="version-actions"><button type="button" class="mini-file-action" style="--action-color:${color}" data-preview-file="${esc(v.key)}" data-filename="${esc(v.filename||"")}" title="Preview"><i class="fa-solid fa-eye"></i></button><button type="button" class="mini-file-action" style="--action-color:${color}" data-download="${esc(v.key)}" data-filename="${esc(v.filename||"")}" title="Download"><i class="fa-solid fa-download"></i></button></span></div>`).join("");
    return `<div class="version-history"><div class="version-history-head"><span><i class="fa-solid fa-clock-rotate-left"></i> ${entry.versionCount} version${entry.versionCount===1?"":"s"}</span><span>Latest: ${esc(entry.versionLabel||"Current")}</span></div>${rows}</div>`;
  }

  function renderExpandedFiles(key,item){
    const entries=ctx.getExpandedFileMap().get(key)||[];
    if(!entries.length)return `<div class="expanded-empty">No document entries configured.</div>`;
    return entries.map(entry=>{
      const state=entry.present?"present":"missing";
      const versionCount=entry.versionCount||0;
      const actions=entry.present
        ? `<button class="text-action primary" data-preview-file="${esc(entry.storageKey)}" data-filename="${esc(entry.filename)}"><i class="fa-solid fa-eye"></i> Preview</button><button class="text-action" data-download="${esc(entry.storageKey)}" data-filename="${esc(entry.filename)}"><i class="fa-solid fa-download"></i> Download</button>${ctx.getIsAdmin()?`<button class="text-action" data-open-upload="${esc(key)}" data-subpart-index="${esc(entry.selectorValue??entry.sourceKey??"")}"><i class="fa-solid fa-plus"></i> New Version</button>`:""}`
        : (ctx.getIsAdmin()?`<button class="text-action primary" data-open-upload="${esc(key)}" data-subpart-index="${esc(entry.selectorValue??entry.sourceKey??"")}"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</button>`:`<span class="missing-label">ADMIN UPLOAD REQUIRED</span>`);
      return `<div class="expanded-file-row ${state}"><div class="expanded-file-main"><div class="expanded-file-title"><i class="fa-solid ${entry.present?"fa-file-circle-check":"fa-file-circle-xmark"}"></i><span>${esc(entry.name)}</span><span class="expanded-status ${state}">${entry.present?"PRESENT":"MISSING"}</span><span class="version-count">${versionCount} version${versionCount===1?"":"s"}</span></div>${entry.present?`<div class="expanded-file-meta"><span>Latest: ${esc(entry.versionLabel||"Current")}</span><span>${esc(entry.size||"—")}</span></div>`:`<div class="expanded-file-meta"><span>No uploaded version</span></div>`}</div><div class="expanded-file-actions">${actions}</div></div>`;
    }).join("");
  }

  function renderCards(){
    ctx.ensureSchematicCardsVisible();
    const grid=document.getElementById("cardsGrid");
    if(!grid)return;
    const entries=ctx.getFilteredEntries();
    const total=ctx.getRecordOrder().filter(k=>ctx.getCurrentItems()[k]).length;
    const groupView=ctx.getActiveCategory()!=="all";
    document.body.dataset.recordView=groupView?"group":"all";
    document.body.dataset.activeRecordCategory=ctx.getActiveCategory();
    const count=document.getElementById("recordCount");
    if(count)count.textContent=groupView?`${entries.length} records • Group view`:`${entries.length} of ${total} records • Compact view`;
    const hasSecondaryFilters=Boolean(ctx.getQuery()||ctx.getFavoritesOnly()||ctx.getSortMode()!=="default");
    const activeFilters=document.getElementById("activeFilters");
    if(activeFilters){
      activeFilters.classList.toggle("hidden",!hasSecondaryFilters);
      activeFilters.innerHTML=`${ctx.getQuery()?`<span class="filter-chip">Search: ${esc(ctx.getQuery())}</span>`:""}${ctx.getFavoritesOnly()?`<span class="filter-chip">Favorites only</span>`:""}${ctx.getSortMode()!=="default"?`<span class="filter-chip">Sort: ${esc(ctx.getSortMode())}</span>`:""}`;
    }
    grid.innerHTML=entries.map(([k,item])=>renderCard(k,item)).join("")||`<div class="empty-state"><i class="fa-solid fa-filter-circle-xmark"></i><h3 class="font-bold mt-3">No records found</h3><p class="text-xs mt-1">Adjust the search or filters.</p><button class="btn btn-light mt-3" data-clear-filters>Clear filters</button></div>`;
  }

  function renderCard(key,item){
    const color=colorFor(item.category);
    const favKey=`${ctx.getCurrentModel()}:${key}`;
    const isFav=ctx.getFavorites().includes(favKey);
    const entries=ctx.getExpandedFileMap().get(key)||[];
    const presentCount=entries.filter(x=>x.present).length;
    const totalSlots=entries.length;
    const versionTotal=entries.reduce((sum,x)=>sum+(x.versionCount||0),0);
    const expanded=ctx.getExpandedCards().has(key);
    const statusClass=presentCount===0?"all-missing":presentCount===totalSlots?"all-present":"partial";
    const statusText=presentCount===0?"DOCUMENTS MISSING":presentCount===totalSlots?"DOCUMENTS PRESENT":"DOCUMENTS PARTIAL";
    const summary=entries.length?`${presentCount}/${totalSlots} documents · ${versionTotal} versions`:"No document slots";
    const detail=expanded?`<div class="record-expanded-panel"><div class="record-detail-summary"><div><span class="detail-label">STATUS</span><strong class="${statusClass}">${esc(statusText)}</strong></div><div><span class="detail-label">DOCUMENTS</span><strong>${presentCount}/${totalSlots}</strong></div><div><span class="detail-label">VERSIONS</span><strong>${versionTotal}</strong></div></div><div class="expanded-file-list">${renderExpandedFiles(key,item)}</div><div class="expanded-footer"><button class="text-action primary" data-preview-record="${esc(key)}"><i class="fa-solid fa-eye"></i> Open Preview</button><button class="text-action" data-copy-record="${esc(key)}"><i class="fa-regular fa-copy"></i> Copy details</button><button class="text-action" data-link-record="${esc(key)}"><i class="fa-solid fa-link"></i> Copy link</button></div></div>`:"";
    return `<article id="record-${esc(key)}" class="record-card ${expanded?"is-expanded":""} ${isFav?"is-favorite":""}" style="--record-accent:${color}" data-record="${esc(key)}" tabindex="0" aria-expanded="${expanded}"><div class="record-stripe" style="background:${color}"></div><div class="record-collapsed-face"><div class="record-icon" style="background:${color}"><i class="fa-solid ${esc(item.icon)}"></i></div><div class="record-card-identity"><div class="record-title-only" title="${esc(item.title)}">${esc(item.title)}</div><div class="record-card-subtitle">${esc(item.category)} · ${esc(summary)}</div></div><div class="record-status ${statusClass}"><span class="status-dot ${presentCount?"present":"missing"}"></span><span>${esc(statusText)}</span></div><button class="favorite-btn ${isFav?"active":""}" data-favorite="${esc(favKey)}" title="Favorite" aria-label="Favorite"><i class="fa-${isFav?"solid":"regular"} fa-star"></i></button><span class="expand-cue"><i class="fa-solid fa-chevron-down"></i></span></div><div class="record-card-actions"><button type="button" class="card-action card-preview-action" data-preview-record="${esc(key)}"><i class="fa-solid fa-eye"></i><span>Preview</span></button>${presentCount?`<button type="button" class="card-action" data-download-latest="${esc(key)}"><i class="fa-solid fa-download"></i><span>Download</span></button>`:""}${ctx.getIsAdmin()?`<button type="button" class="card-action" data-open-upload="${esc(key)}" data-subpart-index=""><i class="fa-solid fa-cloud-arrow-up"></i><span>Upload</span></button>`:""}</div>${detail}</article>`;
  }

  async function previewRecord(key){
    const item=ctx.getCurrentItems()?.[key];
    if(!item)return;
    const entries=ctx.getExpandedFileMap().get(key)||[];
    const title=document.getElementById("filePreviewTitle"),meta=document.getElementById("filePreviewMeta"),body=document.getElementById("filePreviewBody");
    if(!body)return;
    const previousUrl=body.dataset.objectUrl;if(previousUrl)URL.revokeObjectURL(previousUrl);delete body.dataset.objectUrl;
    title.textContent=`${item.title} — Preview`;
    meta.textContent=`${ctx.getCurrentModel()} · ${item.category} · ${entries.filter(x=>x.present).length}/${entries.length} documents present`;
    body.innerHTML=`<div class="record-preview-workspace"><aside class="record-preview-info"><div class="preview-section-title">RECORD INFORMATION</div><div class="preview-info-grid"><span>Model</span><strong>${esc(ctx.getCurrentModel())}</strong><span>Record</span><strong>${esc(key)}</strong><span>Category</span><strong>${esc(item.category)}</strong><span>Status</span><strong>${esc(item.status||"Engineering record")}</strong><span>Documents</span><strong>${entries.filter(x=>x.present).length} / ${entries.length}</strong><span>Versions</span><strong>${entries.reduce((n,x)=>n+(x.versionCount||0),0)}</strong></div><div class="preview-section-title">FILES</div><div class="preview-file-list">${entries.length?entries.map((entry,i)=>`<button type="button" class="preview-file-item ${entry.present?"present":"missing"}" data-preview-slot="${i}"><span class="preview-file-icon"><i class="fa-solid ${entry.present?"fa-file-circle-check":"fa-file-circle-xmark"}"></i></span><span class="preview-file-copy"><strong>${esc(entry.name)}</strong><small>${esc(entry.present?entry.filename:"No uploaded document")}</small></span><span class="preview-file-state">${entry.present?esc(entry.size):"MISSING"}</span></button>`).join(""):"<div class='preview-empty'>No document slots configured.</div>"}</div><div class="preview-bottom-actions"><button type="button" class="btn btn-dark" id="previewDownloadAll"><i class="fa-solid fa-download"></i> Download All Files</button></div></aside><section class="record-preview-viewer"><div class="preview-viewer-head"><span id="previewViewerLabel">Select a file</span><span id="previewViewerMeta">Preview</span></div><div id="previewViewerCanvas" class="preview-viewer-canvas"><div class="preview-placeholder"><i class="fa-solid fa-eye"></i><strong>Select a file from the list</strong><span>Preview is isolated from the dashboard card so the card layout remains stable.</span></div></div></section></div>`;
    document.getElementById("filePreviewModal")?.classList.remove("hidden");
    document.getElementById("previewDownloadAll")?.addEventListener("click",()=>downloadAllRecordFiles(key));
    body.querySelectorAll("[data-preview-slot]").forEach(btn=>btn.addEventListener("click",()=>previewRecordSlot(key,Number(btn.dataset.previewSlot))));
    const firstPresent=entries.findIndex(x=>x.present);if(firstPresent>=0)await previewRecordSlot(key,firstPresent);
  }

  async function previewRecordSlot(key,index){
    const entries=ctx.getExpandedFileMap().get(key)||[],entry=entries[index];
    const canvas=document.getElementById("previewViewerCanvas"),label=document.getElementById("previewViewerLabel"),meta=document.getElementById("previewViewerMeta");
    if(!canvas||!entry)return;
    document.querySelectorAll(".preview-file-item").forEach((el,i)=>el.classList.toggle("active",i===index));
    if(!entry.present){label.textContent=entry.name;meta.textContent="No uploaded file";canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-file-circle-xmark"></i><strong>No file uploaded</strong><span>This document slot is currently missing.</span></div>`;return;}
    try{
      const record=await ctx.getFile(entry.storageKey);
      if(!record?.blob){canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><strong>Stored binary unavailable</strong><span>The document metadata exists but the binary is not available.</span></div>`;return;}
      const name=record.filename||entry.filename||"document",ext=name.split(".").pop().toLowerCase(),url=URL.createObjectURL(record.blob);
      const body=document.getElementById("filePreviewBody"),previous=body?.dataset?.objectUrl;if(previous)URL.revokeObjectURL(previous);if(body)body.dataset.objectUrl=url;
      label.textContent=name;meta.textContent=`${entry.versionLabel||"Latest"} · ${entry.size||ctx.getFormatBytes(record.size||record.blob.size)}`;
      if(record.blob.type?.startsWith("image/")||["png","jpg","jpeg","webp","gif","svg"].includes(ext))canvas.innerHTML=`<img class="record-preview-image" src="${url}" alt="${esc(name)}">`;
      else if(record.blob.type==="application/pdf"||ext==="pdf")canvas.innerHTML=`<iframe class="record-preview-frame" src="${url}" title="PDF preview"></iframe>`;
      else if(record.blob.type?.startsWith("text/")||["csv","txt","log","md"].includes(ext)){const text=await record.blob.text();canvas.innerHTML=`<pre class="record-preview-text">${esc(text.slice(0,250000))}</pre>`;}
      else canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-file-lines"></i><strong>${esc(ext.toUpperCase()||"FILE")} document</strong><span>Browser preview is unavailable for this file type.</span><button type="button" class="btn btn-dark" id="previewSelectedDownload"><i class="fa-solid fa-download"></i> Download File</button></div>`;
      document.getElementById("previewSelectedDownload")?.addEventListener("click",()=>ctx.downloadRecord(entry.storageKey,name));
    }catch(err){console.error("Record preview failed",err);canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><strong>Preview failed</strong><span>Use Download File to open the original document.</span></div>`;}
  }

  async function downloadAllRecordFiles(key){
    const present=(ctx.getExpandedFileMap().get(key)||[]).filter(x=>x.present);
    if(!present.length){ctx.toast("No uploaded files are available for this record.","info");return;}
    for(const entry of present)await ctx.downloadRecord(entry.storageKey,entry.filename);
    ctx.toast(`${present.length} file${present.length===1?"":"s"} queued for download.`,"success");
  }
  async function downloadLatestForRecord(key){const entry=(ctx.getExpandedFileMap().get(key)||[]).find(x=>x.present);if(entry)await ctx.downloadRecord(entry.storageKey,entry.filename);}

  return {renderCards,previewRecord,downloadAllRecordFiles,downloadLatestForRecord};
}
