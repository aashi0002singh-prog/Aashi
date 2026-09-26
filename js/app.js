import {MODEL_ORDER,RECORD_ORDER,CATEGORIES,CATEGORY_COLORS,createDefaultData,compareRecordCodes} from "../data/models.js";
import {getFileVersion,listDocumentsByContext,migrateLegacyFilesToVersions,deleteAllFiles,deleteAuditLogs,addAudit,registerModel,registerRecord,registerSlot,renameModelCode,createFullBackup,restoreFullBackup} from "./database.js";
import {toast,escapeHtml,formatBytes,downloadBlob,downloadText,normalizeFileBlob,mimeForFilename,fileExtension} from "./ui.js";

const STORAGE_KEY="MOBILE_RND_DB_DATA_V10";
const PREF_KEY="MOBILE_RND_PREFS_V3";
const AUTH_KEY="RND_AUTH_V3";
const MAX_FILE_SIZE=500*1024*1024;
const ALLOWED=["pdf","xlsx","xls","zip","bin","dwg","csv","doc","docx","ppt","pptx"];
const LEGACY_RECORD_MAP={};
const HARDWARE_DEFAULT={title:"Hardware Checklist",category:"Specification",icon:"fa-clipboard-check",tags:["Hardware verification","Pre-S sign-off"],filename:"",size:""};
const CUSTOM_MODELS_KEY="MOBILE_RND_CUSTOM_MODELS_V1";
const MODEL_IDS_KEY="MOBILE_RND_MODEL_IDS_V1";
const RECORD_IDS_KEY="MOBILE_RND_RECORD_IDS_V1";
const SLOT_IDS_KEY="MOBILE_RND_SLOT_IDS_V1";
function stableIdMap(key){return readJson(key,{});}
async function ensureRepositoryIdentity(){
  const modelIds=stableIdMap(MODEL_IDS_KEY), recordIds=stableIdMap(RECORD_IDS_KEY), slotIds=stableIdMap(SLOT_IDS_KEY);
  const codes=modelList();
  for(const code of codes){
    modelIds[code] ||= crypto.randomUUID();
    const meta=data[code]?.meta||{};
    await registerModel({modelId:modelIds[code],modelCode:code,name:meta.name||code,processor:meta.ap||"",launchYear:meta.modelYear||"",pic:meta.sielHwPic||meta.leadKorea||"",rfNetwork:meta.rfNetwork||meta.modem||"",modelType:meta.modelType||"Development Model",status:meta.status||"Development"});
    for(const [recordCode,item] of Object.entries(data[code]?.items||{})){
      if(!String(recordCode).trim())continue;
      recordIds[recordCode] ||= crypto.randomUUID();
      await registerRecord({recordId:recordIds[recordCode],code:recordCode,title:item.title||recordCode,category:item.category||"Specification",order:recordCodeValueSafe(recordCode),icon:item.icon||"fa-folder"});
      const sources=[];
      if(Array.isArray(item.mergedSources)) item.mergedSources.forEach((x,i)=>sources.push({id:String(x.key),name:x.name||x.key,required:true,order:i}));
      else if(Array.isArray(item.subItems)) item.subItems.forEach((x,i)=>sources.push({id:String(x.id||i),name:x.name||`File ${i+1}`,required:true,order:i}));
      else sources.push({id:"main",name:item.title||recordCode,required:true,order:0});
      for(const src of sources){
        const refKey=src.id==="main"?`${code}_${recordCode}`:(Array.isArray(item.mergedSources)?`${code}_${src.id}`:`${code}_${recordCode}_${src.id}`);
        const mapKey=`${code}::${recordCode}::${src.id}`; slotIds[mapKey] ||= crypto.randomUUID();
        await registerSlot({slotId:slotIds[mapKey],modelId:modelIds[code],recordId:recordIds[recordCode],name:src.name,slotKey:src.id,required:src.required,order:src.order,legacyKey:refKey,createdAt:Date.now()});
      }
    }
  }
  localStorage.setItem(MODEL_IDS_KEY,JSON.stringify(modelIds)); localStorage.setItem(RECORD_IDS_KEY,JSON.stringify(recordIds)); localStorage.setItem(SLOT_IDS_KEY,JSON.stringify(slotIds));
}
function recordCodeValueSafe(code){return String(code).toUpperCase().split("").reduce((n,c)=>n*26+(c.charCodeAt(0)-64),0)}

function customModelCodes(){return readJson(CUSTOM_MODELS_KEY,[]).map(x=>String(x?.code||"").trim().toUpperCase()).filter(Boolean)}
function modelList(){return [...MODEL_ORDER,...customModelCodes()].filter((m,i,a)=>a.indexOf(m)===i&&data?.[m])}

function clone(value){return structuredClone(value)}

function migrateRecordKeys(raw){
  const defaults=createDefaultData();
  if(!raw||typeof raw!=="object") return defaults;
  let changed=false;
  const modelCodes=[...MODEL_ORDER,...customModelCodes()].filter((m,i,a)=>a.indexOf(m)===i);
  for(const model of modelCodes){
    const defaultModel=defaults[model]||defaults.A576;
    if(!raw[model]||typeof raw[model]!=="object"){
      raw[model]=clone(defaultModel); changed=true; continue;
    }
    const block=raw[model];
    if(!block.meta) { block.meta=clone(defaultModel.meta); changed=true; }
    if(!block.items||typeof block.items!=="object") { block.items=clone(defaultModel.items); changed=true; continue; }
    const items=block.items;
    const legacyLayout=items.A?.title==="Basic Model Details" || items.S?.title==="Block Diagram" || items.P?.title==="MIPI Table";
    const v632KeyPartsLayout=items.I?.title==="Process Flow Chart" && items.O?.title==="Key Parts Details";
    const v641OldLayout=items.P?.title==="Key Parts Details" && items.M?.title==="Base Model Defect History" && items.O?.title==="SW Log Process";
    const v64OldLayout=items.I?.title==="Key Parts Details" && items.P?.title==="Basic Model Details";
    if(v641OldLayout){
      const old={...items};
      const reordered={};
      ["A","B","C","D","E","F","G","H","I","J","K","L"].forEach(k=>reordered[k]=old[k]);
      reordered.M=clone(old.P);
      reordered.N=clone(old.M);
      reordered.O=clone(old.N);
      reordered.P=clone(old.O);
      ["Q","R","S","T","U","V"].forEach(k=>reordered[k]=old[k]);
      block.items=reordered; changed=true;
    }
    else if(v64OldLayout){
      const old={...items};
      const reordered={};
      ["A","B","C","D","E","F","G","H"].forEach(k=>reordered[k]=old[k]);
      reordered.I=clone(defaultModel.items.I);
      reordered.J=clone(old.J); reordered.K=clone(old.K); reordered.L=clone(old.L); reordered.M=clone(old.M); reordered.N=clone(old.N); reordered.O=clone(old.O);
      reordered.P=clone(old.I); reordered.Q=clone(old.P); reordered.R=clone(old.Q); reordered.S=clone(old.R); reordered.T=clone(old.S); reordered.U=clone(old.T); reordered.V=clone(old.U);
      block.items=reordered; changed=true;
    }
    else if(v632KeyPartsLayout){
      const reordered={};
      for(const key of RECORD_ORDER) reordered[key]=items[key];
      reordered.I=clone(items.O);
      reordered.J=clone(items.I);
      reordered.K=clone(items.J);
      reordered.L=clone(items.K);
      reordered.M=clone(items.L);
      reordered.N=clone(items.M);
      reordered.O=clone(items.N);
      block.items=reordered;
      changed=true;
    }
    else if(legacyLayout && Object.keys(LEGACY_RECORD_MAP).length){
      const migrated={};
      for(const [oldKey,newKey] of Object.entries(LEGACY_RECORD_MAP)){
        if(items[oldKey] && !migrated[newKey]) migrated[newKey]=clone(items[oldKey]);
      }
      if(Object.keys(migrated).length){block.items={...items,...migrated};changed=true;}
    }
    // V64.2 dashboard restructuring: Schematics are grouped as a section, but
    // Block Diagram (A), Circuit Diagram (B), and SOC Table (C) remain separate cards.
    // Preserve each card independently while keeping N/O as the combined defect summary.
    const legacyA=items.A, legacyB=items.B, legacyC=items.C, legacyN=items.N, legacyO=items.O;
    // V64.2 schematic integrity: A/B/C must always exist as three independent records.
    // Recover missing B/C from the canonical defaults without touching their independent file keys.
    for(const schematicKey of ["A","B","C"]){
      if(!items[schematicKey]){ items[schematicKey]=clone(defaultModel.items[schematicKey]); changed=true; }
      items[schematicKey].category="Schematics";
    }
    const defaultA=clone(defaultModel.items.A);
    if(legacyA && !Array.isArray(legacyA.mergedSources)){
      Object.assign(defaultA,{filename:legacyA.uploadedFilename||legacyA.filename||defaultA.filename,size:legacyA.uploadedSize||legacyA.size||defaultA.size});
      if(Array.isArray(legacyA.tags)&&legacyA.tags.length) defaultA.tags=clone(legacyA.tags);
    }
    items.A=defaultA;
    if(items.N?.title!==defaultModel.items.N?.title || !Array.isArray(items.N?.mergedSources)){
      const merged=clone(defaultModel.items.N);
      const sourceByKey=new Map((merged.mergedSources||[]).map(x=>[x.key,x]));
      for(const old of [legacyN,legacyO]){
        const oldKey=old===legacyN?"N":"O";
        const target=sourceByKey.get(oldKey); if(!target||!old) continue;
        Object.assign(target,{filename:old.uploadedFilename||old.filename||target.filename,size:old.uploadedSize||old.size||target.size});
        if(Array.isArray(old.tags)&&old.tags.length) target.detail=old.tags.join(" • ");
      }
      items.N=merged; changed=true;
    }
    // Records removed from the visual information architecture are intentionally no longer rendered.
    ["M","O","S"].forEach(k=>{if(items[k]){delete items[k];changed=true;}});
    // V64.1.9 canonical T/U mapping: T = Hardware Checklist, U = Korea Member Details.
    // Older V64 builds could force the Korea-member record into T, leaving both T and U
    // with the Hardware Checklist title. Move the record metadata back to its canonical slot.
    const t=block.items.T, u=block.items.U;
    const tLooksLikeKorea=String(t?.title||"").trim()==="Korea Member Details" || (t?.tags||[]).some(x=>String(x).toLowerCase().includes("korea member")) || String(t?.filename||"").includes("Korea_HQ_Roster");
    const uLooksLikeHardware=String(u?.title||"").trim()==="Hardware Checklist" || (u?.tags||[]).some(x=>String(x).toLowerCase().includes("hardware verification"));
    if(tLooksLikeKorea && uLooksLikeHardware){
      block.items.T=clone(u);
      block.items.U=clone(t);
      changed=true;
    }
    if(block.items.HWC && !block.items.T){
      block.items.T={...clone(block.items.HWC),...clone(HARDWARE_DEFAULT)};
      block.items.T.uploadedFilename=block.items.HWC.uploadedFilename||block.items.HWC.filename||"";
      block.items.T.uploadedSize=block.items.HWC.uploadedSize||block.items.HWC.size||"";
      delete block.items.HWC; changed=true;
    }
    if(block.items.VSWR && !block.items.H){
      block.items.H={...clone(defaultModel.items.H),...clone(block.items.VSWR)};
      delete block.items.VSWR; changed=true;
    }
    for(const key of RECORD_ORDER){
      if(!block.items[key]){ block.items[key]=clone(defaultModel.items[key]); changed=true; }
      const d=defaultModel.items[key];
      const item=block.items[key];
      if(item.title!==d.title) { item.title=d.title; changed=true; }
      if(item.category!==d.category) { item.category=d.category; changed=true; }
      if(item.icon!==d.icon) { item.icon=d.icon; changed=true; }
      if(key==="T" || key==="U"){
        const canonicalTags=clone(d.tags||[]);
        if(JSON.stringify(item.tags||[])!==JSON.stringify(canonicalTags)){ item.tags=canonicalTags; changed=true; }
      } else if(!Array.isArray(item.tags)) { item.tags=clone(d.tags||[]); changed=true; }
      if(key==="T" && item.title!==HARDWARE_DEFAULT.title){ item.title=HARDWARE_DEFAULT.title; item.category=HARDWARE_DEFAULT.category; item.icon=HARDWARE_DEFAULT.icon; item.tags=clone(HARDWARE_DEFAULT.tags); changed=true; }
      if(["A","B","J","M"].includes(key)) {
        const defaultsSub=Array.isArray(d.subItems)?d.subItems:[];
        const existingSub=Array.isArray(item.subItems)?item.subItems:[];
        const byName=new Map(existingSub.filter(Boolean).map(s=>[String(s.name||"").trim().toLowerCase(),s]));
        const merged=defaultsSub.map(ds=>{
          const old=byName.get(String(ds.name||"").trim().toLowerCase());
          return old?{...clone(ds),...clone(old)}:clone(ds);
        });
        if(JSON.stringify(item.subItems||[])!==JSON.stringify(merged)){item.subItems=merged;changed=true;}
      }
    }
  }
  if(changed){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(raw))}catch{} }
  return raw;
}

let data=loadData();
let prefs=loadPrefs();
let draftPrefs={...prefs};
let currentModel=modelList()[0];
let activeCategory="all", query="", sortMode="default", favoritesOnly=false;
const ENGINEERING_TABS_HIDDEN_KEY="MOBILE_RND_ENGINEERING_TABS_HIDDEN_V1";
let recentlyViewed=readJson("MOBILE_RND_RECENT_V1",[]);
let favorites=readJson("MOBILE_RND_FAVORITES_V1",[]);
let isAdmin=sessionStorage.getItem(AUTH_KEY)==="true";
let selectedFile=null;
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
    return migrateRecordKeys(raw);
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
async function init(){
  await ensureRepositoryIdentity();
  await migrateLegacyFilesToVersions();
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
async function renderFileSummary(){ return; }
function renderAll(){renderHero();renderCategories();renderCards();populateUploadRecords(document.getElementById("uploadModel")?.value||currentModel);renderAuth();renderRecent()}
async function refreshUploadedFlags(model=currentModel){
  const items=data[model]?.items||{};
  const keys=Object.keys(items).filter(Boolean).sort(compareRecordCodes);
  const slotDescriptors=new Map();
  for(const key of keys){
    const item=items[key],slots=[];
    if(Array.isArray(item.mergedSources)) item.mergedSources.forEach(src=>slots.push({slotKey:String(src.key),sourceKey:src.key,selectorValue:src.key,name:src.name,detail:src.detail||"",filename:src.filename||"No document uploaded",size:src.size||"—"}));
    else if(Array.isArray(item.subItems)&&item.subItems.length) item.subItems.forEach((sub,i)=>slots.push({slotKey:subpartId(sub,i),sourceKey:key,selectorValue:String(i),subpartIndex:i,name:sub.name||`File ${i+1}`,detail:sub.note||"",filename:sub.filename||"No document uploaded",size:sub.size||"—"}));
    else slots.push({slotKey:"main",sourceKey:key,selectorValue:"",name:item.title,detail:"",filename:key==="T"?"No checklist uploaded":item.filename||"No document uploaded",size:item.size||"—"});
    slotDescriptors.set(key,slots);
  }
  if(model!==currentModel)return;
  const expanded=new Map(); uploadedFiles=new Map(); uploadedKeys=new Set(); expandedFileMap=new Map();
  for(const key of keys){
    const item=items[key], slots=slotDescriptors.get(key)||[];
    const entries=[];
    for(const slot of slots){
      let bundle={slot:null,versions:[]};
      try{bundle=await listDocumentsByContext({modelCode:model,recordCode:key,slotKey:slot.slotKey});}catch(err){console.warn("Document lookup failed",model,key,slot.slotKey,err)}
      const versions=(bundle.versions||[]).map(v=>({key:v.versionId,versionLabel:v.revision||`v${new Date(v.createdAt).toLocaleString()}`,filename:v.filename||slot.filename||"Uploaded document",size:v.size?formatBytes(v.size):slot.size||"—",note:v.note||"",updatedAt:v.createdAt||""}));
      const latest=versions.at(-1);
      entries.push({...slot,slotId:bundle.slot?.slotId||null,present:versions.length>0,versions,versionCount:versions.length,storageKey:latest?.key||null,filename:latest?.filename||slot.filename,size:latest?.size||slot.size,versionLabel:latest?.versionLabel||"",updatedAt:latest?.updatedAt||""});
    }
    expanded.set(key,entries); expandedFileMap.set(key,entries);
    const present=entries.find(x=>x.present); if(present)uploadedFiles.set(key,{...present}); if(entries.some(x=>x.present))uploadedKeys.add(key);
  }
  if(model!==currentModel)return; renderCards();
}
function subpartId(sub,index){return String(sub?.id||sub?.name||`part-${index+1}`).trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||`part-${index+1}`}

function hydrateInlinePreviews(entries){
  for(const [key] of entries){
    const host=document.querySelector(`#record-${CSS.escape(key)} [data-inline-preview]`);
    if(host) host.innerHTML=`<div class="inline-preview-empty"><i class="fa-solid fa-eye"></i><span>Select Preview on a document below to load the binary without preloading large engineering files.</span></div>`;
  }
}

function renderVersionHistory(entry,color){
  if(!entry.present||!entry.versions?.length)return "";
  const rows=[...entry.versions].reverse().map(v=>`<div class="version-row"><span class="version-badge">${escapeHtml(v.versionLabel||"Version")}</span><span class="version-name" title="${escapeHtml(v.filename||"")}">${escapeHtml(v.filename||"Uploaded document")}</span><span class="version-size">${escapeHtml(v.size||"—")}</span><span class="version-note">${escapeHtml(v.note||"")}</span><span class="version-actions"><button type="button" class="mini-file-action" style="--action-color:${color}" data-preview-file="${escapeHtml(v.key)}" data-filename="${escapeHtml(v.filename||"")}" title="Preview"><i class="fa-solid fa-eye"></i><span>PREVIEW</span></button><button type="button" class="mini-file-action" style="--action-color:${color}" data-download="${escapeHtml(v.key)}" data-filename="${escapeHtml(v.filename||"")}" title="Download"><i class="fa-solid fa-download"></i><span>DOWNLOAD</span></button></span></div>`).join("");
  return `<div class="version-history"><div class="version-history-head"><span><i class="fa-solid fa-clock-rotate-left"></i> ${entry.versionCount} version${entry.versionCount===1?"":"s"}</span><span>Latest: ${escapeHtml(entry.versionLabel||"Current")}</span></div>${rows}</div>`;
}

function renderExpandedFiles(key,item){
  const entries=expandedFileMap.get(key)||[];
  if(!entries.length) return `<div class="expanded-empty">No document entries configured.</div>`;
  const color=CATEGORY_COLORS[item.category]||CATEGORY_COLORS.Specification;
  return entries.map(entry=>{
    const actions=entry.present
      ? `<div class="expanded-file-actions"><button class="download-btn" style="background:${color}" data-preview-file="${escapeHtml(entry.storageKey)}" data-filename="${escapeHtml(entry.filename)}"><i class="fa-solid fa-eye"></i> PREVIEW LATEST</button><button class="download-btn" style="background:${color}" data-download="${escapeHtml(entry.storageKey)}" data-filename="${escapeHtml(entry.filename)}"><i class="fa-solid fa-download"></i> DOWNLOAD</button>${isAdmin?`<button class="download-btn hw-upload-btn" style="background:${color}" data-open-upload="${escapeHtml(key)}" data-subpart-index="${escapeHtml(entry.selectorValue??entry.sourceKey??"")}"><i class="fa-solid fa-plus"></i> NEW VERSION</button>`:""}</div>`
      : (isAdmin?`<button class="download-btn hw-upload-btn" style="background:${color}" data-open-upload="${escapeHtml(key)}" data-subpart-index="${escapeHtml(entry.selectorValue??entry.sourceKey??"")}"><i class="fa-solid fa-cloud-arrow-up"></i> UPLOAD</button>`:``);
    const versionSummary=entry.present?`<span class="version-count">${entry.versionCount} version${entry.versionCount===1?"":"s"}</span>`:"";
    return `<div class="expanded-file-row ${entry.present?"is-present":"is-missing"}"><div class="expanded-file-main"><div class="expanded-file-title"><i class="fa-solid ${escapeHtml(entry.present?"fa-file-circle-check":"fa-file-circle-xmark")}"></i><span>${escapeHtml(entry.name)}</span><span class="expanded-status ${entry.present?"present":"missing"}">${entry.present?"PRESENT":"MISSING"}</span>${versionSummary}</div><div class="expanded-file-meta"><span>${escapeHtml(entry.filename)}</span><span>${escapeHtml(entry.size)}</span>${entry.detail?`<span>${escapeHtml(entry.detail)}</span>`:""}</div>${entry.present?renderVersionHistory(entry,color):`<div class="slot-missing-note">No document uploaded yet.</div>`}</div>${actions}</div>`;
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

function filteredEntries(){let arr=Object.entries(currentItems()).filter(([k,i])=>i&&String(k).trim()).filter(([k,i])=>{const cat=activeCategory==="all"||i.category===activeCategory;const fav=!favoritesOnly||favorites.includes(`${currentModel}:${k}`);return cat&&fav&&(!query||itemText(k,i).includes(query.toLowerCase()))});arr.sort((a,b)=>compareRecordCodes(a[0],b[0]));if(sortMode==="title")arr.sort((a,b)=>a[1].title.localeCompare(b[1].title));if(sortMode==="category")arr.sort((a,b)=>a[1].category.localeCompare(b[1].category)||compareRecordCodes(a[0],b[0]));if(sortMode==="favorite")arr.sort((a,b)=>Number(favorites.includes(`${currentModel}:${b[0]}`))-Number(favorites.includes(`${currentModel}:${a[0]}`)));return arr}
function renderCards(){
  ensureSchematicCardsVisible();
  const grid=document.getElementById("cardsGrid"),entries=filteredEntries(),total=Object.keys(currentItems()).filter(Boolean).length;
  const groupView=activeCategory!=="all";
  document.body.dataset.recordView=groupView?"group":"all";
  document.body.dataset.activeRecordCategory=activeCategory;
  document.getElementById("recordCount").textContent=groupView?`${entries.length} records • Full detail view`:`${entries.length} of ${total} records • Compact view`;
  document.getElementById("activeFilters").classList.toggle("hidden",!(query||activeCategory!=="all"||favoritesOnly||sortMode!=="default"));
  document.getElementById("activeFilters").innerHTML=`${query?`<span class="filter-chip">Search: ${escapeHtml(query)}</span>`:""}${activeCategory!=="all"?`<span class="filter-chip">Category: ${escapeHtml(activeCategory)}</span>`:""}${favoritesOnly?`<span class="filter-chip">Favorites only</span>`:""}${sortMode!=="default"?`<span class="filter-chip">Sort: ${escapeHtml(sortMode)}</span>`:""}`;
  // V64.2 unified engineering grid: Schematics is a filter/category only.
  // A = Block Diagram, B = Circuit Diagram, C = SOC Table remain three
  // independent cards and participate in the same unified grid as every record.
  grid.innerHTML=entries.map(([k,i])=>renderCard(k,i)).join("") || `<div class="empty-state"><i class="fa-solid fa-filter-circle-xmark"></i><h3 class="font-bold mt-3">No records found</h3><p class="text-xs mt-1">Adjust the search or filters.</p><button class="btn btn-light mt-3" data-clear-filters>Clear filters</button></div>`;
  if(entries.length) hydrateInlinePreviews(entries);
}
function renderCard(key,item){
  const color=CATEGORY_COLORS[item.category]||CATEGORY_COLORS.Specification;
  const favKey=`${currentModel}:${key}`,isFav=favorites.includes(favKey);
  const entries=expandedFileMap.get(key)||[];
  const presentCount=entries.filter(x=>x.present).length;
  const totalSlots=entries.length||1;
  const versionTotal=entries.reduce((sum,x)=>sum+(x.versionCount||0),0);
  const groupView=activeCategory!=="all";
  const expanded=groupView||expandedCards.has(key);
  const statusClass=presentCount===totalSlots?"all-present":presentCount>0?"partial":"all-missing";
  const statusText=presentCount===0?"NO DOCUMENT":presentCount===totalSlots?"DOCUMENTS AVAILABLE":"PARTIAL DOCUMENTS";
  const detail=expanded?`<div class="record-expanded-panel"><div class="expanded-summary"><span><i class="fa-solid fa-layer-group"></i> ${versionTotal} uploaded version${versionTotal===1?"":"s"} • unlimited history</span><span><i class="fa-solid fa-circle-info"></i> Document details</span></div><div class="inline-preview" data-inline-preview><div class="inline-preview-loading"><i class="fa-solid fa-spinner"></i><span>Loading document preview…</span></div></div><div class="expanded-file-list">${renderExpandedFiles(key,item)}</div><div class="expanded-footer"><button class="text-action" data-copy-record="${escapeHtml(key)}"><i class="fa-regular fa-copy"></i> Copy details</button><button class="text-action" data-link-record="${escapeHtml(key)}"><i class="fa-solid fa-link"></i> Copy link</button><button class="text-action" data-open-record="${escapeHtml(key)}"><i class="fa-solid fa-up-right-and-down-left-from-center"></i> Open details</button></div></div>`:"";
  return `<article id="record-${escapeHtml(key)}" class="record-card ${expanded?"is-expanded":""} ${groupView?"is-group-view":""} ${isFav?"is-favorite":""}" style="--record-accent:${color}" data-record="${escapeHtml(key)}" tabindex="0" aria-expanded="${expanded}"><div class="record-stripe" style="background:${color}"></div><div class="record-collapsed-face"><div class="record-icon" style="background:${color}"><i class="fa-solid ${escapeHtml(item.icon)}"></i></div><div class="record-title-only">${escapeHtml(item.title)}</div><div class="record-status ${statusClass}"><span class="status-dot ${presentCount?"present":"missing"}"></span><span>${escapeHtml(statusText)}</span></div><button class="favorite-btn ${isFav?"active":""}" data-favorite="${escapeHtml(favKey)}" title="Favorite"><i class="fa-${isFav?"solid":"regular"} fa-star"></i></button><span class="expand-cue"><i class="fa-solid fa-chevron-down"></i></span></div>${detail}</article>`;
}

function renderAuth(){const slot=document.getElementById("adminAuthSlot");slot.innerHTML=isAdmin?`<div class="flex gap-1"><button id="uploadBtn" class="btn btn-cyan"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</button><button id="addModelBtn" class="btn btn-dark"><i class="fa-solid fa-plus"></i> Model</button><button id="editModelBtn" class="btn btn-dark"><i class="fa-solid fa-pen-to-square"></i> Edit</button><button id="logoutBtn" class="header-icon-btn" title="Logout"><i class="fa-solid fa-right-from-bracket"></i></button></div>`:`<button id="loginBtn" class="btn btn-dark"><i class="fa-solid fa-lock"></i> Admin • Shivam</button>`;document.getElementById(isAdmin?"uploadBtn":"loginBtn").addEventListener("click",()=>isAdmin?openUploadModal():openModal("loginModal"));if(isAdmin)document.getElementById("addModelBtn")?.addEventListener("click",openAddModelModal);document.getElementById("editModelBtn")?.addEventListener("click",openEditModelModal);if(isAdmin)document.getElementById("logoutBtn").addEventListener("click",()=>{isAdmin=false;sessionStorage.removeItem(AUTH_KEY);renderAuth();renderCards();document.dispatchEvent(new Event("rnd-auth-changed"));toast("Admin session ended.","info")})}
function populateUploadModels(selected=currentModel){const el=document.getElementById("uploadModel");if(!el)return;el.innerHTML=modelList().map(m=>`<option value="${m}">${m} • ${escapeHtml(data[m].meta.name)}</option>`).join("");el.value=modelList().includes(selected)?selected:currentModel;populateUploadRecords(el.value)}
function populateUploadRecords(model=document.getElementById("uploadModel")?.value||currentModel,preferredKey=""){
  const el=document.getElementById("uploadRecord");if(!el)return;
  const items=data[model]?.items||{};
  el.innerHTML=Object.entries(items).sort((a,b)=>compareRecordCodes(a[0],b[0])).map(([k,i])=>`<option value="${k}">[${k}] ${escapeHtml(i.title)}</option>`).join("");
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

function resetSelectedFile(){selectedFile=null;const input=document.getElementById("fileInput");if(input)input.value="";const name=document.getElementById("fileName");if(name)name.textContent="Drop file here or click to browse";const status=document.getElementById("uploadStatus");if(status)status.textContent="";const rev=document.getElementById("uploadRevision");if(rev)rev.value="";const note=document.getElementById("uploadNote");if(note)note.value=""}
function openModal(id){document.getElementById(id)?.classList.remove("hidden")}
function closeModal(id){document.getElementById(id)?.classList.add("hidden");if(id==="uploadModal")resetSelectedFile()}
function findModel(value){const v=String(value||"").trim().toUpperCase();return modelList().find(m=>m===v)||modelList().find(m=>m.toUpperCase()===v)||null}
function renderModelPicker(filter=""){const menu=document.getElementById("modelPickerMenu");if(!menu)return;const q=String(filter||"").trim().toLowerCase(),matches=modelList().filter(m=>!q||m.toLowerCase().includes(q)||data[m].meta.name.toLowerCase().includes(q));menu.innerHTML=`<div class="model-picker-label"><i class="fa-solid fa-list-check"></i><span>Select Model</span></div>`+(matches.length?matches.map(m=>`<button type="button" class="model-picker-option ${m===currentModel?"active":""}" data-picker-model="${m}" role="option" aria-selected="${m===currentModel}"><span class="model-picker-code">${m}</span><span class="model-picker-name">${escapeHtml(data[m].meta.name)}</span></button>`).join(""):`<div class="model-picker-empty">No model found</div>`);menu.querySelectorAll("[data-picker-model]").forEach(b=>b.addEventListener("click",()=>{setModel(b.dataset.pickerModel);closeModelPicker()}))}
function openModelPicker(){const m=document.getElementById("modelPickerMenu"),i=document.getElementById("modelPickerInput");if(m){m.classList.remove("hidden");i?.setAttribute("aria-expanded","true")}}
function closeModelPicker(){const m=document.getElementById("modelPickerMenu"),i=document.getElementById("modelPickerInput");if(m){m.classList.add("hidden");i?.setAttribute("aria-expanded","false")}}
function toggleModelPicker(){const m=document.getElementById("modelPickerMenu");if(m?.classList.contains("hidden"))openModelPicker();else closeModelPicker()}
function setModel(m){if(!modelList().includes(m))return;expandedCards.clear();currentModel=m;localStorage.setItem("MOBILE_RND_LAST_MODEL_V1",m);activeCategory="all";query="";favoritesOnly=false;sortMode="default";populateUploadModels(m);renderAll();refreshUploadedFlags(m);const picker=document.getElementById("modelPickerInput");if(picker)picker.value=currentModel;renderModelPicker("");location.hash="";window.scrollTo({top:0,behavior:prefs.motion?"smooth":"auto"})}
function openRecord(key){
  const item=currentItems()?.[key];
  if(!item)return;
  expandedCards.add(key);
  markRecent(key);
  // Summary tiles must always reach their card, even when filters/search are active.
  activeCategory="all";
  query="";
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
  const summaryToggle=document.getElementById("fileSummaryToggle"),summaryBoard=document.querySelector(".file-summary-board"),summaryHidden=localStorage.getItem("MOBILE_RND_FILE_SUMMARY_HIDDEN_V1")==="1";
  const engineeringTabsToggle=document.getElementById("engineeringTabsToggle"),engineeringTabsRow=document.getElementById("engineeringRecordsTabsRow"),engineeringTabsHidden=localStorage.getItem(ENGINEERING_TABS_HIDDEN_KEY)==="1";
  const applyEngineeringTabsState=(hidden)=>{
    engineeringTabsRow?.classList.toggle("tabs-hidden",hidden);
    engineeringTabsToggle?.setAttribute("aria-expanded",String(!hidden));
    if(engineeringTabsToggle)engineeringTabsToggle.innerHTML=`<i class="fa-solid fa-eye${hidden?"":"-slash"}"></i><span>${hidden?"Show Tabs":"Hide Tabs"}</span>`;
    engineeringTabsToggle?.setAttribute("title",hidden?"Show Engineering Records category tabs":"Hide Engineering Records category tabs");
  };
  applyEngineeringTabsState(engineeringTabsHidden);
  engineeringTabsToggle?.addEventListener("click",()=>{const hidden=!engineeringTabsRow?.classList.contains("tabs-hidden");localStorage.setItem(ENGINEERING_TABS_HIDDEN_KEY,hidden?"1":"0");applyEngineeringTabsState(hidden)});
  if(summaryBoard&&summaryToggle){summaryBoard.classList.toggle("summary-hidden",summaryHidden);summaryToggle.setAttribute("aria-expanded",String(!summaryHidden));summaryToggle.innerHTML=`<i class="fa-solid fa-eye${summaryHidden?"":"-slash"}"></i> ${summaryHidden?"Show":"Hide"}`;summaryToggle.addEventListener("click",()=>{const hidden=summaryBoard.classList.toggle("summary-hidden");localStorage.setItem("MOBILE_RND_FILE_SUMMARY_HIDDEN_V1",hidden?"1":"0");summaryToggle.setAttribute("aria-expanded",String(!hidden));summaryToggle.innerHTML=`<i class="fa-solid fa-eye${hidden?"":"-slash"}"></i> ${hidden?"Show":"Hide"}`})}
  document.getElementById("sidebarCollapseBtn")?.addEventListener("click",()=>{document.body.classList.toggle("sidebar-collapsed");const collapsed=document.body.classList.contains("sidebar-collapsed");localStorage.setItem("MOBILE_RND_SIDEBAR_V1",collapsed?"collapsed":"expanded");document.getElementById("sidebarCollapseBtn").innerHTML=`<i class="fa-solid fa-angles-${collapsed?"right":"left"}"></i>`});
  document.getElementById("categoryTabs").addEventListener("click",e=>{const b=e.target.closest("[data-cat]");if(b){activeCategory=b.dataset.cat;expandedCards.clear();renderCategories();renderCards()}});
  const summaryBody=document.getElementById("fileSummaryBody");summaryBody?.addEventListener("click",e=>{const b=e.target.closest("[data-summary-record]");if(b)openRecord(b.dataset.summaryRecord)});summaryBody?.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.closest("[data-summary-record]")){e.preventDefault();openRecord(e.target.closest("[data-summary-record]").dataset.summaryRecord)}});
  document.getElementById("cardsGrid").addEventListener("click",e=>{
    const up=e.target.closest("[data-open-upload]");if(up){openUploadModal(up.dataset.openUpload,up.dataset.subpartIndex||"");return}
    const fav=e.target.closest("[data-favorite]");if(fav){toggleFavorite(fav.dataset.favorite);return}
    const preview=e.target.closest("[data-preview-file]");if(preview){previewStoredFile(preview.dataset.previewFile,preview.dataset.filename);return}
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
  document.getElementById("sortSelect").addEventListener("change",e=>{sortMode=e.target.value;renderCards()});document.getElementById("favoritesToggle").addEventListener("click",()=>{favoritesOnly=!favoritesOnly;document.getElementById("favoritesToggle").classList.toggle("active",favoritesOnly);renderCards()});document.getElementById("clearFiltersBtn").addEventListener("click",clearFilters);
  document.getElementById("prevRecordBtn").addEventListener("click",()=>navigateRecord(-1));document.getElementById("nextRecordBtn").addEventListener("click",()=>navigateRecord(1));document.getElementById("presentationBtn").addEventListener("click",()=>{const k=filteredEntries()[0]?.[0];if(k)openPresentation(k)});
  document.getElementById("recentList").addEventListener("click",e=>{const b=e.target.closest("[data-recent-key]");if(b){setModel(b.dataset.recentModel);setTimeout(()=>openRecord(b.dataset.recentKey),50)}});
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.close)));document.querySelectorAll(".modal-backdrop").forEach(b=>b.addEventListener("click",()=>b.parentElement.classList.add("hidden")));
  document.getElementById("loginForm").addEventListener("submit",login);document.getElementById("addModelForm")?.addEventListener("submit",addModel);document.getElementById("editModelSelect")?.addEventListener("change",e=>loadEditModelFields(e.target.value));
  const passwordToggle=document.getElementById("passwordToggle");
  passwordToggle?.addEventListener("click",()=>{const input=document.getElementById("passwordInput"); const showing=input.type==="text"; input.type=showing?"password":"text"; passwordToggle.innerHTML=showing?'<i class="fa-solid fa-eye"></i>':'<i class="fa-solid fa-eye-slash"></i>'; passwordToggle.setAttribute("aria-label",showing?"Show password":"Hide password"); passwordToggle.title=showing?"Show password":"Hide password"});
  document.getElementById("uploadModel").addEventListener("change",e=>{populateUploadRecords(e.target.value);const first=document.getElementById("uploadRecord")?.value;if(first)document.getElementById("uploadRecord").value=first;updateSubpartSelector()});document.getElementById("uploadRecord").addEventListener("change",()=>updateSubpartSelector());
  document.getElementById("dropZone").addEventListener("click",()=>document.getElementById("fileInput").click());document.getElementById("dropZone").addEventListener("dragover",e=>{e.preventDefault();document.getElementById("dropZone").classList.add("drag-active")});document.getElementById("dropZone").addEventListener("dragleave",()=>document.getElementById("dropZone").classList.remove("drag-active"));document.getElementById("dropZone").addEventListener("drop",e=>{e.preventDefault();document.getElementById("dropZone").classList.remove("drag-active");selectFile(e.dataTransfer.files[0])});document.getElementById("fileInput").addEventListener("change",e=>selectFile(e.target.files[0]));document.getElementById("uploadForm").addEventListener("submit",upload);
  document.getElementById("backupBtn").addEventListener("click",backupCompleteRepository);document.getElementById("restoreBtn")?.addEventListener("click",()=>document.getElementById("restoreInput")?.click());document.getElementById("restoreInput")?.addEventListener("change",restoreCompleteRepository);document.getElementById("resetBtn").addEventListener("click",resetData);
  document.addEventListener("keydown",e=>{const tag=document.activeElement?.tagName||"",typing=/INPUT|TEXTAREA|SELECT/.test(tag);if(e.key==="Escape")document.querySelectorAll(".modal:not(.hidden)").forEach(m=>m.classList.add("hidden"));if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();document.getElementById("parameter360HeaderBtn")?.click()}if(e.key==="/"&&!typing){e.preventDefault();document.getElementById("parameter360HeaderBtn")?.click()}if(e.key.toLowerCase()==="f"&&!typing)toggleFullscreen();if(e.key.toLowerCase()==="p"&&!typing){e.preventDefault();document.getElementById("presentationBtn").click()}if((e.key==="ArrowLeft"||e.key==="ArrowRight")&&!typing&&!document.querySelector(".modal:not(.hidden)")){navigateRecord(e.key==="ArrowLeft"?-1:1)}});
}
function syncDraftPrefs(){draftPrefs={theme:document.getElementById("themeSelect").value,accent:document.getElementById("accentSelect").value,density:document.getElementById("densitySelect").value,motion:document.getElementById("motionToggle").checked}}
function openSettings(){draftPrefs={...prefs};applySettingsForm();openModal("settingsModal")}
function applySettingsForm(){document.getElementById("themeSelect").value=draftPrefs.theme;document.getElementById("accentSelect").value=draftPrefs.accent;document.getElementById("densitySelect").value=draftPrefs.density;document.getElementById("motionToggle").checked=draftPrefs.motion}
function applyDraftPrefs(closeAfter){syncDraftPrefs();prefs={...draftPrefs};savePrefs();applyPrefs();if(closeAfter)closeModal("settingsModal")}
function applyPrefs(){document.body.classList.toggle("no-motion",!prefs.motion);document.body.dataset.theme=prefs.theme;document.body.dataset.accent=prefs.accent;document.body.dataset.density=prefs.density;applySettingsForm();document.getElementById("themeIcon").className=`fa-solid fa-${prefs.theme==="dark"?"sun":"moon"}`}
function clearFilters(){query="";activeCategory="all";favoritesOnly=false;sortMode="default";document.getElementById("sortSelect").value="default";document.getElementById("favoritesToggle").classList.remove("active");renderCategories();renderCards()}
function toggleFavorite(id){favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];localStorage.setItem("MOBILE_RND_FAVORITES_V1",JSON.stringify(favorites));renderCards();toast(favorites.includes(id)?"Added to favorites.":"Removed from favorites.","info")}
async function toggleFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{toast("Fullscreen is not available.","error")}}
function customModels(){return readJson(CUSTOM_MODELS_KEY,[]).filter(x=>x&&x.code&&data[x.code])}
function editableModels(){return modelList()}
function openAddModelModal(){if(!isAdmin){toast("Admin authentication is required.","error");return}setModelAdminFormMode("add");const f=document.getElementById("addModelForm");f?.reset();if(f)delete f.dataset.editingCode;document.getElementById("addModelError")?.classList.add("hidden");openModal("addModelModal")}
function openEditModelModal(){if(!isAdmin){toast("Admin authentication is required.","error");return}const models=editableModels();if(!models.length){toast("No editable model is available.","info");return}setModelAdminFormMode("edit");const f=document.getElementById("addModelForm");if(f)f.dataset.editingCode=models[0];populateEditModelSelect(models[0]);openModal("addModelModal")}
function setModelAdminFormMode(mode){const edit=mode==="edit",title=document.getElementById("addModelTitle"),desc=document.querySelector("#addModelModal .modal-description"),submit=document.getElementById("addModelSubmit"),icon=document.querySelector("#addModelModal .modal-icon i"),wrap=document.getElementById("editModelSelectWrap"),code=document.getElementById("newModelCode"),help=document.getElementById("addModelHelp");if(title)title.textContent=edit?"Edit Existing Model":"Add New Model";if(desc)desc.textContent=edit?"Admin-only model update. Existing engineering records and uploaded files are preserved.":"Admin-only model registration. New models appear automatically in the model selector.";if(submit)submit.innerHTML=edit?'<i class="fa-solid fa-floppy-disk"></i> Save Updated Model':'<i class="fa-solid fa-plus"></i> Add Model';if(icon)icon.className=`fa-solid ${edit?"fa-pen-to-square":"fa-square-plus"}`;wrap?.classList.toggle("hidden",!edit);if(code)code.readOnly=false;if(help)help.innerHTML=edit?'<i class="fa-solid fa-database"></i> Updated model details are stored locally in this browser and survive page reloads.':'<i class="fa-solid fa-database"></i> Model registration is stored locally in this browser and survives page reloads.';["newModelName","newModelProcessor","newModelYear","newModelPic","newModelRf","newModelType"].forEach(id=>document.getElementById(id)?.toggleAttribute("required",!edit||id!=="newModelPic"));document.getElementById("addModelForm")?.setAttribute("data-mode",mode)}
function populateEditModelSelect(selected=""){const el=document.getElementById("editModelSelect");if(!el)return;const models=editableModels();el.innerHTML=models.map(code=>`<option value="${escapeHtml(code)}">${escapeHtml(code)} • ${escapeHtml(data[code]?.meta?.name||code)}</option>`).join("");if(selected&&models.includes(selected))el.value=selected;loadEditModelFields(el.value)}
function loadEditModelFields(code){const model=data[code];if(!model)return;document.getElementById("newModelCode").value=code;document.getElementById("newModelName").value=model.meta?.name||"";document.getElementById("newModelProcessor").value=model.meta?.ap||"";document.getElementById("newModelYear").value=model.meta?.modelYear||"";document.getElementById("newModelPic").value=model.meta?.sielHwPic||model.meta?.leadKorea||"";document.getElementById("newModelRf").value=model.meta?.rfNetwork||model.meta?.modem||"";document.getElementById("newModelType").value=model.meta?.modelType||(model.meta?.status==="Mass Production"?"Mass Production Model":"Development Model")}
async function addModel(e){
  e.preventDefault(); if(!isAdmin)return;
  const form=document.getElementById("addModelForm"),mode=form?.dataset.mode||"add";
  const selectedOld=form?.dataset.editingCode||"";
  const code=document.getElementById("newModelCode").value.trim().toUpperCase(),name=document.getElementById("newModelName").value.trim(),processor=document.getElementById("newModelProcessor").value.trim(),modelYear=document.getElementById("newModelYear").value.trim(),pic=document.getElementById("newModelPic").value.trim(),rf=document.getElementById("newModelRf").value.trim(),modelType=document.getElementById("newModelType").value,err=document.getElementById("addModelError");
  const fail=msg=>{err.textContent=msg;err.classList.remove("hidden")}; err.classList.add("hidden");
  if(!/^[A-Z][A-Z0-9_-]{1,23}$/.test(code))return fail("Use a valid model code (2–24 characters, letters/numbers/_/-).");
  if(!name||!processor||!modelYear||!rf||!["Development Model","Mass Production Model"].includes(modelType)||(mode!=="edit"&&!pic))return fail("Complete all required model information fields.");
  if(mode==="edit"){
    if(!selectedOld||!data[selectedOld])return fail("Select a valid existing model to edit.");
    if(code!==selectedOld&&modelList().includes(code))return fail("That model code is already in use.");
    const model=data[selectedOld]; model.meta={...model.meta,name,ap:processor,modelYear,sielHwPic:pic,rfNetwork:rf,modem:rf,leadKorea:pic,modelType,status:modelType==="Mass Production Model"?"Mass Production":"Development"};
    if(code!==selectedOld){
      const modelIds=stableIdMap(MODEL_IDS_KEY), slotIds=stableIdMap(SLOT_IDS_KEY);
      if(modelIds[selectedOld]) await renameModelCode(modelIds[selectedOld],code);
      if(modelIds[selectedOld]){modelIds[code]=modelIds[selectedOld];delete modelIds[selectedOld];localStorage.setItem(MODEL_IDS_KEY,JSON.stringify(modelIds));}
      const migratedSlots={}; Object.entries(slotIds).forEach(([k,v])=>{if(k.startsWith(selectedOld+"::"))migratedSlots[code+k.slice(selectedOld.length)]=v;else migratedSlots[k]=v}); localStorage.setItem(SLOT_IDS_KEY,JSON.stringify(migratedSlots));
      data[code]=model; delete data[selectedOld];
      const custom=readJson(CUSTOM_MODELS_KEY,[]).filter(x=>x.code!==selectedOld); custom.push({code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType}); localStorage.setItem(CUSTOM_MODELS_KEY,JSON.stringify(custom));
      if(currentModel===selectedOld) currentModel=code;
      const last=localStorage.getItem("MOBILE_RND_LAST_MODEL_V1"); if(last===selectedOld)localStorage.setItem("MOBILE_RND_LAST_MODEL_V1",code);
      const recent=readJson("MOBILE_RND_RECENT_V1",[]).map(x=>String(x).startsWith(selectedOld+":")?code+String(x).slice(selectedOld.length):x); localStorage.setItem("MOBILE_RND_RECENT_V1",JSON.stringify(recent));
    } else {const custom=readJson(CUSTOM_MODELS_KEY,[]);const idx=custom.findIndex(x=>x.code===code);if(idx>=0)custom[idx]={...custom[idx],code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType};else if(!MODEL_ORDER.includes(code))custom.push({code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});localStorage.setItem(CUSTOM_MODELS_KEY,JSON.stringify(custom));}
    saveData();closeModal("addModelModal");populateUploadModels(currentModel);renderAll();renderModelPicker("");const picker=document.getElementById("modelPickerInput");if(picker)picker.value=currentModel;toast(`${code} model details updated.`,"success");await addAudit("MODEL_EDIT",{oldModel:selectedOld,model:code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});return;
  }
  if(modelList().includes(code))return fail("This model code already exists. Use Edit Model to update its details.");
  const defaults=createDefaultData().A576,model=clone(defaults);model.meta={...model.meta,name,ap:processor,modelYear,sielHwPic:pic,rfNetwork:rf,modem:rf,leadKorea:pic,modelType,status:modelType==="Mass Production Model"?"Mass Production":"Development"};
  for(const item of Object.values(model.items)){if(item.filename)item.filename=item.filename.replaceAll("A576",code);item.subItems?.forEach(sub=>{if(sub.filename)sub.filename=sub.filename.replaceAll("A576",code)});item.mergedSources?.forEach(src=>{if(src.filename)src.filename=src.filename.replaceAll("A576",code)})}
  data[code]=model;const custom=readJson(CUSTOM_MODELS_KEY,[]);custom.push({code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});localStorage.setItem(CUSTOM_MODELS_KEY,JSON.stringify(custom));saveData();closeModal("addModelModal");populateUploadModels(currentModel);renderAll();renderModelPicker("");toast(`${code} added to the model selection list.`,"success");await addAudit("MODEL_ADD",{model:code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});
}
function login(e){e.preventDefault();const input=document.getElementById("passwordInput");const error=document.getElementById("loginError");if(input.value==="admin123"){isAdmin=true;sessionStorage.setItem(AUTH_KEY,"true");closeModal("loginModal");document.getElementById("passwordInput").value="";renderAuth();renderCards();document.dispatchEvent(new Event("rnd-auth-changed"));toast("Admin session authenticated.","success");addAudit("LOGIN")}else{error.classList.remove("hidden");input.classList.add("input-error");input.focus();setTimeout(()=>input.classList.remove("input-error"),700)}}
function selectFile(file){if(!isAdmin){toast("Admin authentication is required to upload documents.","error");return}if(!file)return;const ext=file.name.split(".").pop().toLowerCase();if(!ALLOWED.includes(ext)){toast(`File type .${ext} is not supported.`,"error");return}if(file.size>MAX_FILE_SIZE){toast("File exceeds the 500 MB application limit.","error");return}selectedFile=file;document.getElementById("fileName").textContent=`${file.name} (${formatBytes(file.size)})`;document.getElementById("uploadStatus").textContent="File ready for upload."}
async function upload(e){
  e.preventDefault();if(!selectedFile){toast("Please select a file first.","error");return}
  const model=document.getElementById("uploadModel").value,key=document.getElementById("uploadRecord").value,note=document.getElementById("uploadNote").value.trim(),revision=document.getElementById("uploadRevision")?.value.trim()||"",item=data[model]?.items?.[key];
  if(!item){toast("Upload target is not available.","error");return}
  const selector=document.getElementById("uploadSubPart"),sourceValue=selector?.value||"";
  let slotKey="main",targetLabel=item.title,source=null;
  if(Array.isArray(item.mergedSources)&&item.mergedSources.length){ source=item.mergedSources.find(x=>String(x.key)===String(sourceValue))||item.mergedSources[0]; slotKey=String(source.key); targetLabel=`${item.title} / ${source.name}`; }
  else if(Array.isArray(item.subItems)&&item.subItems.length){ const idx=Number(sourceValue); source=item.subItems[idx]; if(!source){toast("Select a document entry first.","error");return} slotKey=subpartId(source,idx); targetLabel=`${item.title} / ${source.name}`; }
  const btn=document.getElementById("saveUploadBtn"),progressWrap=document.getElementById("uploadProgressWrap"),progress=document.getElementById("uploadProgress"),status=document.getElementById("uploadStatus");btn.disabled=true;progressWrap.classList.remove("hidden");progress.style.width="0%";if(status)status.textContent=`Saving large file in secure browser storage… 0%`;
  try{
    const saved=await (async()=>{ const bundle=await listDocumentsByContext({modelCode:model,recordCode:key,slotKey}); if(!bundle.slot) throw new Error("Document slot is not registered."); const {saveVersionForSlot}=await import("./database.js"); const version=await saveVersionForSlot(bundle.slot.slotId,selectedFile,{revision,note},(pct,part,total)=>{progress.style.width=`${pct}%`;if(status)status.textContent=`Saving large file in secure browser storage… ${pct}% (${part}/${total} chunks)`}); version._context={modelId:bundle.slot.modelId,recordId:bundle.slot.recordId,slotId:bundle.slot.slotId}; return version; })();
    if(source){source.uploadedFilename=selectedFile.name;source.uploadedSize=formatBytes(selectedFile.size);source.updatedAt=new Date().toISOString();if(note)source.detail=note;}
    else {item.filename=selectedFile.name;item.size=formatBytes(selectedFile.size);item.uploadedFilename=selectedFile.name;item.uploadedSize=formatBytes(selectedFile.size);if(note)item.tags=[note];}
    saveData();await addAudit("UPLOAD",{model,key,subpart:source?.name||"",filename:selectedFile.name,size:selectedFile.size,modelId:saved._context?.modelId||null,recordId:saved._context?.recordId||null,slotId:saved._context?.slotId||null,versionId:saved.versionId,revision:saved.revision||""});
    if(status)status.textContent="Upload completed successfully.";
    expandedCards.add(key);await refreshUploadedFlags(currentModel);renderAll();closeModal("uploadModal");toast(`${selectedFile.name} saved to ${targetLabel}.`,`success`);selectedFile=null;document.getElementById("uploadForm").reset();document.getElementById("uploadModel").value=currentModel;populateUploadRecords(currentModel);document.getElementById("fileName").textContent="Drop file here or click to browse";if(document.getElementById("uploadRevision"))document.getElementById("uploadRevision").value="";if(document.getElementById("uploadNote"))document.getElementById("uploadNote").value="";updateSubpartSelector();
  }catch(err){console.error("Large file upload failed",err);if(status)status.textContent="Upload failed. The file was not committed.";toast("Could not save the file to IndexedDB. Check available browser storage and try again.","error")}finally{btn.disabled=false;setTimeout(()=>progressWrap.classList.add("hidden"),300)}
}

async function downloadRecord(versionId,filename){
  try{const record=await getFileVersion(versionId); if(!record?.blob){toast("No uploaded file is available for this version.","info");return;} const ok=downloadBlob(record.blob,record.filename||filename); if(ok){await addAudit("DOWNLOAD",{versionId,filename:record.filename||filename});toast("Download started.","success")}else toast("Browser blocked the download. Please allow downloads for this site.","error");}
  catch(err){console.error("File download lookup failed",err);toast("No uploaded file is available for this record.","info")}
}
async function previewStoredFile(storageKey,filename){
  try{
    const record=await getFileVersion(storageKey);if(!record?.blob){toast("No uploaded file is available for preview.","info");return;}
    const name=record.filename||filename||"file", ext=fileExtension(name), blob=normalizeFileBlob(record.blob,name), type=blob.type||mimeForFilename(name);
    if(activePreviewObjectUrl)URL.revokeObjectURL(activePreviewObjectUrl);
    const objectUrl=URL.createObjectURL(blob); activePreviewObjectUrl=objectUrl;
    const body=document.getElementById("filePreviewBody"),title=document.getElementById("filePreviewTitle"),meta=document.getElementById("filePreviewMeta");
    if(title)title.textContent=name; if(meta)meta.textContent=`${currentModel} · ${formatBytes(record.size||blob.size)} · ${type}`;
    if(body){
      if(type.startsWith("image/")||["png","jpg","jpeg","webp","gif"].includes(ext)) body.innerHTML=`<img class="file-preview-image" src="${objectUrl}" alt="${escapeHtml(name)}">`;
      else if(type==="application/pdf"||ext==="pdf") body.innerHTML=`<iframe class="file-preview-frame" src="${objectUrl}#view=FitH" title="PDF preview"></iframe>`;
      else if(type.startsWith("text/")||["csv","txt"].includes(ext)){const text=await blob.text();body.innerHTML=`<pre class="file-preview-text">${escapeHtml(text.slice(0,200000))}</pre>`;}
      else body.innerHTML=`<div class="file-preview-unsupported"><i class="fa-solid fa-file-circle-check"></i><strong>File uploaded successfully.</strong><span>This format is stored safely but your browser does not provide an inline viewer for it.</span><button type="button" class="btn btn-dark" id="inlinePreviewDownload"><i class="fa-solid fa-download"></i> Download</button></div>`;
      document.getElementById("inlinePreviewDownload")?.addEventListener("click",()=>downloadRecord(storageKey,name));
    }
    document.getElementById("filePreviewModal")?.classList.remove("hidden");
  }catch(err){console.error("Preview failed",err);toast("Unable to preview this file.","error")}
}

function recordData(key){return currentItems()[key]}
async function copyRecord(key){const i=recordData(key),entries=expandedFileMap.get(key)||[];const files=entries.map(x=>{const versions=(x.versions||[]).map(v=>`${v.versionLabel}: ${v.filename} | ${v.size}`).join("\n    ");return `${x.name}: ${x.present?"PRESENT":"MISSING"} | ${x.versionCount||0} version(s)${versions?`\n    ${versions}`:""}`}).join("\n");const text=`${currentModel}\n${i.title}\nCategory: ${i.category}\n${files}`;try{await navigator.clipboard.writeText(text);toast(`${i.title} copied.`,`success`)}catch{toast("Clipboard access is unavailable.","error")}}
async function copyLink(key){const url=`${location.href.split("#")[0]}#record/${currentModel}/${key}`;try{await navigator.clipboard.writeText(url);toast("Record link copied.","success")}catch{toast("Clipboard access is unavailable.","error")}}
async function copySpecs(){const m=data[currentModel].meta;try{await navigator.clipboard.writeText(`Model: ${currentModel} (${m.name})\nProcessor: ${m.ap}\nLaunch Year: ${m.modelYear||"—"}\nKorea Lead / SIEL HW PIC: ${m.sielHwPic||m.leadKorea||"—"}\nRF / Network: ${m.rfNetwork||m.modem||"—"}\nModel Type: ${m.modelType||(m.status==="Mass Production"?"Mass Production Model":"Development Model")}\nStatus: ${m.status}`);toast("Model specification copied.","success")}catch{toast("Clipboard access is unavailable.","error")}}
async function backupCompleteRepository(){
  try{
    const appState={data,favorites,recentlyViewed,prefs,currentModel,activeCategory,customModels:readJson(CUSTOM_MODELS_KEY,[]),modelIds:readJson(MODEL_IDS_KEY,{}),recordIds:readJson(RECORD_IDS_KEY,{}),slotIds:readJson(SLOT_IDS_KEY,{}),lastModel:localStorage.getItem("MOBILE_RND_LAST_MODEL_V1")};
    const blob=await createFullBackup(appState);
    const ok=downloadBlob(blob,`MobileRD_Full_Backup_${dateStamp()}.mrdbackup`);
    if(ok) toast(`Complete backup created (${formatBytes(blob.size)}). Includes metadata and uploaded binaries.`,`success`); else toast("Browser blocked the backup download. Please allow downloads for this site.","error");
  }catch(err){console.error("Complete backup failed",err);toast(`Backup failed: ${err.message||"Unknown error"}`,"error")}
}
async function restoreCompleteRepository(e){
  const input=e.target,file=input?.files?.[0]; if(!file)return;
  if(!confirm(`Restore the complete dashboard from ${file.name}? Existing local models, records, files, versions and audit data will be replaced.`)){input.value="";return}
  try{
    const manifest=await restoreFullBackup(file); const state=manifest.appState||{};
    if(state.data){data=state.data;saveData()}
    if(Array.isArray(state.favorites)){favorites=state.favorites;localStorage.setItem("MOBILE_RND_FAVORITES_V1",JSON.stringify(favorites))}
    if(Array.isArray(state.recentlyViewed)){recentlyViewed=state.recentlyViewed;localStorage.setItem("MOBILE_RND_RECENT_V1",JSON.stringify(recentlyViewed))}
    if(state.prefs){prefs={...prefs,...state.prefs};savePrefs()}
    if(state.customModels)localStorage.setItem(CUSTOM_MODELS_KEY,JSON.stringify(state.customModels));
    if(state.modelIds)localStorage.setItem(MODEL_IDS_KEY,JSON.stringify(state.modelIds));
    if(state.recordIds)localStorage.setItem(RECORD_IDS_KEY,JSON.stringify(state.recordIds));
    if(state.slotIds)localStorage.setItem(SLOT_IDS_KEY,JSON.stringify(state.slotIds));
    if(state.lastModel)localStorage.setItem("MOBILE_RND_LAST_MODEL_V1",state.lastModel);
    if(state.currentModel) currentModel=state.currentModel; if(state.activeCategory) activeCategory=state.activeCategory;
    toast("Complete backup restored successfully. Reloading dashboard…","success"); setTimeout(()=>location.reload(),500);
  }catch(err){console.error("Complete restore failed",err);toast(`Restore failed: ${err.message||"Invalid backup"}`,"error")} finally{input.value=""}
}
function exportModel(){downloadText(JSON.stringify(data[currentModel],null,2),`${currentModel}_Engineering_Master.json`);toast("Model JSON exported.","success")}
async function exportReport(){
  const m=data[currentModel].meta,entries=filteredEntries();
  const rows=await Promise.all(entries.map(async([k,i])=>{
    if(k==="M"){
      const subs=Array.isArray(i.subItems)?i.subItems:[];
      const subRows=await Promise.all(subs.map(async(s,index)=>{
        const b=await listDocumentsByContext({modelCode:currentModel,recordCode:k,slotKey:subpartId(s,index)});const stored=b.versions?.at(-1)||null;
        return `  - ${s.name} | ${stored?.filename||"MISSING"} | ${stored?formatBytes(stored.size):"MISSING"}`;
      }));
      return [`${k} | ${i.title} | ${i.category}`,...subRows].join("\n");
    }
    const b=await listDocumentsByContext({modelCode:currentModel,recordCode:k,slotKey:"main"});const stored=b.versions?.at(-1)||null;
    return `${k} | ${i.title} | ${i.category} | ${stored?.filename||"MISSING"} | ${stored?formatBytes(stored.size):"MISSING"}`;
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
function openPresentation(key){const i=recordData(key);if(!i)return;const entries=expandedFileMap.get(key)||[];document.getElementById("presentationContent").innerHTML=`<div class="presentation-code">${currentModel} · ${escapeHtml(i.title)}</div><h2>${escapeHtml(i.title)}</h2><div class="presentation-category">${escapeHtml(i.category)}</div><div class="presentation-tags">${(i.tags||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("")}</div><div class="presentation-file">${entries.map(x=>`<strong>${escapeHtml(x.name)}</strong><span class="${x.present?"status-present":"status-missing"}">${x.present?"PRESENT":"MISSING"}</span><strong>File</strong><span>${escapeHtml(x.filename)}</span><strong>Size</strong><span>${escapeHtml(x.size)}</span>`).join("")}</div>`;openModal("presentationModal")}
function navigateRecord(delta){const arr=Object.keys(currentItems()).sort(compareRecordCodes),idx=arr.indexOf(location.hash.split("/").pop()),next=arr[Math.max(0,Math.min(arr.length-1,(idx<0?0:idx)+delta))];if(next)openRecord(next)}
async function resetData(){if(!confirm("Reset all local dashboard data and stored files? This cannot be undone."))return;data=createDefaultData();saveData();await deleteAllFiles();await deleteAuditLogs();await ensureRepositoryIdentity();uploadedFiles=new Map();uploadedKeys=new Set();favorites=[];recentlyViewed=[];expandedCards.clear();localStorage.removeItem("MOBILE_RND_FAVORITES_V1");localStorage.removeItem("MOBILE_RND_RECENT_V1");localStorage.removeItem(CUSTOM_MODELS_KEY);currentModel=modelList()[0];activeCategory="all";query="";renderCategories();populateUploadModels(currentModel);renderAll();closeModal("settingsModal");toast("Local data reset to default dataset.","success")}
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
