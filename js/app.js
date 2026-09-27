import {MODEL_ORDER,RECORD_ORDER,CATEGORIES,CATEGORY_COLORS,createDefaultData} from "../data/models.js";
import {saveFile,saveFileVersion,getFile,getFiles,listFileVersions,listFileVersionsForBases,deleteAllFiles,deleteAuditLogs,addAudit,migrateFilePrefix,deleteFilePrefix} from "./database.js";
import {toast,escapeHtml,formatBytes,downloadBlob,downloadText} from "./ui.js";

const STORAGE_KEY="MOBILE_RND_DB_DATA_V1";
const PREF_KEY="MOBILE_RND_PREFS_V3";
const AUTH_KEY="RND_AUTH_V3";
const MAX_FILE_SIZE=500*1024*1024;
const ALLOWED=["pdf","xlsx","xls","zip","bin","dwg","csv","doc","docx","ppt","pptx","txt","log","md","jpg","jpeg","png","webp","gif","svg"];
const CUSTOM_MODELS_KEY="MOBILE_RND_CUSTOM_MODELS_V1";
const RENAMED_MODELS_KEY="MOBILE_RND_RENAMED_MODELS_V1";
function customModelCodes(){return readJson(CUSTOM_MODELS_KEY,[]).map(x=>String(x?.code||"").trim().toUpperCase()).filter(Boolean)}
function renamedModelMap(){return readJson(RENAMED_MODELS_KEY,{});}
function modelList(){const renamed=renamedModelMap();return [...MODEL_ORDER,...customModelCodes()].filter((m,i,a)=>a.indexOf(m)===i&&!renamed[m]&&data?.[m])}

function clone(value){return structuredClone(value)}

let data=loadData();
let prefs=loadPrefs();
let draftPrefs={...prefs};
let currentModel=modelList()[0];
let activeCategory="all", query="", sortMode="default", favoritesOnly=false;
let recentlyViewed=readJson("MOBILE_RND_RECENT_V1",[]);
let favorites=readJson("MOBILE_RND_FAVORITES_V1",[]);
let isAdmin=sessionStorage.getItem(AUTH_KEY)==="true";
let selectedFiles=[];
let uploadedKeys=new Set();
let uploadedFiles=new Map();
let uploadedSubpartFiles=new Map();
let expandedFileMap=new Map();
let expandedCards=new Set();

function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||"null");return value??fallback}catch{return fallback}}
function loadData(){
  try{
    const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
    const raw=stored&&typeof stored==="object"?stored:createDefaultData();
    const defaults=createDefaultData();
    customModelCodes().forEach(code=>{
      if(!raw[code]){
        const template=clone(defaults.A576);
        template.meta={...template.meta,name:code,modelYear:"—",sielHwPic:"—",rfNetwork:"—"};
        for(const item of Object.values(template.items)){
          if(item.filename)item.filename=item.filename.replaceAll("A576",code);
          item.subItems?.forEach(sub=>{if(sub.filename)sub.filename=sub.filename.replaceAll("A576",code)});
          item.mergedSources?.forEach(src=>{if(src.filename)src.filename=src.filename.replaceAll("A576",code)});
        }
        raw[code]=template;
      }
    });
    return raw;
  }catch{return createDefaultData()}
}
function saveData(){localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}
function loadPrefs(){try{return {...{theme:"light",accent:"cyan",density:"comfortable",motion:true},...JSON.parse(localStorage.getItem(PREF_KEY)||"{}")}}catch{return {theme:"light",accent:"cyan",density:"comfortable",motion:true}}}
function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}
function currentItems(){return data[currentModel].items}
function currentItemsFor(model){return data[model]?.items||{}}
function itemText(k,item){return [k,item.title,item.category,item.filename,item.uploadedFilename,...(item.tags||[]),...(item.subItems||[]).flatMap(s=>[s.name,s.filename,s.size]),...(item.mergedSources||[]).flatMap(s=>[s.name,s.filename,s.size,s.detail])].join(" ").toLowerCase()}
function markRecent(key){const id=`${currentModel}:${key}`;recentlyViewed=[id,...recentlyViewed.filter(x=>x!==id)].slice(0,8);localStorage.setItem("MOBILE_RND_RECENT_V1",JSON.stringify(recentlyViewed))}
function parseHash(){const m=location.hash.match(/^#record\/([^/]+)\/?([^/]*)$/);if(m&&modelList().includes(m[1])&&currentItemsFor(m[1])[m[2]]){currentModel=m[1];activeCategory="all";query="";renderAll();refreshUploadedFlags(currentModel);setTimeout(()=>focusRecord(m[2]),0)}}
function init(){
  populateUploadModels(currentModel);
  const last=localStorage.getItem("MOBILE_RND_LAST_MODEL_V1");if(last&&modelList().includes(last))currentModel=last;
  populateUploadModels(currentModel);
  const picker=document.getElementById("modelPickerInput"),menu=document.getElementById("modelPickerMenu"),toggle=document.getElementById("modelPickerToggle");
  if(picker){picker.value=currentModel;picker.addEventListener("input",()=>{renderModelPicker(picker.value);openModelPicker()});picker.addEventListener("focus",()=>{renderModelPicker(picker.value);openModelPicker()});picker.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const m=findModel(picker.value);if(m){setModel(m);closeModelPicker()}else toast("Select a valid model.","error")}if(e.key==="Escape")closeModelPicker()})}
  if(toggle)toggle.addEventListener("click",()=>{renderModelPicker("");toggleModelPicker()});
  document.addEventListener("click",e=>{if(!e.target.closest("#modelPickerWrap"))closeModelPicker()});
  const hw=document.getElementById("hardwareChecklistUploadBtn");if(hw)hw.addEventListener("click",()=>openUploadModal("T"));
  renderCategories();renderAll();bindEvents();applyPrefs();refreshUploadedFlags(currentModel);restoreSidebarState();parseHash();
}

function isKoreaMemberFile(record){
  const n=String(record?.filename||"").toLowerCase();
  return n.includes("korea") || n.includes("hq_roster") || n.includes("member_stage") || n.includes("member");
}
function recordStoredFor(model,key,storedMap){
  const primary=storedMap.get(`${model}_${key}`);
  if(key==="T"){
    if(primary && !isKoreaMemberFile(primary)) return primary;
    return storedMap.get(`${model}_U`) || primary;
  }
  if(key==="U"){
    if(primary && isKoreaMemberFile(primary)) return primary;
    const legacy=storedMap.get(`${model}_T`);
    return legacy && isKoreaMemberFile(legacy) ? legacy : (isKoreaMemberFile(primary) ? primary : null);
  }
  return primary;
}

async function renderFileSummary(){ return; }
function renderAll(){renderHero();renderCategories();renderCards();populateUploadRecords(document.getElementById("uploadModel")?.value||currentModel);renderAuth();renderRecent()}
async function refreshUploadedFlags(model=currentModel){
  const items=data[model]?.items||{};
  const keys=RECORD_ORDER.filter(k=>items[k]);
  const baseKeys=[];
  const slotDescriptors=new Map();
  for(const key of keys){
    const item=items[key];
    const slots=[];
    if(Array.isArray(item.mergedSources)){
      item.mergedSources.forEach(src=>slots.push({baseKey:`${model}_${src.key}`,sourceKey:src.key,selectorValue:src.key,name:src.name,detail:src.detail||"",filename:src.filename||"No document uploaded",size:src.size||"—"}));
    }else if(Array.isArray(item.subItems)&&item.subItems.length){
      item.subItems.forEach((sub,i)=>slots.push({baseKey:keyForSubpart(model,key,sub,i),sourceKey:key,selectorValue:String(i),subpartIndex:i,name:sub.name||`File ${i+1}`,detail:sub.note||"",filename:sub.filename||"No document uploaded",size:sub.size||"—"}));
    }else{
      slots.push({baseKey:`${model}_${key}`,sourceKey:key,selectorValue:"",name:item.title,detail:"",filename:key==="T"?"No checklist uploaded":item.filename||"No document uploaded",size:item.size||"—"});
    }
    slotDescriptors.set(key,slots);
    slots.forEach(slot=>baseKeys.push(slot.baseKey));
  }
  const uniqueBaseKeys=[...new Set(baseKeys)];
  const files=await getFiles(uniqueBaseKeys);
  let versionCache=new Map();
  try{versionCache=await listFileVersionsForBases(uniqueBaseKeys)}
  catch(err){console.warn("Version lookup failed",err);versionCache=new Map(uniqueBaseKeys.map(k=>[k,[]]))}
  if(model!==currentModel)return;
  uploadedFiles=new Map();
  uploadedKeys=new Set();
  expandedFileMap=new Map();
  for(const key of keys){
    const slots=slotDescriptors.get(key)||[];
    const entries=slots.map(slot=>{
      const versions=versionCache.get(slot.baseKey)||[];
      const direct=files.get(slot.baseKey);
      let normalizedVersions=versions.map(v=>({
        key:v.key,
        versionLabel:v.versionLabel||"Version",
        filename:v.filename||slot.filename||"Uploaded document",
        size:v.size?formatBytes(v.size):slot.size||"—",
        note:v.note||"",
        updatedAt:v.updatedAt||""
      }));
      if(!normalizedVersions.length && direct){
        normalizedVersions=[{key:slot.baseKey,versionLabel:"Current",filename:direct.filename||slot.filename||"Uploaded document",size:direct.size?formatBytes(direct.size):slot.size||"—",note:direct.note||"",updatedAt:direct.updatedAt||""}];
      }
      const latest=normalizedVersions[normalizedVersions.length-1];
      return {
        ...slot,
        present:normalizedVersions.length>0,
        versions:normalizedVersions,
        versionCount:normalizedVersions.length,
        storageKey:latest?.key||slot.baseKey,
        filename:latest?.filename||slot.filename,
        size:latest?.size||slot.size,
        versionLabel:latest?.versionLabel||"",
        updatedAt:latest?.updatedAt||""
      };
    });
    expandedFileMap.set(key,entries);
    const present=entries.find(x=>x.present);
    if(present) uploadedFiles.set(key,{...present,storageKey:present.storageKey});
    if(entries.some(x=>x.present)) uploadedKeys.add(key);
  }
  renderCards();
}

function subpartId(sub,index){return String(sub?.id||sub?.name||`part-${index+1}`).trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||`part-${index+1}`}
function keyForSubpart(model,key,sub,index){const storageKey=key==="M"?"O":key;return `${model}_${storageKey}_${subpartId(sub,index)}`}
function renderVersionHistory(entry,color){
  if(!entry.present||!entry.versions?.length)return "";
  const rows=[...entry.versions].reverse().map(v=>`<div class="version-row"><span class="version-badge">${escapeHtml(v.versionLabel||"Version")}</span><span class="version-name" title="${escapeHtml(v.filename||"")}">${escapeHtml(v.filename||"Uploaded document")}</span><span class="version-size">${escapeHtml(v.size||"—")}</span><span class="version-note">${escapeHtml(v.note||"")}</span><span class="version-actions"><button type="button" class="mini-file-action" style="--action-color:${color}" data-preview-file="${escapeHtml(v.key)}" data-filename="${escapeHtml(v.filename||"")}" title="Preview"><i class="fa-solid fa-eye"></i></button><button type="button" class="mini-file-action" style="--action-color:${color}" data-download="${escapeHtml(v.key)}" data-filename="${escapeHtml(v.filename||"")}" title="Download"><i class="fa-solid fa-download"></i></button></span></div>`).join("");
  return `<div class="version-history"><div class="version-history-head"><span><i class="fa-solid fa-clock-rotate-left"></i> ${entry.versionCount} version${entry.versionCount===1?"":"s"}</span><span>Latest: ${escapeHtml(entry.versionLabel||"Current")}</span></div>${rows}</div>`;
}

function renderExpandedFiles(key,item){
  const entries=expandedFileMap.get(key)||[];
  if(!entries.length) return `<div class="expanded-empty">No document entries configured.</div>`;
  const color=CATEGORY_COLORS[item.category]||CATEGORY_COLORS.Specification;
  return entries.map(entry=>{
    const actions=entry.present
      ? `<div class="expanded-file-actions"><button class="download-btn" style="background:${color}" data-preview-file="${escapeHtml(entry.storageKey)}" data-filename="${escapeHtml(entry.filename)}"><i class="fa-solid fa-eye"></i> PREVIEW LATEST</button><button class="download-btn" style="background:${color}" data-download="${escapeHtml(entry.storageKey)}" data-filename="${escapeHtml(entry.filename)}"><i class="fa-solid fa-download"></i> DOWNLOAD</button>${isAdmin?`<button class="download-btn hw-upload-btn" style="background:${color}" data-open-upload="${escapeHtml(key)}" data-subpart-index="${escapeHtml(entry.selectorValue??entry.sourceKey??"")}"><i class="fa-solid fa-plus"></i> NEW VERSION</button>`:""}</div>`
      : (isAdmin?`<button class="download-btn hw-upload-btn" style="background:${color}" data-open-upload="${escapeHtml(key)}" data-subpart-index="${escapeHtml(entry.selectorValue??entry.sourceKey??"")}"><i class="fa-solid fa-cloud-arrow-up"></i> UPLOAD</button>`:`<span class="missing-label">ADMIN UPLOAD REQUIRED</span>`);
    const versionSummary=entry.present?`<span class="version-count">${entry.versionCount} version${entry.versionCount===1?"":"s"}</span>`:"";
    return `<div class="expanded-file-row ${entry.present?"is-present":"is-missing"}"><div class="expanded-file-main"><div class="expanded-file-title"><i class="fa-solid ${escapeHtml(entry.present?"fa-file-circle-check":"fa-file-circle-xmark")}"></i><span>${escapeHtml(entry.name)}</span><span class="expanded-status ${entry.present?"present":"missing"}">${entry.present?"PRESENT":"MISSING"}</span>${versionSummary}</div><div class="expanded-file-meta"><span>${escapeHtml(entry.filename)}</span><span>${escapeHtml(entry.size)}</span>${entry.detail?`<span>${escapeHtml(entry.detail)}</span>`:""}</div>${entry.present?renderVersionHistory(entry,color):`<div class="slot-missing-note">No uploaded version for this document.</div>`}</div>${actions}</div>`;
  }).join("");
}

function renderHero(){const m=data[currentModel].meta;document.getElementById("activeModelCode").textContent=currentModel;document.getElementById("activeModelName").textContent=m.name;const modelType=m.modelType||(m.status==="Mass Production"?"Mass Production Model":"Development Model");document.getElementById("modelStatus").innerHTML=`<i class="fa-solid fa-circle"></i> ${escapeHtml(modelType)}`;document.getElementById("metaAp").textContent=m.ap||"—";document.getElementById("metaModelYear").textContent=m.modelYear||"—";document.getElementById("metaSielHwPic").textContent=m.sielHwPic||m.leadKorea||"—";document.getElementById("metaRfNetwork").textContent=m.rfNetwork||m.modem||"—"}
function renderCategories(){
  const tabColors={
    all:"#2563eb",
    Schematics:CATEGORY_COLORS["Schematics"],
    "RF & Wireless":CATEGORY_COLORS["RF & Wireless"],
    "Process & Tech":CATEGORY_COLORS["Process & Tech"],
    "Defect summary & SW process":CATEGORY_COLORS["Defect summary & SW process"],
    Specification:CATEGORY_COLORS.Specification
  };
  document.getElementById("categoryTabs").innerHTML=CATEGORIES.map(c=>`<button class="cat-btn ${activeCategory===c.key?"active":""}" data-cat="${escapeHtml(c.key)}" style="--cat-color:${tabColors[c.key]||"#2563eb"}"><i class="fa-solid ${escapeHtml(c.icon||"fa-folder")}"></i><span>${escapeHtml(c.label)}</span><b class="cat-count">${RECORD_ORDER.filter(k=>currentItems()[k]?.category===c.key).length|| (c.key==="all"?RECORD_ORDER.filter(k=>currentItems()[k]).length:0)}</b></button>`).join("")
}
function ensureSchematicCardsVisible(){
  const items=currentItems();
  const defaults=createDefaultData()[currentModel]?.items||{};
  for(const key of ["A","B","C"]){
    if(!items[key]) items[key]=clone(defaults[key]);
    items[key].title=defaults[key].title;
    items[key].category="Schematics";
    items[key].icon=defaults[key].icon;
    items[key].tags=clone(defaults[key].tags||[]);
  }
}

function filteredEntries(){let arr=RECORD_ORDER.map(k=>[k,currentItems()[k]]).filter(([,i])=>i).filter(([k,i])=>{const cat=activeCategory==="all"||i.category===activeCategory;const fav=!favoritesOnly||favorites.includes(`${currentModel}:${k}`);return cat&&fav&&(!query||itemText(k,i).includes(query.toLowerCase()))});if(sortMode==="title")arr.sort((a,b)=>a[1].title.localeCompare(b[1].title));if(sortMode==="category")arr.sort((a,b)=>a[1].category.localeCompare(b[1].category)||a[0].localeCompare(b[0]));if(sortMode==="favorite")arr.sort((a,b)=>Number(favorites.includes(`${currentModel}:${b[0]}`))-Number(favorites.includes(`${currentModel}:${a[0]}`)));return arr}
function renderCards(){
  ensureSchematicCardsVisible();
  const grid=document.getElementById("cardsGrid"),entries=filteredEntries(),total=RECORD_ORDER.filter(k=>currentItems()[k]).length;
  const groupView=activeCategory!=="all";
  document.body.dataset.recordView=groupView?"group":"all";
  document.body.dataset.activeRecordCategory=activeCategory;
  document.getElementById("recordCount").textContent=groupView?`${entries.length} records • Full detail view`:`${entries.length} of ${total} records • Compact view`;
  const hasSecondaryFilters=Boolean(query||favoritesOnly||sortMode!=="default");
  document.getElementById("activeFilters").classList.toggle("hidden",!hasSecondaryFilters);
  document.getElementById("activeFilters").innerHTML=`${query?`<span class="filter-chip">Search: ${escapeHtml(query)}</span>`:""}${favoritesOnly?`<span class="filter-chip">Favorites only</span>`:""}${sortMode!=="default"?`<span class="filter-chip">Sort: ${escapeHtml(sortMode)}</span>`:""}`;
    grid.innerHTML=entries.map(([k,i])=>renderCard(k,i)).join("") || `<div class="empty-state"><i class="fa-solid fa-filter-circle-xmark"></i><h3 class="font-bold mt-3">No records found</h3><p class="text-xs mt-1">Adjust the search or filters.</p><button class="btn btn-light mt-3" data-clear-filters>Clear filters</button></div>`;
}
function renderCard(key,item){
  const color=CATEGORY_COLORS[item.category]||CATEGORY_COLORS.Specification;
  const favKey=`${currentModel}:${key}`,isFav=favorites.includes(favKey);
  const entries=expandedFileMap.get(key)||[];
  const presentCount=entries.filter(x=>x.present).length;
  const totalSlots=entries.length;
  const versionTotal=entries.reduce((sum,x)=>sum+(x.versionCount||0),0);
  const groupView=activeCategory!=="all";
  const expanded=groupView||expandedCards.has(key);
  const statusClass=presentCount===0?"all-missing":presentCount===totalSlots?"all-present":"partial";
  const statusText=presentCount===0?"DOCUMENTS MISSING":presentCount===totalSlots?"DOCUMENTS PRESENT":"DOCUMENTS PARTIAL";
  const summary=entries.length
    ? `${presentCount}/${totalSlots} document${totalSlots===1?"":"s"} present · ${versionTotal} version${versionTotal===1?"":"s"}`
    : "No document slots configured";
  const detail=expanded?`<div class="record-expanded-panel">
    <div class="record-detail-summary">
      <div><span class="detail-label">STATUS</span><strong class="${statusClass}">${escapeHtml(statusText)}</strong></div>
      <div><span class="detail-label">DOCUMENTS</span><strong>${presentCount}/${totalSlots}</strong></div>
      <div><span class="detail-label">VERSIONS</span><strong>${versionTotal}</strong></div>
    </div>
    <div class="expanded-file-list">${renderExpandedFiles(key,item)}</div>
    <div class="expanded-footer">
      <button class="text-action primary" data-preview-record="${escapeHtml(key)}"><i class="fa-solid fa-eye"></i> Preview</button>
      <button class="text-action" data-copy-record="${escapeHtml(key)}"><i class="fa-regular fa-copy"></i> Copy details</button>
      <button class="text-action" data-link-record="${escapeHtml(key)}"><i class="fa-solid fa-link"></i> Copy link</button>
    </div>
  </div>`:"";
  return `<article id="record-${escapeHtml(key)}" class="record-card ${expanded?"is-expanded":""} ${groupView?"is-group-view":""} ${isFav?"is-favorite":""}" style="--record-accent:${color}" data-record="${escapeHtml(key)}" tabindex="0" aria-expanded="${expanded}">
    <div class="record-stripe" style="background:${color}"></div>
    <div class="record-collapsed-face">
      <div class="record-icon" style="background:${color}"><i class="fa-solid ${escapeHtml(item.icon)}"></i></div>
      <div class="record-card-identity">
        <div class="record-title-only" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="record-card-subtitle">${escapeHtml(item.category)} · ${escapeHtml(summary)}</div>
      </div>
      <div class="record-status ${statusClass}"><span class="status-dot ${presentCount?"present":"missing"}"></span><span>${escapeHtml(statusText)}</span></div>
      <button class="favorite-btn ${isFav?"active":""}" data-favorite="${escapeHtml(favKey)}" title="Favorite" aria-label="Favorite"><i class="fa-${isFav?"solid":"regular"} fa-star"></i></button>
      <span class="expand-cue"><i class="fa-solid fa-chevron-down"></i></span>
    </div>
    <div class="record-card-actions">
      <button type="button" class="card-action card-preview-action" data-preview-record="${escapeHtml(key)}"><i class="fa-solid fa-eye"></i><span>Preview</span></button>
      ${presentCount?`<button type="button" class="card-action" data-download-latest="${escapeHtml(key)}"><i class="fa-solid fa-download"></i><span>Download</span></button>`:""}
      ${isAdmin?`<button type="button" class="card-action" data-open-upload="${escapeHtml(key)}" data-subpart-index=""><i class="fa-solid fa-cloud-arrow-up"></i><span>Upload</span></button>`:""}
    </div>
    ${detail}
  </article>`;
}

async function previewRecord(key){
  const item=currentItems()?.[key];
  if(!item)return;
  const entries=expandedFileMap.get(key)||[];
  const title=document.getElementById("filePreviewTitle");
  const meta=document.getElementById("filePreviewMeta");
  const body=document.getElementById("filePreviewBody");
  if(!body)return;
  const previousUrl=body.dataset.objectUrl;
  if(previousUrl)URL.revokeObjectURL(previousUrl);
  delete body.dataset.objectUrl;
  const color=CATEGORY_COLORS[item.category]||CATEGORY_COLORS.Specification;
  title.textContent=`${item.title} — Preview`;
  meta.textContent=`${currentModel} · ${item.category} · ${entries.filter(x=>x.present).length}/${entries.length} documents present`;
  body.innerHTML=`<div class="record-preview-workspace">
    <aside class="record-preview-info">
      <div class="preview-section-title">RECORD INFORMATION</div>
      <div class="preview-info-grid">
        <span>Model</span><strong>${escapeHtml(currentModel)}</strong>
        <span>Record</span><strong>${escapeHtml(key)}</strong>
        <span>Category</span><strong>${escapeHtml(item.category)}</strong>
        <span>Status</span><strong>${escapeHtml(item.status||"Engineering record")}</strong>
        <span>Documents</span><strong>${entries.filter(x=>x.present).length} / ${entries.length}</strong>
        <span>Versions</span><strong>${entries.reduce((n,x)=>n+(x.versionCount||0),0)}</strong>
      </div>
      <div class="preview-section-title">FILES</div>
      <div class="preview-file-list">
        ${entries.length?entries.map((entry,i)=>`<button type="button" class="preview-file-item ${entry.present?"present":"missing"}" data-preview-slot="${i}">
          <span class="preview-file-icon"><i class="fa-solid ${entry.present?"fa-file-circle-check":"fa-file-circle-xmark"}"></i></span>
          <span class="preview-file-copy"><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.present?entry.filename:"No uploaded document")}</small></span>
          <span class="preview-file-state">${entry.present?escapeHtml(entry.size):"MISSING"}</span>
        </button>`).join(""):"<div class='preview-empty'>No document slots configured.</div>"}
      </div>
      <div class="preview-bottom-actions">
        <button type="button" class="btn btn-dark" id="previewDownloadAll"><i class="fa-solid fa-download"></i> Download All Files</button>
      </div>
    </aside>
    <section class="record-preview-viewer">
      <div class="preview-viewer-head"><span id="previewViewerLabel">Select a file</span><span id="previewViewerMeta">Preview</span></div>
      <div id="previewViewerCanvas" class="preview-viewer-canvas"><div class="preview-placeholder"><i class="fa-solid fa-eye"></i><strong>Select a file from the list</strong><span>Preview is isolated from the dashboard card so the card layout remains stable.</span></div></div>
    </section>
  </div>`;
  document.getElementById("filePreviewModal")?.classList.remove("hidden");
  document.getElementById("previewDownloadAll")?.addEventListener("click",()=>downloadAllRecordFiles(key));
  body.querySelectorAll("[data-preview-slot]").forEach(btn=>btn.addEventListener("click",()=>previewRecordSlot(key,Number(btn.dataset.previewSlot))));
  const firstPresent=entries.findIndex(x=>x.present);
  if(firstPresent>=0)await previewRecordSlot(key,firstPresent);
}

async function previewRecordSlot(key,index){
  const entries=expandedFileMap.get(key)||[];
  const entry=entries[index];
  const canvas=document.getElementById("previewViewerCanvas");
  const label=document.getElementById("previewViewerLabel");
  const meta=document.getElementById("previewViewerMeta");
  if(!canvas||!entry)return;
  document.querySelectorAll(".preview-file-item").forEach((el,i)=>el.classList.toggle("active",i===index));
  if(!entry.present){label.textContent=entry.name;meta.textContent="No uploaded file";canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-file-circle-xmark"></i><strong>No file uploaded</strong><span>This document slot is currently missing.</span></div>`;return;}
  try{
    const record=await getFile(entry.storageKey);
    if(!record?.blob){canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><strong>Stored binary unavailable</strong><span>The document metadata exists but the binary is not available.</span></div>`;return;}
    const name=record.filename||entry.filename||"document",ext=name.split(".").pop().toLowerCase(),url=URL.createObjectURL(record.blob);
    const body=document.getElementById("filePreviewBody");const previous=body?.dataset?.objectUrl;if(previous)URL.revokeObjectURL(previous);if(body)body.dataset.objectUrl=url;
    label.textContent=name;meta.textContent=`${entry.versionLabel||"Latest"} · ${entry.size||formatBytes(record.size||record.blob.size)}`;
    if(record.blob.type?.startsWith("image/")||["png","jpg","jpeg","webp","gif","svg"].includes(ext))canvas.innerHTML=`<img class="record-preview-image" src="${url}" alt="${escapeHtml(name)}">`;
    else if(record.blob.type==="application/pdf"||ext==="pdf")canvas.innerHTML=`<iframe class="record-preview-frame" src="${url}" title="PDF preview"></iframe>`;
    else if(record.blob.type?.startsWith("text/")||["csv","txt","log","md"].includes(ext)){const text=await record.blob.text();canvas.innerHTML=`<pre class="record-preview-text">${escapeHtml(text.slice(0,250000))}</pre>`;}
    else canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-file-lines"></i><strong>${escapeHtml(ext.toUpperCase()||"FILE")} document</strong><span>Browser preview is unavailable for this file type.</span><button type="button" class="btn btn-dark" id="previewSelectedDownload"><i class="fa-solid fa-download"></i> Download File</button></div>`;
    document.getElementById("previewSelectedDownload")?.addEventListener("click",()=>downloadRecord(entry.storageKey,name));
  }catch(err){console.error("Record preview failed",err);canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><strong>Preview failed</strong><span>Use Download File to open the original document.</span></div>`}
}

async function downloadAllRecordFiles(key){
  const entries=expandedFileMap.get(key)||[];
  const present=entries.filter(x=>x.present);
  if(!present.length){toast("No uploaded files are available for this record.","info");return;}
  for(const entry of present){await downloadRecord(entry.storageKey,entry.filename);}
  toast(`${present.length} file${present.length===1?"":"s"} queued for download.`,"success");
}

async function downloadLatestForRecord(key){
  const entry=(expandedFileMap.get(key)||[]).find(x=>x.present);
  if(entry) await downloadRecord(entry.storageKey,entry.filename);
}

function renderAuth(){const slot=document.getElementById("adminAuthSlot");slot.innerHTML=isAdmin?`<div class="flex gap-1"><button id="uploadBtn" class="btn btn-cyan"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</button><button id="addModelBtn" class="btn btn-dark"><i class="fa-solid fa-plus"></i> Model</button><button id="editModelBtn" class="btn btn-dark"><i class="fa-solid fa-pen-to-square"></i> Edit</button><button id="logoutBtn" class="header-icon-btn" title="Logout"><i class="fa-solid fa-right-from-bracket"></i></button></div>`:`<button id="loginBtn" class="btn btn-dark"><i class="fa-solid fa-lock"></i> Admin • Shivam</button>`;document.getElementById(isAdmin?"uploadBtn":"loginBtn").addEventListener("click",()=>isAdmin?openUploadModal():openModal("loginModal"));if(isAdmin)document.getElementById("addModelBtn")?.addEventListener("click",openAddModelModal);document.getElementById("editModelBtn")?.addEventListener("click",openEditModelModal);if(isAdmin)document.getElementById("logoutBtn").addEventListener("click",()=>{isAdmin=false;sessionStorage.removeItem(AUTH_KEY);renderAuth();renderCards();document.dispatchEvent(new Event("rnd-auth-changed"));toast("Admin session ended.","info")})}
function populateUploadModels(selected=currentModel){const el=document.getElementById("uploadModel");if(!el)return;el.innerHTML=modelList().map(m=>`<option value="${m}">${m} • ${escapeHtml(data[m].meta.name)}</option>`).join("");el.value=modelList().includes(selected)?selected:currentModel;populateUploadRecords(el.value)}
function populateUploadRecords(model=document.getElementById("uploadModel")?.value||currentModel,preferredKey=""){
  const el=document.getElementById("uploadRecord");if(!el)return;
  const items=data[model]?.items||{};
  el.innerHTML=RECORD_ORDER.filter(k=>items[k]).map(k=>`<option value="${k}">[${k}] ${escapeHtml(items[k].title)}</option>`).join("");
  if(preferredKey&&items[preferredKey])el.value=preferredKey;
  updateSubpartSelector();
}
function updateSubpartSelector(preferredIndex=""){
  const model=document.getElementById("uploadModel")?.value||currentModel,key=document.getElementById("uploadRecord")?.value,wrap=document.getElementById("uploadSubPartWrap"),el=document.getElementById("uploadSubPart");
  if(!wrap||!el)return;
  const item=data[model]?.items?.[key],sources=Array.isArray(item?.mergedSources)?item.mergedSources:[],subs=Array.isArray(item?.subItems)?item.subItems:[];
  if(!sources.length&&!subs.length){wrap.classList.add("hidden");el.innerHTML="";return}
  const options=sources.length?sources.map(s=>({value:s.key,label:s.name,filename:s.filename})):subs.map((s,i)=>({value:String(i),label:s.name||`File ${i+1}`,filename:s.filename}));
  wrap.classList.remove("hidden");
  el.innerHTML=options.map(o=>`<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}${o.filename?` • ${escapeHtml(o.filename)}`:""}</option>`).join("");
  if(preferredIndex!==""&&options.some(o=>String(o.value)===String(preferredIndex)))el.value=String(preferredIndex);
}
function openUploadModal(recordKey="",subpartIndex=""){if(!isAdmin){toast("Admin authentication is required to upload documents.","error");return}const model=currentModel;populateUploadModels(model);populateUploadRecords(model,recordKey);updateSubpartSelector(subpartIndex);resetSelectedFile();openModal("uploadModal")}

function resetSelectedFile(){selectedFiles=[];const input=document.getElementById("fileInput");if(input)input.value="";const name=document.getElementById("fileName");if(name)name.textContent="Drop files here or click to browse";const status=document.getElementById("uploadStatus");if(status)status.textContent="";const rev=document.getElementById("uploadRevision");if(rev)rev.value="";const note=document.getElementById("uploadNote");if(note)note.value=""}

function openModal(id){document.getElementById(id)?.classList.remove("hidden")}
function closeModal(id){document.getElementById(id)?.classList.add("hidden");if(id==="filePreviewModal"){const body=document.getElementById("filePreviewBody");const url=body?.dataset?.objectUrl;if(url)URL.revokeObjectURL(url);if(body){delete body.dataset.objectUrl;body.innerHTML=""}}if(id==="uploadModal")resetSelectedFile()}
function findModel(value){const v=String(value||"").trim().toUpperCase();return modelList().find(m=>m===v)||modelList().find(m=>m.toUpperCase()===v)||null}
function renderModelPicker(filter=""){const menu=document.getElementById("modelPickerMenu");if(!menu)return;const q=String(filter||"").trim().toLowerCase(),matches=modelList().filter(m=>!q||m.toLowerCase().includes(q)||data[m].meta.name.toLowerCase().includes(q));menu.innerHTML=`<div class="model-picker-label"><i class="fa-solid fa-list-check"></i><span>Select Model</span></div>`+(matches.length?matches.map(m=>`<button type="button" class="model-picker-option ${m===currentModel?"active":""}" data-picker-model="${m}" role="option" aria-selected="${m===currentModel}"><span class="model-picker-code">${m}</span><span class="model-picker-name">${escapeHtml(data[m].meta.name)}</span></button>`).join(""):`<div class="model-picker-empty">No model found</div>`);menu.querySelectorAll("[data-picker-model]").forEach(b=>b.addEventListener("click",()=>{setModel(b.dataset.pickerModel);closeModelPicker()}))}
function openModelPicker(){const m=document.getElementById("modelPickerMenu"),i=document.getElementById("modelPickerInput");if(m){m.classList.remove("hidden");i?.setAttribute("aria-expanded","true")}}
function closeModelPicker(){const m=document.getElementById("modelPickerMenu"),i=document.getElementById("modelPickerInput");if(m){m.classList.add("hidden");i?.setAttribute("aria-expanded","false")}}
function toggleModelPicker(){const m=document.getElementById("modelPickerMenu");if(m?.classList.contains("hidden"))openModelPicker();else closeModelPicker()}
function setModel(m){if(!modelList().includes(m))return;expandedCards.clear();currentModel=m;localStorage.setItem("MOBILE_RND_LAST_MODEL_V1",m);activeCategory="all";query="";if(document.getElementById("engineeringSearch"))document.getElementById("engineeringSearch").value="";favoritesOnly=false;sortMode="default";populateUploadModels(m);renderAll();refreshUploadedFlags(m);const picker=document.getElementById("modelPickerInput");if(picker)picker.value=currentModel;renderModelPicker("");location.hash="";window.scrollTo({top:0,behavior:prefs.motion?"smooth":"auto"})}
function openRecord(key){
  const item=currentItems()?.[key];
  if(!item)return;
  expandedCards.add(key);
  markRecent(key);
  // Summary tiles must always reach their card, even when filters/search are active.
  activeCategory="all";
  query="";
  if(document.getElementById("engineeringSearch"))document.getElementById("engineeringSearch").value="";
  favoritesOnly=false;
  sortMode="default";
  renderAll();
  location.hash=`record/${currentModel}/${key}`;
  renderRecent();
  requestAnimationFrame(()=>focusRecord(key));
}
function focusRecord(key){const el=document.getElementById(`record-${key}`);if(el){el.scrollIntoView({behavior:prefs.motion?"smooth":"auto",block:"center"});el.classList.add("record-focus");setTimeout(()=>el.classList.remove("record-focus"),1200)}}
function renderRecent(){const wrap=document.getElementById("recentList");if(!wrap)return;const items=recentlyViewed.map(id=>{const [m,k]=id.split(":");const item=currentItemsFor(m)[k];return item?{m,k,item}:null}).filter(Boolean);wrap.innerHTML=items.length?items.map(x=>`<button class="recent-item" data-recent-model="${x.m}" data-recent-key="${x.k}"><span>${x.m} · ${x.k}</span><strong>${escapeHtml(x.item.title)}</strong></button>`).join(""):"<span class='help-text'>No recently viewed records.</span>"}

function bindEvents(){
  const engineeringTabsToggle=document.getElementById("engineeringTabsToggle"),engineeringTabsRow=document.getElementById("engineeringRecordsTabsRow"),engineeringTabsHidden=false;
  const applyEngineeringTabsState=(hidden)=>{
    engineeringTabsRow?.classList.toggle("tabs-hidden",hidden);
    engineeringTabsToggle?.setAttribute("aria-expanded",String(!hidden));
    if(engineeringTabsToggle)engineeringTabsToggle.innerHTML=`<i class="fa-solid fa-eye${hidden?"":"-slash"}"></i><span>${hidden?"Show Tabs":"Hide Tabs"}</span>`;
    engineeringTabsToggle?.setAttribute("title",hidden?"Show Engineering Records category tabs":"Hide Engineering Records category tabs");
  };
  applyEngineeringTabsState(engineeringTabsHidden);
  document.getElementById("sidebarCollapseBtn")?.addEventListener("click",()=>{document.body.classList.toggle("sidebar-collapsed");const collapsed=document.body.classList.contains("sidebar-collapsed");localStorage.setItem("MOBILE_RND_SIDEBAR_V1",collapsed?"collapsed":"expanded");document.getElementById("sidebarCollapseBtn").innerHTML=`<i class="fa-solid fa-angles-${collapsed?"right":"left"}"></i>`});
  document.getElementById("categoryTabs").addEventListener("click",e=>{const b=e.target.closest("[data-cat]");if(b){activeCategory=b.dataset.cat;expandedCards.clear();renderCategories();renderCards()}});
  document.getElementById("cardsGrid").addEventListener("click",e=>{
    const up=e.target.closest("[data-open-upload]");if(up){openUploadModal(up.dataset.openUpload,up.dataset.subpartIndex||"");return}
    const fav=e.target.closest("[data-favorite]");if(fav){toggleFavorite(fav.dataset.favorite);return}
    const previewRecordBtn=e.target.closest("[data-preview-record]");if(previewRecordBtn){previewRecord(previewRecordBtn.dataset.previewRecord);return}
    const preview=e.target.closest("[data-preview-file]");if(preview){previewStoredFile(preview.dataset.previewFile,preview.dataset.filename);return}
    const latest=e.target.closest("[data-download-latest]");if(latest){downloadLatestForRecord(latest.dataset.downloadLatest);return}
    const d=e.target.closest("[data-download]");if(d){downloadRecord(d.dataset.download,d.dataset.filename);return}
    const o=e.target.closest("[data-open-record]");if(o){openRecord(o.dataset.openRecord);openPresentation(o.dataset.openRecord);return}
    const c=e.target.closest("[data-copy-record]");if(c){copyRecord(c.dataset.copyRecord);return}
    const l=e.target.closest("[data-link-record]");if(l){copyLink(l.dataset.linkRecord);return}
    const clr=e.target.closest("[data-clear-filters]");if(clr){clearFilters();return}
    const card=e.target.closest(".record-card");
    if(card&&!e.target.closest("button,a,input,select,textarea")){const key=card.dataset.record;if(expandedCards.has(key))expandedCards.delete(key);else expandedCards.add(key);renderCards();requestAnimationFrame(()=>document.getElementById(`record-${key}`)?.scrollIntoView({behavior:prefs.motion?"smooth":"auto",block:"nearest"}));}
  });
  document.getElementById("cardsGrid").addEventListener("keydown",e=>{const card=e.target.closest(".record-card");if(card&&(e.key==="Enter"||e.key===" ")&&!e.target.closest("button,input,select,textarea")){e.preventDefault();const key=card.dataset.record;if(expandedCards.has(key))expandedCards.delete(key);else expandedCards.add(key);renderCards();}});
  document.getElementById("copySpecsBtn").addEventListener("click",copySpecs);document.getElementById("exportJsonBtn").addEventListener("click",exportModel);document.getElementById("exportReportBtn").addEventListener("click",exportReport);document.getElementById("settingsBtn").addEventListener("click",openSettings);document.getElementById("themeBtn").addEventListener("click",()=>{prefs.theme=prefs.theme==="dark"?"light":"dark";savePrefs();draftPrefs={...prefs};applyPrefs()});document.getElementById("fullscreenBtn").addEventListener("click",toggleFullscreen);
  ["themeSelect","accentSelect","densitySelect","motionToggle"].forEach(id=>document.getElementById(id)?.addEventListener("change",syncDraftPrefs));
  document.getElementById("settingsApplyBtn")?.addEventListener("click",()=>applyDraftPrefs(false));document.getElementById("settingsOkBtn")?.addEventListener("click",()=>{applyDraftPrefs(true)});
  document.getElementById("engineeringSearch")?.addEventListener("input",e=>{query=e.target.value.trim().toLowerCase();renderCards()});
  document.getElementById("sortSelect").addEventListener("change",e=>{sortMode=e.target.value;renderCards()});document.getElementById("favoritesToggle").addEventListener("click",()=>{favoritesOnly=!favoritesOnly;document.getElementById("favoritesToggle").classList.toggle("active",favoritesOnly);renderCards()});document.getElementById("clearFiltersBtn").addEventListener("click",clearFilters);
  document.getElementById("prevRecordBtn").addEventListener("click",()=>navigateRecord(-1));document.getElementById("nextRecordBtn").addEventListener("click",()=>navigateRecord(1));document.getElementById("presentationBtn").addEventListener("click",()=>{const k=filteredEntries()[0]?.[0];if(k)openPresentation(k)});
  document.getElementById("recentList").addEventListener("click",e=>{const b=e.target.closest("[data-recent-key]");if(b){setModel(b.dataset.recentModel);setTimeout(()=>openRecord(b.dataset.recentKey),50)}});
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.close)));document.querySelectorAll(".modal-backdrop").forEach(b=>b.addEventListener("click",()=>closeModal(b.parentElement.id)));
  document.getElementById("loginForm").addEventListener("submit",login);document.getElementById("addModelForm")?.addEventListener("submit",addModel);document.getElementById("editModelSelect")?.addEventListener("change",e=>loadEditModelFields(e.target.value));
  const passwordToggle=document.getElementById("passwordToggle");
  passwordToggle?.addEventListener("click",()=>{const input=document.getElementById("passwordInput"); const showing=input.type==="text"; input.type=showing?"password":"text"; passwordToggle.innerHTML=showing?'<i class="fa-solid fa-eye"></i>':'<i class="fa-solid fa-eye-slash"></i>'; passwordToggle.setAttribute("aria-label",showing?"Show password":"Hide password"); passwordToggle.title=showing?"Show password":"Hide password"});
  document.getElementById("uploadModel").addEventListener("change",e=>{populateUploadRecords(e.target.value);const first=document.getElementById("uploadRecord")?.value;if(first)document.getElementById("uploadRecord").value=first;updateSubpartSelector()});document.getElementById("uploadRecord").addEventListener("change",()=>updateSubpartSelector());
  document.getElementById("dropZone").addEventListener("click",()=>document.getElementById("fileInput").click());document.getElementById("dropZone").addEventListener("dragover",e=>{e.preventDefault();document.getElementById("dropZone").classList.add("drag-active")});document.getElementById("dropZone").addEventListener("dragleave",()=>document.getElementById("dropZone").classList.remove("drag-active"));document.getElementById("dropZone").addEventListener("drop",e=>{e.preventDefault();document.getElementById("dropZone").classList.remove("drag-active");selectFiles(e.dataTransfer.files)});document.getElementById("fileInput").addEventListener("change",e=>selectFiles(e.target.files));document.getElementById("uploadForm").addEventListener("submit",upload);
  document.getElementById("backupBtn").addEventListener("click",()=>downloadText(JSON.stringify(data,null,2),`MobileRD_Backup_${dateStamp()}.json`));document.getElementById("resetBtn").addEventListener("click",resetData);
  document.addEventListener("keydown",e=>{const tag=document.activeElement?.tagName||"",typing=/INPUT|TEXTAREA|SELECT/.test(tag);if(e.key==="Escape")document.querySelectorAll(".modal:not(.hidden)").forEach(m=>m.classList.add("hidden"));if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();document.getElementById("engineeringSearch")?.focus();return}if(e.key==="/"&&!typing){e.preventDefault();document.getElementById("engineeringSearch")?.focus();return}if(e.key.toLowerCase()==="f"&&!typing)toggleFullscreen();if(e.key.toLowerCase()==="p"&&!typing){e.preventDefault();document.getElementById("presentationBtn").click()}if((e.key==="ArrowLeft"||e.key==="ArrowRight")&&!typing&&!document.querySelector(".modal:not(.hidden)")){navigateRecord(e.key==="ArrowLeft"?-1:1)}});
}
function syncDraftPrefs(){draftPrefs={theme:document.getElementById("themeSelect").value,accent:document.getElementById("accentSelect").value,density:document.getElementById("densitySelect").value,motion:document.getElementById("motionToggle").checked}}
function openSettings(){draftPrefs={...prefs};applySettingsForm();openModal("settingsModal")}
function applySettingsForm(){document.getElementById("themeSelect").value=draftPrefs.theme;document.getElementById("accentSelect").value=draftPrefs.accent;document.getElementById("densitySelect").value=draftPrefs.density;document.getElementById("motionToggle").checked=draftPrefs.motion}
function applyDraftPrefs(closeAfter){syncDraftPrefs();prefs={...draftPrefs};savePrefs();applyPrefs();if(closeAfter)closeModal("settingsModal")}
function applyPrefs(){document.body.classList.toggle("no-motion",!prefs.motion);document.body.dataset.theme=prefs.theme;document.body.dataset.accent=prefs.accent;document.body.dataset.density=prefs.density;applySettingsForm();document.getElementById("themeIcon").className=`fa-solid fa-${prefs.theme==="dark"?"sun":"moon"}`}
function clearFilters(){query="";activeCategory="all";favoritesOnly=false;sortMode="default";document.getElementById("sortSelect").value="default";document.getElementById("engineeringSearch")?.setAttribute("value","");if(document.getElementById("engineeringSearch"))document.getElementById("engineeringSearch").value="";document.getElementById("favoritesToggle").classList.remove("active");renderCategories();renderCards()}
function toggleFavorite(id){favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];localStorage.setItem("MOBILE_RND_FAVORITES_V1",JSON.stringify(favorites));renderCards();toast(favorites.includes(id)?"Added to favorites.":"Removed from favorites.","info")}
async function toggleFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{toast("Fullscreen is not available.","error")}}
function customModels(){return readJson(CUSTOM_MODELS_KEY,[]).filter(x=>x&&x.code&&data[x.code])}
function editableModels(){return modelList()}
function openAddModelModal(){if(!isAdmin){toast("Admin authentication is required.","error");return}setModelAdminFormMode("add");document.getElementById("addModelForm")?.reset();document.getElementById("addModelError")?.classList.add("hidden");openModal("addModelModal")}
function openEditModelModal(){if(!isAdmin){toast("Admin authentication is required.","error");return}const models=editableModels();if(!models.length){toast("No editable model is available.","info");return}setModelAdminFormMode("edit");populateEditModelSelect(models[0]);openModal("addModelModal")}
function setModelAdminFormMode(mode){const edit=mode==="edit",title=document.getElementById("addModelTitle"),desc=document.querySelector("#addModelModal .modal-description"),submit=document.getElementById("addModelSubmit"),icon=document.querySelector("#addModelModal .modal-icon i"),wrap=document.getElementById("editModelSelectWrap"),code=document.getElementById("newModelCode"),help=document.getElementById("addModelHelp");if(title)title.textContent=edit?"Edit Existing Model":"Add New Model";if(desc)desc.textContent=edit?"Admin-only model update. Model code can be changed safely and associated stored files are migrated.":"Admin-only model registration. New models appear automatically in the model selector.";if(submit)submit.innerHTML=edit?'<i class="fa-solid fa-floppy-disk"></i> Save Updated Model':'<i class="fa-solid fa-plus"></i> Add Model';if(icon)icon.className=`fa-solid ${edit?"fa-pen-to-square":"fa-square-plus"}`;wrap?.classList.toggle("hidden",!edit);if(code)code.readOnly=false;const del=document.getElementById("deleteModelBtn");if(del){del.classList.toggle("hidden",!edit);del.onclick=deleteSelectedModel;}if(help)help.innerHTML=edit?'<i class="fa-solid fa-database"></i> Model code is editable. Stored document/version keys are migrated automatically.':'<i class="fa-solid fa-database"></i> Model registration is stored locally in this browser and survives page reloads.';["newModelName","newModelProcessor","newModelYear","newModelPic","newModelRf","newModelType"].forEach(id=>document.getElementById(id)?.toggleAttribute("required",!edit||id!=="newModelPic"));document.getElementById("addModelForm")?.setAttribute("data-mode",mode)}
function populateEditModelSelect(selected=""){const el=document.getElementById("editModelSelect");if(!el)return;const models=editableModels();el.innerHTML=models.map(code=>`<option value="${escapeHtml(code)}">${escapeHtml(code)} • ${escapeHtml(data[code]?.meta?.name||code)}</option>`).join("");if(selected&&models.includes(selected))el.value=selected;loadEditModelFields(el.value)}
function loadEditModelFields(code){const model=data[code];if(!model)return;document.getElementById("newModelCode").value=code;document.getElementById("newModelName").value=model.meta?.name||"";document.getElementById("newModelProcessor").value=model.meta?.ap||"";document.getElementById("newModelYear").value=model.meta?.modelYear||"";document.getElementById("newModelPic").value=model.meta?.sielHwPic||model.meta?.leadKorea||"";document.getElementById("newModelRf").value=model.meta?.rfNetwork||model.meta?.modem||"";document.getElementById("newModelType").value=model.meta?.modelType||(model.meta?.status==="Mass Production"?"Mass Production Model":"Development Model")}
async function addModel(e){
  e.preventDefault();if(!isAdmin)return;
  const form=document.getElementById("addModelForm"),mode=form?.dataset.mode||"add",oldCode=document.getElementById("editModelSelect")?.value||"",code=document.getElementById("newModelCode").value.trim().toUpperCase(),name=document.getElementById("newModelName").value.trim(),processor=document.getElementById("newModelProcessor").value.trim(),modelYear=document.getElementById("newModelYear").value.trim(),pic=document.getElementById("newModelPic").value.trim(),rf=document.getElementById("newModelRf").value.trim(),modelType=document.getElementById("newModelType").value,err=document.getElementById("addModelError");
  const fail=msg=>{err.textContent=msg;err.classList.remove("hidden")};
  if(!/^[A-Z][A-Z0-9_-]{1,23}$/.test(code))return fail("Use a valid model code (2–24 characters, letters/numbers/_/-). ");
  if(!name||!processor||!modelYear||!rf||!["Development Model","Mass Production Model"].includes(modelType)||(mode!=="edit"&&!pic))return fail("Complete all required model information fields.");
  if(mode==="edit"){
    if(!oldCode||!modelList().includes(oldCode)||!data[oldCode])return fail("Select a valid existing model to edit.");
    if(code!==oldCode&&modelList().includes(code))return fail("That model code already exists. Choose another code.");
    const model=data[oldCode];model.meta={...model.meta,name,ap:processor,modelYear,sielHwPic:pic,rfNetwork:rf,modem:rf,leadKorea:pic,modelType,status:modelType==="Mass Production Model"?"Mass Production":"Development"};
    if(code!==oldCode){
      data[code]=model;delete data[oldCode];
      const custom=readJson(CUSTOM_MODELS_KEY,[]),idx=custom.findIndex(x=>x.code===oldCode);if(idx>=0)custom[idx]={...custom[idx],code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType};else custom.push({code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});
      const renamed=renamedModelMap();if(MODEL_ORDER.includes(oldCode))renamed[oldCode]=code;
      await migrateFilePrefix(oldCode,code);
      if(currentModel===oldCode){currentModel=code;localStorage.setItem("MOBILE_RND_LAST_MODEL_V1",code)}
      localStorage.setItem(CUSTOM_MODELS_KEY,JSON.stringify(custom));if(MODEL_ORDER.includes(oldCode))localStorage.setItem(RENAMED_MODELS_KEY,JSON.stringify(renamed));
      saveData();closeModal("addModelModal");populateUploadModels(currentModel);renderAll();renderModelPicker("");const picker=document.getElementById("modelPickerInput");if(picker)picker.value=currentModel;toast(`${oldCode} renamed to ${code} and stored document keys migrated.`,'success');addAudit("MODEL_RENAME",{from:oldCode,to:code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});return;
    }
    const custom=readJson(CUSTOM_MODELS_KEY,[]),idx=custom.findIndex(x=>x.code===oldCode);if(idx>=0)custom[idx]={...custom[idx],code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType};else custom.push({code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});localStorage.setItem(CUSTOM_MODELS_KEY,JSON.stringify(custom));saveData();closeModal("addModelModal");populateUploadModels(currentModel);renderAll();renderModelPicker("");toast(`${code} model details updated.`,'success');addAudit("MODEL_EDIT",{model:code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});return;
  }
  if(modelList().includes(code))return fail("This model code already exists. Use Edit Model to update its details.");
  const defaults=createDefaultData().A576,model=clone(defaults);model.meta={...model.meta,name,ap:processor,modelYear,sielHwPic:pic,rfNetwork:rf,modem:rf,leadKorea:pic,modelType,status:modelType==="Mass Production Model"?"Mass Production":"Development"};
  for(const item of Object.values(model.items)){if(item.filename)item.filename=item.filename.replaceAll("A576",code);item.subItems?.forEach(sub=>{if(sub.filename)sub.filename=sub.filename.replaceAll("A576",code)});item.mergedSources?.forEach(src=>{if(src.filename)src.filename=src.filename.replaceAll("A576",code)})}
  data[code]=model;const custom=readJson(CUSTOM_MODELS_KEY,[]);custom.push({code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});localStorage.setItem(CUSTOM_MODELS_KEY,JSON.stringify(custom));saveData();closeModal("addModelModal");populateUploadModels(currentModel);renderAll();renderModelPicker("");toast(`${code} added to the model selection list.`,'success');addAudit("MODEL_ADD",{model:code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});
}
async function deleteSelectedModel(){if(!isAdmin)return;const code=document.getElementById("editModelSelect")?.value||"";if(!code||!data[code]){toast("Select a model to delete.","error");return}const custom=readJson(CUSTOM_MODELS_KEY,[]);if(!custom.some(x=>x.code===code)){toast("Built-in models cannot be deleted from the admin panel.","error");return}if(!confirm(`Delete model ${code} and all locally stored documents for this model? This cannot be undone.`))return;await deleteFilePrefix(code);const renamed=renamedModelMap(),original=Object.entries(renamed).find(([,newCode])=>newCode===code)?.[0];delete data[code];if(original&&MODEL_ORDER.includes(original)){delete renamed[original];data[original]=createDefaultData()[original]}localStorage.setItem(CUSTOM_MODELS_KEY,JSON.stringify(custom.filter(x=>x.code!==code)));localStorage.setItem(RENAMED_MODELS_KEY,JSON.stringify(renamed));saveData();const models=modelList();currentModel=models[0]||"";localStorage.setItem("MOBILE_RND_LAST_MODEL_V1",currentModel);closeModal("addModelModal");populateUploadModels(currentModel);renderCategories();renderAll();renderModelPicker("");toast(original?`${code} removed and ${original} restored.`:`${code} deleted.`,'success');addAudit("MODEL_DELETE",{model:code,restoredModel:original||""})}

function login(e){e.preventDefault();const input=document.getElementById("passwordInput");const error=document.getElementById("loginError");if(input.value==="admin123"){isAdmin=true;sessionStorage.setItem(AUTH_KEY,"true");closeModal("loginModal");document.getElementById("passwordInput").value="";renderAuth();renderCards();document.dispatchEvent(new Event("rnd-auth-changed"));toast("Admin session authenticated.","success");addAudit("LOGIN")}else{error.classList.remove("hidden");input.classList.add("input-error");input.focus();setTimeout(()=>input.classList.remove("input-error"),700)}}
function selectFiles(fileList){if(!isAdmin){toast("Admin authentication is required to upload documents.","error");return}const files=[...(fileList||[])];if(!files.length)return;const valid=[];const rejected=[];for(const file of files){const ext=file.name.split(".").pop().toLowerCase();if(!ALLOWED.includes(ext)){rejected.push(`${file.name}: unsupported type`);continue}if(file.size>MAX_FILE_SIZE){rejected.push(`${file.name}: exceeds 500 MB`);continue}valid.push(file)}selectedFiles=[...selectedFiles,...valid];const name=document.getElementById("fileName");if(name)name.textContent=selectedFiles.length?selectedFiles.map(f=>`${f.name} (${formatBytes(f.size)})`).join(" • "):"Drop files here or click to browse";const status=document.getElementById("uploadStatus");if(status)status.textContent=rejected.length?`${selectedFiles.length} file${selectedFiles.length===1?"":"s"} ready. ${rejected.join("; ")}`:`${selectedFiles.length} file${selectedFiles.length===1?"":"s"} ready for upload.`}
async function upload(e){
  e.preventDefault();if(!selectedFiles.length){toast("Please select at least one file first.","error");return}
  const model=document.getElementById("uploadModel").value,key=document.getElementById("uploadRecord").value,note=document.getElementById("uploadNote").value.trim(),revision=document.getElementById("uploadRevision")?.value.trim()||"",item=data[model]?.items?.[key];
  if(!item){toast("Upload target is not available.","error");return}
  const selector=document.getElementById("uploadSubPart"),sourceValue=selector?.value||"";
  let storageKey=`${model}_${key}`,targetLabel=item.title,source=null;
  if(Array.isArray(item.mergedSources)&&item.mergedSources.length){source=item.mergedSources.find(x=>String(x.key)===String(sourceValue))||item.mergedSources[0];storageKey=`${model}_${source.key}`;targetLabel=`${item.title} / ${source.name}`}
  else if(Array.isArray(item.subItems)&&item.subItems.length){const idx=Number(sourceValue);source=item.subItems[idx];if(!source){toast("Select a document entry first.","error");return}storageKey=keyForSubpart(model,key,source,idx);targetLabel=`${item.title} / ${source.name}`}
  const files=[...selectedFiles],btn=document.getElementById("saveUploadBtn"),progressWrap=document.getElementById("uploadProgressWrap"),progress=document.getElementById("uploadProgress"),status=document.getElementById("uploadStatus");btn.disabled=true;progressWrap.classList.remove("hidden");progress.style.width="0%";
  try{
    for(let i=0;i<files.length;i++){
      const file=files[i];if(status)status.textContent=`Saving ${i+1} of ${files.length}: ${file.name}`;
      let saved;
      try{
        saved=await saveFileVersion(storageKey,file,{revision,note},(pct,part,total)=>{progress.style.width=`${pct}%`;if(status)status.textContent=`Saving ${file.name}… ${pct}% (${part}/${total} chunks)`});
      }catch(err){
        const detail=err?.name?`${err.name}: ${err.message||"storage operation failed"}`:(err?.message||String(err));
        console.error("IndexedDB file commit failed",err);
        if(status)status.textContent=`Upload failed for ${file.name}: ${detail}`;
        toast(`File was not saved: ${detail}`,"error");
        throw err;
      }
      if(source){source.uploadedFilename=file.name;source.uploadedSize=formatBytes(file.size);source.updatedAt=new Date().toISOString();if(note)source.detail=note}
      else {item.filename=file.name;item.size=formatBytes(file.size);item.uploadedFilename=file.name;item.uploadedSize=formatBytes(file.size);item.updatedAt=new Date().toISOString();if(note)item.note=note}
      try{await addAudit("UPLOAD",{model,key,subpart:source?.name||"",filename:file.name,size:file.size,versionKey:saved.key})}
      catch(auditErr){console.warn("File saved but audit logging failed",auditErr)}
    }
    try{saveData()}catch(metaErr){console.warn("File saved but local metadata persistence failed",metaErr)}
    try{
      // Refresh the document state without forcing the record into the compact
      // grid's narrow column. In ALL view the user can expand the record on
      // demand; in a category/group view the existing group layout remains
      // expanded naturally.
      await refreshUploadedFlags(currentModel);
      renderRecent();
      requestAnimationFrame(()=>focusRecord(key));
    }catch(uiErr){console.warn("File saved but UI refresh failed",uiErr)}
    closeModal("uploadModal");toast(`${files.length} file${files.length===1?"":"s"} saved to ${targetLabel}.`,`success`);resetSelectedFile();document.getElementById("uploadModel").value=currentModel;populateUploadRecords(currentModel);updateSubpartSelector();
  }catch(err){
    console.error("Upload operation stopped",err);
    if(status&&!String(status.textContent||"").startsWith("Upload failed")) status.textContent=`Upload stopped: ${err?.message||String(err)}`;
  }finally{btn.disabled=false;setTimeout(()=>progressWrap.classList.add("hidden"),300)}
}

function parseStorageIdentity(storageKey){
  const value=String(storageKey||"");
  const model=[...modelList()].sort((a,b)=>b.length-a.length).find(m=>value===m||value.startsWith(`${m}_`))||currentModel;
  const rest=value===model?"":value.slice(model.length+1);
  const key=rest.split("::v::")[0].split("_")[0]||"";
  const suffix=rest.includes("_")?rest.slice(rest.indexOf("_")+1):"";
  return {model,key,subpart:suffix};
}

async function downloadRecord(storageKey,filename){
  try{
    let record=await getFile(storageKey),resolvedKey=storageKey;
    const {model,key}=parseStorageIdentity(storageKey);
    if(key==="T"||key==="U"){
      const primaryMatches=record?.blob && ((key==="T"&&!isKoreaMemberFile(record))||(key==="U"&&isKoreaMemberFile(record)));
      if(!primaryMatches){
        const legacyKey=`${model}_${key==="T"?"U":"T"}`;
        const legacy=await getFile(legacyKey);
        if(legacy?.blob && ((key==="T"&&!isKoreaMemberFile(legacy))||(key==="U"&&isKoreaMemberFile(legacy)))){record=legacy;resolvedKey=legacyKey;}
        else if(!record?.blob) record=null;
      }
    }
    if(record?.blob){
      const ok=downloadBlob(record.blob,record.filename||filename);
      if(ok){
        const parsed= parseStorageIdentity(resolvedKey),resolvedModel=parsed.model,resolvedRecord=parsed.key,subpart=parsed.subpart;
        await addAudit("DOWNLOAD",{model:resolvedModel,key:resolvedRecord,subpart,filename:record.filename||filename});
        toast("Download started.","success");
        return;
      }
      toast("Browser blocked the download. Please allow downloads for this site.","error");
      return;
    }
  }catch(err){console.error("File download lookup failed",err)}
  toast("No uploaded file is available for this record. Admin must upload the document first.","info");
}
async function previewStoredFile(storageKey,filename){
  try{
    const record=await getFile(storageKey);if(!record?.blob){toast("No uploaded file is available for preview.","info");return;}
    const body=document.getElementById("filePreviewBody"),title=document.getElementById("filePreviewTitle"),meta=document.getElementById("filePreviewMeta");
    const previousUrl=body?.dataset?.objectUrl;if(previousUrl)URL.revokeObjectURL(previousUrl);
    const objectUrl=URL.createObjectURL(record.blob);if(body)body.dataset.objectUrl=objectUrl;
    if(title)title.textContent=record.filename||filename||"Engineering file";
    if(meta)meta.textContent=`${currentModel} · ${formatBytes(record.size||record.blob.size)} · ${record.blob.type||"unknown type"}`;
    if(body){const name=record.filename||filename||"file",ext=name.split(".").pop().toLowerCase();
      if(record.blob.type?.startsWith("image/")||["png","jpg","jpeg","webp","gif","svg"].includes(ext)) body.innerHTML=`<img class="file-preview-image" src="${objectUrl}" alt="${escapeHtml(name)}">`;
      else if(record.blob.type==="application/pdf"||ext==="pdf") body.innerHTML=`<iframe class="file-preview-frame" src="${objectUrl}" title="PDF preview"></iframe>`;
      else if(record.blob.type?.startsWith("text/")||["csv","txt","log","md"].includes(ext)){const text=await record.blob.text();body.innerHTML=`<pre class="file-preview-text">${escapeHtml(text.slice(0,200000))}</pre>`;}
      else body.innerHTML=`<div class="file-preview-unsupported"><i class="fa-solid fa-file-lines"></i><strong>Preview is not available for this file type.</strong><span>Use Download to open the original file in its native application.</span><button type="button" class="btn btn-dark" id="inlinePreviewDownload"><i class="fa-solid fa-download"></i> Download</button></div>`;
      document.getElementById("inlinePreviewDownload")?.addEventListener("click",()=>downloadRecord(storageKey,name));
    }
    document.getElementById("filePreviewModal")?.classList.remove("hidden");
  }catch(err){console.error("Preview failed",err);toast("Unable to preview this file.","error")}
}

function recordData(key){return currentItems()[key]}
async function copyRecord(key){const i=recordData(key),entries=expandedFileMap.get(key)||[];const files=entries.map(x=>{const versions=(x.versions||[]).map(v=>`${v.versionLabel}: ${v.filename} | ${v.size}`).join("\n    ");return `${x.name}: ${x.present?"PRESENT":"MISSING"} | ${x.versionCount||0} version(s)${versions?`\n    ${versions}`:""}`}).join("\n");const text=`${currentModel}\n${i.title}\nCategory: ${i.category}\n${files}`;try{await navigator.clipboard.writeText(text);toast(`${i.title} copied.`,`success`)}catch{toast("Clipboard access is unavailable.","error")}}
async function copyLink(key){const url=`${location.href.split("#")[0]}#record/${currentModel}/${key}`;try{await navigator.clipboard.writeText(url);toast("Record link copied.","success")}catch{toast("Clipboard access is unavailable.","error")}}
async function copySpecs(){const m=data[currentModel].meta;try{await navigator.clipboard.writeText(`Model: ${currentModel} (${m.name})\nProcessor: ${m.ap}\nLaunch Year: ${m.modelYear||"—"}\nKorea Lead / SIEL HW PIC: ${m.sielHwPic||m.leadKorea||"—"}\nRF / Network: ${m.rfNetwork||m.modem||"—"}\nModel Type: ${m.modelType||(m.status==="Mass Production"?"Mass Production Model":"Development Model")}\nStatus: ${m.status}`);toast("Model specification copied.","success")}catch{toast("Clipboard access is unavailable.","error")}}
function exportModel(){downloadText(JSON.stringify(data[currentModel],null,2),`${currentModel}_Engineering_Master.json`);toast("Model JSON exported.","success")}
async function exportReport(){
  const m=data[currentModel].meta,entries=filteredEntries();
  const rows=await Promise.all(entries.map(async([k,i])=>{
    const slots=[];
    if(Array.isArray(i.mergedSources))i.mergedSources.forEach(src=>slots.push({baseKey:`${currentModel}_${src.key}`,label:src.name}));
    else if(Array.isArray(i.subItems))i.subItems.forEach((sub,index)=>slots.push({baseKey:keyForSubpart(currentModel,k,sub,index),label:sub.name}));
    else slots.push({baseKey:`${currentModel}_${k}`,label:i.title});
    const slotRows=await Promise.all(slots.map(async slot=>{
      const versions=await listFileVersions(slot.baseKey);
      const latest=versions[versions.length-1]||await getFile(slot.baseKey);
      return `  - ${slot.label} | ${latest?.filename||"MISSING"} | ${latest?.size?formatBytes(latest.size):"MISSING"} | ${versions.length|| (latest?1:0)} version(s)`;
    }));
    return [`${k} | ${i.title} | ${i.category}`,...slotRows].join("\n");
  }));
  const text=`MOBILE R&D ENGINEERING REPORT
================================
Model: ${currentModel} - ${m.name}
Status: ${m.status}
Processor: ${m.ap}
Modem/RF: ${m.modem}
SW Build: ${m.swVersion}
HQ Lead: ${m.leadKorea}

RECORDS
-------
${rows.join("\n")}

Generated: ${new Date().toISOString()}`;
  downloadText(text,`${currentModel}_Engineering_Report.txt`,"text/plain");
  toast("Engineering report exported.","success");
}
function openPresentation(key){const i=recordData(key);if(!i)return;document.getElementById("presentationModal")?.setAttribute("data-presentation-key",key);const entries=expandedFileMap.get(key)||[];document.getElementById("presentationContent").innerHTML=`<div class="presentation-code">${currentModel} · ${escapeHtml(i.title)}</div><h2>${escapeHtml(i.title)}</h2><div class="presentation-category">${escapeHtml(i.category)}</div><div class="presentation-tags">${(i.tags||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("")}</div><div class="presentation-file">${entries.map(x=>`<strong>${escapeHtml(x.name)}</strong><span class="${x.present?"status-present":"status-missing"}">${x.present?"PRESENT":"MISSING"}</span><strong>File</strong><span>${escapeHtml(x.filename)}</span><strong>Size</strong><span>${escapeHtml(x.size)}</span>`).join("")}</div>`;openModal("presentationModal")}
function navigateRecord(delta){const arr=RECORD_ORDER.filter(k=>currentItems()[k]),modal=document.getElementById("presentationModal"),activeKey=modal?.classList.contains("hidden")?location.hash.split("/").pop():modal.dataset.presentationKey,idx=arr.indexOf(activeKey),next=arr[Math.max(0,Math.min(arr.length-1,(idx<0?0:idx)+delta))];if(!next)return;if(modal&&!modal.classList.contains("hidden")){openRecord(next);openPresentation(next)}else openRecord(next)}
async function resetData(){if(!confirm("Reset all local dashboard data and stored files? This cannot be undone."))return;try{await deleteAllFiles();await deleteAuditLogs();data=createDefaultData();localStorage.removeItem(CUSTOM_MODELS_KEY);localStorage.removeItem(RENAMED_MODELS_KEY);saveData();uploadedFiles=new Map();uploadedKeys=new Set();favorites=[];recentlyViewed=[];expandedCards.clear();localStorage.removeItem("MOBILE_RND_FAVORITES_V1");localStorage.removeItem("MOBILE_RND_RECENT_V1");currentModel=modelList()[0];activeCategory="all";query="";renderCategories();populateUploadModels(currentModel);renderAll();closeModal("settingsModal");toast("Local data reset to default dataset.","success")}catch(err){console.error("Reset failed",err);toast(`Reset failed: ${err?.message||String(err)}`,"error")}}
function dateStamp(){return new Date().toISOString().slice(0,10).replaceAll("-","")}
function restoreSidebarState(){if(localStorage.getItem("MOBILE_RND_SIDEBAR_V1")==="collapsed"){document.body.classList.add("sidebar-collapsed");document.getElementById("sidebarCollapseBtn").innerHTML='<i class="fa-solid fa-angles-right"></i>'}}

init();
// V61: wait for fonts/layout to settle, then perform one harmless final render.
// This reduces first-open layout shifts on wide desktop viewports.
window.addEventListener("load",()=>{
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    renderAll();
    window.dispatchEvent(new Event("portal-layout-ready"));
  }));
},{once:true});
document.addEventListener("click",event=>{
  const target=event.target.closest("button,.btn,.cat-btn,.download-btn,.header-icon-btn,.file-row");
  if(target){
    const now=performance.now(),last=Number(target.dataset.lastPortalClick||0);
    if(now-last<320){event.preventDefault();event.stopImmediatePropagation();return}
    target.dataset.lastPortalClick=String(now);
  }
},{capture:true});
document.addEventListener("click",event=>{const target=event.target.closest("button,.btn,.cat-btn,.download-btn,.header-icon-btn,.file-row");if(!target||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const rect=target.getBoundingClientRect(),ripple=document.createElement("span");ripple.className="portal-click-ripple";ripple.style.left=(event.clientX-rect.left)+"px";ripple.style.top=(event.clientY-rect.top)+"px";if(getComputedStyle(target).position==="static")target.style.position="relative";target.style.overflow="hidden";target.appendChild(ripple);setTimeout(()=>ripple.remove(),420)});
