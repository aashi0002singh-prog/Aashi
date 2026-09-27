import {MODEL_ORDER,RECORD_ORDER,CATEGORIES,CATEGORY_COLORS,createDefaultData} from "../data/models.js";
import {saveFile,saveFileVersion,getFile,getFiles,listFileVersions,listFileVersionsForBases,deleteAllFiles,deleteAuditLogs,addAudit,migrateFilePrefix,deleteFilePrefix} from "./database.js";
import {toast,escapeHtml,formatBytes,downloadBlob,downloadText} from "./ui.js";
import {renderRecordCard} from "./components/record-card.js";
import {openPreviewWorkspace, closePreviewWorkspace} from "./components/preview-workspace.js";

const STORAGE_KEY="MOBILE_RND_DB_DATA_V10";
const PREF_KEY="MOBILE_RND_PREFS_V3";
const AUTH_KEY="RND_AUTH_V3";
const MAX_FILE_SIZE=500*1024*1024;
const ALLOWED=["pdf","xlsx","xls","zip","bin","dwg","csv","doc","docx","ppt","pptx","txt","log","md","jpg","jpeg","png","webp","gif","svg"];
const HARDWARE_DEFAULT={title:"Hardware Checklist",category:"Specification",icon:"fa-clipboard-check",tags:["Hardware verification","Pre-S sign-off"],filename:"",size:""};
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
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null")||createDefaultData();
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
    // V1 data contract: preserve current records and user data, but do not run historical layout migrations.
    for(const model of Object.keys(raw)){
      if(!raw[model] || typeof raw[model]!=="object") continue;
      const d=defaults[model]||defaults.A576;
      raw[model].meta={...d.meta,...(raw[model].meta||{})};
      raw[model].items={...(raw[model].items||{})};
      for(const key of RECORD_ORDER){
        if(!raw[model].items[key]) raw[model].items[key]=clone(d.items[key]);
      }
    }
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
  document.getElementById("recordCount").textContent=groupView?`${entries.length} records • Group view`:`${entries.length} of ${total} records • Compact view`;
  const hasSecondaryFilters=Boolean(query||favoritesOnly||sortMode!=="default");
  document.getElementById("activeFilters").classList.toggle("hidden",!hasSecondaryFilters);
  document.getElementById("activeFilters").innerHTML=`${query?`<span class="filter-chip">Search: ${escapeHtml(query)}</span>`:""}${favoritesOnly?`<span class="filter-chip">Favorites only</span>`:""}${sortMode!=="default"?`<span class="filter-chip">Sort: ${escapeHtml(sortMode)}</span>`:""}`;
  grid.innerHTML=entries.map(([k,i])=>{
    const fileEntries=expandedFileMap.get(k)||[];
    return renderRecordCard({
      key:k,item:i,currentModel,isFavorite:favorites.includes(`${currentModel}:${k}`),
      entries:fileEntries,expanded:expandedCards.has(k),groupView,isAdmin,
      color:CATEGORY_COLORS[i.category]||CATEGORY_COLORS.Specification,escapeHtml
    });
  }).join("") || `<div class="empty-state"><i class="fa-solid fa-filter-circle-xmark"></i><h3 class="font-bold mt-3">No records found</h3><p class="text-xs mt-1">Adjust the search or filters.</p><button class="btn btn-light mt-3" data-clear-filters>Clear filters</button></div>`;
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
function closeModal(id){document.getElementById(id)?.classList.add("hidden");if(id==="filePreviewModal")closePreviewWorkspace();if(id==="uploadModal")resetSelectedFile()}
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
    const preview=e.target.closest("[data-preview-file]");if(preview){previewStoredFile(preview.dataset.previewFile,preview.dataset.filename);return}
    const previewRecord=e.target.closest("[data-preview-record]");if(previewRecord){
      const key=previewRecord.dataset.previewRecord,entries=expandedFileMap.get(key)||[],entry=entries.find(x=>x.present);
      if(entry) previewStoredFile(entry.storageKey,entry.filename); else openPreviewWorkspace({model:currentModel,item:currentItems()[key],entries,selectedStorageKey:"",selectedFilename:"",getFile,formatBytes,escapeHtml,downloadRecord,openUploadModal,isAdmin});
      return;
    }
    const d=e.target.closest("[data-download]");if(d){downloadRecord(d.dataset.download,d.dataset.filename);return}
    const o=e.target.closest("[data-open-record]");if(o){openRecord(o.dataset.openRecord);openPresentation(o.dataset.openRecord);return}
    const c=e.target.closest("[data-copy-record]");if(c){copyRecord(c.dataset.copyRecord);return}
    const l=e.target.closest("[data-link-record]");if(l){copyLink(l.dataset.linkRecord);return}
    const clr=e.target.closest("[data-clear-filters]");if(clr){clearFilters();return}
    const card=e.target.closest(".record-card");
    if(card&&!e.target.closest("button,a,input,select,textarea")){
      const key=card.dataset.record;
      if(expandedCards.has(key)) expandedCards.delete(key); else expandedCards.add(key);
      renderCards();
      requestAnimationFrame(()=>document.getElementById(`record-${key}`)?.scrollIntoView({behavior:prefs.motion?"smooth":"auto",block:"nearest"}));
    }
  });
  document.getElementById("cardsGrid").addEventListener("keydown",e=>{
    const card=e.target.closest(".record-card");
    if(card&&(e.key==="Enter"||e.key===" ")&&!e.target.closest("button,input,select,textarea")){
      e.preventDefault();const key=card.dataset.record;
      if(expandedCards.has(key)) expandedCards.delete(key); else expandedCards.add(key);
      renderCards();
    }
  });
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
