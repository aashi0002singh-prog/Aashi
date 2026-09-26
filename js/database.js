const DB_NAME = 'MobileRD_Master_DB';
const DB_VERSION = 6;
const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_FILE_SIZE = 500 * 1024 * 1024;

let dbPromise;
const req = (request) => new Promise((resolve,reject)=>{ request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded=()=>{
      const db=r.result;
      if(!db.objectStoreNames.contains('files')) db.createObjectStore('files',{keyPath:'key'});
      if(!db.objectStoreNames.contains('file_chunks')) db.createObjectStore('file_chunks',{keyPath:['key','index']});
      if(!db.objectStoreNames.contains('audit')) db.createObjectStore('audit',{keyPath:'id',autoIncrement:true});
      if(!db.objectStoreNames.contains('heavy_files')) db.createObjectStore('heavy_files',{keyPath:'key'});
      if(!db.objectStoreNames.contains('models')) db.createObjectStore('models',{keyPath:'modelId'}).createIndex('modelCode','modelCode',{unique:true});
      if(!db.objectStoreNames.contains('records')) db.createObjectStore('records',{keyPath:'recordId'}).createIndex('code','code',{unique:true});
      if(!db.objectStoreNames.contains('slots')){
        const s=db.createObjectStore('slots',{keyPath:'slotId'});
        s.createIndex('modelId','modelId'); s.createIndex('recordId','recordId'); s.createIndex('modelRecord','modelRecord');
      }
      if(!db.objectStoreNames.contains('versions')){
        const s=db.createObjectStore('versions',{keyPath:'versionId'});
        s.createIndex('slotId','slotId'); s.createIndex('createdAt','createdAt');
      }
      if(!db.objectStoreNames.contains('version_chunks')) db.createObjectStore('version_chunks',{keyPath:['versionId','index']});
      if(!db.objectStoreNames.contains('lab_slots')){ const s=db.createObjectStore('lab_slots',{keyPath:'labSlotId'}); s.createIndex('labItemId','labItemId',{unique:true}); }
      if(!db.objectStoreNames.contains('refs')){
        const s=db.createObjectStore('refs',{keyPath:'refKey'});
        s.createIndex('slotId','slotId'); s.createIndex('modelId','modelId');
      }
    };
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
  return dbPromise;
}
const tx=(stores,mode='readonly')=>openDB().then(db=>db.transaction(stores,mode));
function uuid(prefix='id'){return `${prefix}_${crypto.randomUUID()}`}
function now(){return Date.now()}
function mimeForFilename(filename=""){const ext=String(filename||"").split(".").pop().toLowerCase();return ({pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif",csv:"text/csv",txt:"text/plain",json:"application/json",xml:"application/xml",html:"text/html",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",xls:"application/vnd.ms-excel",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",doc:"application/msword",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",ppt:"application/vnd.ms-powerpoint",zip:"application/zip",dwg:"application/acad",bin:"application/octet-stream"}[ext]||"application/octet-stream")}
function refBase(key){return String(key)}
async function getRef(key){const t=await tx(['refs']); return req(t.objectStore('refs').get(refBase(key)))}
async function ensureSlotForRef(key){
  const existing=await getRef(key); if(existing) return existing.slotId;
  const slotId=uuid('slot');
  const ref={refKey:refBase(key),slotId,legacyKey:refBase(key),createdAt:now()};
  const t=await tx(['refs','slots'],'readwrite');
  t.objectStore('refs').put(ref);
  t.objectStore('slots').put({slotId,modelId:null,recordId:null,name:key,required:true,order:0,legacyKey:key,createdAt:now()});
  await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error)});
  return slotId;
}
async function saveVersion(slotId,file,options={},onProgress){
  if(!file) throw new Error('No file selected.');
  if(file.size>MAX_FILE_SIZE) throw new Error(`File exceeds the 500 MB limit: ${file.name}`);
  const versionId=uuid('ver');
  const createdAt=now();
  const normalizedType=mimeForFilename(file.name,file.type||'application/octet-stream');
  const meta={versionId,slotId,filename:file.name,size:file.size,type:normalizedType,revision:String(options.revision||'').trim(),note:String(options.note||''),createdAt,createdBy:options.createdBy||'Admin',chunkCount:Math.ceil(file.size/CHUNK_SIZE),status:'ready'};
  const db=await openDB();
  const t=db.transaction(['versions','version_chunks'],'readwrite');
  t.objectStore('versions').put(meta);
  const store=t.objectStore('version_chunks');
  for(let index=0,offset=0;offset<file.size;index++,offset+=CHUNK_SIZE){
    store.put({versionId,index,data:await file.slice(offset,Math.min(offset+CHUNK_SIZE,file.size)).arrayBuffer()});
    onProgress?.(Math.min(100,Math.round((Math.min(offset+CHUNK_SIZE,file.size)/file.size)*100)));
  }
  await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Upload aborted'))});
  return meta;
}
async function readVersion(versionId){
  const db=await openDB();
  const meta=await req(db.transaction('versions').objectStore('versions').get(versionId));
  if(!meta) return null;
  const t=db.transaction('version_chunks'); const index=t.objectStore('version_chunks').index ? null : null;
  const chunks=[];
  return new Promise((resolve,reject)=>{
    const r=t.objectStore('version_chunks').openCursor(IDBKeyRange.bound([versionId,0],[versionId,Number.MAX_SAFE_INTEGER]));
    r.onsuccess=()=>{const c=r.result;if(!c){try{resolve({...meta,blob:new Blob(chunks,{type:mimeForFilename(meta.filename,meta.type||'application/octet-stream')})})}catch(e){reject(e)};return} chunks.push(c.value.data);c.continue()};
    r.onerror=()=>reject(r.error);
  });
}
export async function saveFileVersion(baseKey,file,options={},onProgress){const slotId=await ensureSlotForRef(baseKey);return {...await saveVersion(slotId,file,options,onProgress),key:(await getRef(baseKey)).refKey}}
export async function listFileVersions(baseKey){
  const ref=await getRef(baseKey); if(!ref) return legacyAsVersions(baseKey);
  const db=await openDB();
  const list=await req(db.transaction('versions').objectStore('versions').index('slotId').getAll(ref.slotId));
  list.sort((a,b)=>a.createdAt-b.createdAt||a.versionId.localeCompare(b.versionId));
  if(list.length){
    const modern=list.map(v=>({...v,key:v.versionId,versionLabel:v.revision||`v${v.createdAt}`}));
    const legacy=await legacyAsVersions(baseKey); const unmigrated=legacy.filter(x=>!modern.some(v=>v.legacySourceKey===x.key)); return unmigrated.length?[...unmigrated,...modern]:modern;
  }
  return legacyAsVersions(baseKey);
}
async function legacyAsVersions(key){
  const db=await openDB();
  const all=await req(db.transaction('files').objectStore('files').getAll());
  const rows=all.filter(meta=>meta.key===key||String(meta.key).startsWith(`${key}::v::`));
  rows.sort((a,b)=>(a.uploadedAt||0)-(b.uploadedAt||0)||String(a.key).localeCompare(String(b.key)));
  return rows.map((meta,index)=>({versionId:`legacy:${meta.key}`,key:`legacy:${meta.key}`,slotId:null,filename:meta.filename,size:meta.size,type:meta.type,revision:meta.versionLabel||`Legacy ${index+1}`,versionLabel:meta.versionLabel||`Legacy ${index+1}`,note:meta.note||'',createdAt:meta.uploadedAt||index,status:'legacy'}));
}

export async function saveFile(key,file,onProgress){return saveFileVersion(key,file,{},onProgress)}
export async function getFile(key){
  if(String(key).startsWith("ver_")) return readVersion(key);
  if(String(key).startsWith("legacy:")) return readLegacy(String(key).slice(7));
  const versions=await listFileVersions(key); if(!versions.length) return null;
  const latest=versions[versions.length-1];
  if(latest.versionId.startsWith('legacy:')) return readLegacy(key);
  return readVersion(latest.versionId);
}
export async function getFileVersion(versionId){if(String(versionId).startsWith('legacy:')) return readLegacy(String(versionId).slice(7));return readVersion(versionId)}
async function readLegacy(key){
  const db=await openDB(); const meta=await req(db.transaction('files').objectStore('files').get(key)); if(!meta) return null;
  const chunks=[];
  return new Promise((resolve,reject)=>{const t=db.transaction('file_chunks');const r=t.objectStore('file_chunks').openCursor(IDBKeyRange.bound([key,0],[key,Number.MAX_SAFE_INTEGER]));r.onsuccess=()=>{const c=r.result;if(!c){resolve({...meta,blob:new Blob(chunks,{type:mimeForFilename(meta.filename,meta.type||'application/octet-stream')})});return}chunks.push(c.value.data);c.continue()};r.onerror=()=>reject(r.error)})
}
export async function getFiles(keys=[]){const out=[];for(const k of keys){const f=await getFile(k);if(f)out.push(f)}return out}
export async function deleteAllFiles(){const db=await openDB();const stores=['files','file_chunks','heavy_files','versions','version_chunks','refs','slots','lab_slots','models','records'];const t=db.transaction(stores,'readwrite');for(const s of stores)t.objectStore(s).clear();await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}
export async function addAudit(action,details={}){const db=await openDB();const row={action,details,timestamp:now()};const t=db.transaction('audit','readwrite');t.objectStore('audit').add(row);await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}
export async function getAuditLogs(limit=100){const db=await openDB();return new Promise((resolve,reject)=>{const a=db.transaction('audit').objectStore('audit').openCursor(null,'prev'),rows=[];a.onsuccess=()=>{const c=a.result;if(!c||rows.length>=limit){resolve(rows);return}rows.push(c.value);c.continue()};a.onerror=()=>reject(a.error)})}
export async function deleteAuditLogs(){const db=await openDB();const t=db.transaction('audit','readwrite');t.objectStore('audit').clear();await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}
export async function registerModel(model){const db=await openDB();const row={...model,modelId:model.modelId||uuid('model'),updatedAt:now()};const t=db.transaction('models','readwrite');t.objectStore('models').put(row);await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error)});return row}
export async function getModels(){const db=await openDB();return req(db.transaction('models').objectStore('models').getAll())}
export async function renameModelCode(modelId,modelCode){return renameModelId(modelId,modelCode)}
export async function renameModelId(modelId,modelCode){const db=await openDB();const t=db.transaction('models','readwrite');const s=t.objectStore('models');const m=await req(s.get(modelId));if(!m)throw new Error('Model not found.');m.modelCode=modelCode;m.updatedAt=now();s.put(m);await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error)});return m}

export async function renameModelReferences(oldCode,newCode){
  const db=await openDB();
  const t=db.transaction('refs','readwrite');
  const store=t.objectStore('refs');
  const all=await req(store.getAll());
  for(const ref of all){
    if(ref.refKey===oldCode || ref.refKey.startsWith(oldCode+'_')){
      const next={...ref,refKey:newCode+ref.refKey.slice(oldCode.length)};
      store.delete(ref.refKey); store.put(next);
    }
  }
  await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error)});
}
export async function registerRecord(record){const db=await openDB();const t=db.transaction('records','readwrite');t.objectStore('records').put(record);await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error)});return record}
export async function registerSlot(slot){const db=await openDB();const t=db.transaction(['slots','refs'],'readwrite');t.objectStore('slots').put(slot);if(slot.legacyKey)t.objectStore('refs').put({refKey:slot.legacyKey,slotId:slot.slotId,modelId:slot.modelId,recordId:slot.recordId,createdAt:slot.createdAt||now()});await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error)});return slot}
export async function getRepositorySnapshot(){const db=await openDB();const out={};for(const s of ['models','records','slots','versions'])out[s]=await req(db.transaction(s).objectStore(s).getAll());out.audit=await getAuditLogs(1000);return out}

async function allByIndex(storeName,indexName,value){const db=await openDB();return req(db.transaction(storeName).objectStore(storeName).index(indexName).getAll(value))}
export async function resolveDocumentSlot({modelCode,recordCode,slotKey=null,slotIndex=null}){
  const models=await getModels(); const model=models.find(m=>m.modelCode===modelCode); if(!model) return null;
  const records=await req((await tx('records')).objectStore('records').index('code').get(recordCode)); if(!records) return null;
  const slots=await allByIndex('slots','modelId',model.modelId);
  const candidates=slots.filter(s=>s.recordId===records.recordId);
  if(slotKey!=null){const exact=candidates.find(s=>String(s.slotKey||s.legacyKey||'')===String(slotKey)); if(exact)return exact;}
  if(slotIndex!=null)return candidates.slice().sort((a,b)=>(a.order||0)-(b.order||0))[slotIndex]||null;
  return candidates.slice().sort((a,b)=>(a.order||0)-(b.order||0))[0]||null;
}
export async function listVersionsForSlot(slotId){
  if(!slotId)return [];
  const db=await openDB(); const rows=await req(db.transaction('versions').objectStore('versions').index('slotId').getAll(slotId));
  return rows.sort((a,b)=>a.createdAt-b.createdAt||a.versionId.localeCompare(b.versionId));
}
export async function getLatestVersionForSlot(slotId){const rows=await listVersionsForSlot(slotId);return rows.at(-1)||null}
export async function getDocumentByContext(context){
  const slot=await resolveDocumentSlot(context); if(!slot)return null;
  const v=await getLatestVersionForSlot(slot.slotId); if(!v)return null;
  return {...await readVersion(v.versionId),slotId:slot.slotId};
}
export async function listDocumentsByContext(context){
  const slot=await resolveDocumentSlot(context); if(!slot)return {slot:null,versions:[]};
  return {slot,versions:await listVersionsForSlot(slot.slotId)};
}
export async function getRepositoryDocuments(){
  const [models,records,slots]=await Promise.all([getModels(),req((await tx('records')).objectStore('records').getAll()),req((await tx('slots')).objectStore('slots').getAll())]);
  const versions=[]; const db=await openDB(); const allVersions=await req(db.transaction('versions').objectStore('versions').getAll());
  const modelMap=new Map(models.map(x=>[x.modelId,x])),recordMap=new Map(records.map(x=>[x.recordId,x])),bySlot=new Map();
  for(const v of allVersions){const list=bySlot.get(v.slotId)||[];list.push(v);bySlot.set(v.slotId,list);}
  for(const slot of slots){for(const v of (bySlot.get(slot.slotId)||[]))versions.push({...v,modelId:slot.modelId,modelCode:modelMap.get(slot.modelId)?.modelCode||'',recordId:slot.recordId,recordCode:recordMap.get(slot.recordId)?.code||'',slotName:slot.name,slotKey:slot.slotKey});}
  return versions;
}
export async function ensureLabSlot(labItemId,name='Lab Knowledge'){
  const db=await openDB(); const idx=db.transaction('lab_slots').objectStore('lab_slots').index('labItemId'); const existing=await req(idx.get(labItemId)); if(existing)return existing;
  const slot={labSlotId:uuid('labslot'),labItemId:String(labItemId),name,createdAt:now()}; const t=db.transaction('lab_slots','readwrite');t.objectStore('lab_slots').put(slot);await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error)});return slot;
}
export async function migrateLegacyFilesToVersions(){
  const db=await openDB();
  const legacy=await req(db.transaction('files').objectStore('files').getAll());
  if(!legacy.length)return {migrated:0};
  let migrated=0;
  for(const meta of legacy){
    const ref=await getRef(meta.key); if(!ref) await ensureSlotForRef(meta.key);
    const slot=await getRef(meta.key); if(!slot)continue;
    const existing=await listVersionsForSlot(slot.slotId);
    if(existing.some(v=>v.legacySourceKey===meta.key))continue;
    const versionId=uuid('ver');
    const vm={versionId,slotId:slot.slotId,filename:meta.filename||meta.key,size:meta.size||0,type:meta.type||'application/octet-stream',revision:meta.versionLabel||'Legacy',note:meta.note||'',createdAt:meta.uploadedAt||now(),createdBy:'Legacy Migration',chunkCount:meta.chunkCount||0,status:'ready',legacySourceKey:meta.key};
    const sourceDb=await openDB(); const chunks=[];
    await new Promise((resolve,reject)=>{const t=sourceDb.transaction('file_chunks');const r=t.objectStore('file_chunks').openCursor(IDBKeyRange.bound([meta.key,0],[meta.key,Number.MAX_SAFE_INTEGER]));r.onsuccess=()=>{const c=r.result;if(!c){resolve();return}chunks.push(c.value);c.continue()};r.onerror=()=>reject(r.error)});
    const t=sourceDb.transaction(['versions','version_chunks'],'readwrite');t.objectStore('versions').put(vm);for(const c of chunks)t.objectStore('version_chunks').put({versionId,index:c.index,data:c.data});
    await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Legacy migration aborted'))}); migrated++;
  }
  return {migrated};
}
export async function saveVersionForSlot(slotId,file,options={},onProgress){return saveVersion(slotId,file,options,onProgress)}
export async function saveLabVersion(labItemId,file,options={},onProgress){const slot=await ensureLabSlot(labItemId,options.name||'Lab Knowledge');return saveVersion(slot.labSlotId,file,options,onProgress)}
export async function listLabVersions(labItemId){const slot=await ensureLabSlot(labItemId);return listVersionsForSlot(slot.labSlotId)}
export async function getLatestLabVersion(labItemId){const slot=await ensureLabSlot(labItemId);return getLatestVersionForSlot(slot.labSlotId)}
export async function getLabFile(labItemId){const v=await getLatestLabVersion(labItemId);return v?readVersion(v.versionId):null}


function u32(n){const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return b}
function u16(n){const b=new Uint8Array(2);new DataView(b.buffer).setUint16(0,n,true);return b}
function readU32(d,o){return d.getUint32(o,true)}
function readU16(d,o){return d.getUint16(o,true)}
function concatBytes(parts){let n=0;for(const p of parts)n+=p.byteLength;const out=new Uint8Array(n);let o=0;for(const p of parts){out.set(new Uint8Array(p),o);o+=p.byteLength}return out}
const enc=new TextEncoder(), dec=new TextDecoder();
function crc32(bytes){let c=0xffffffff;for(const x of bytes){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}

async function storeAll(store){const db=await openDB();return req(db.transaction(store).objectStore(store).getAll())}
async function clearStores(names){const db=await openDB();const t=db.transaction(names,'readwrite');for(const n of names) t.objectStore(n).clear();await new Promise((r,j)=>{t.oncomplete=r;t.onerror=()=>j(t.error);t.onabort=()=>j(t.error||new Error('Reset aborted'))})}
function jsonSafe(value){return value}

export async function createFullBackup(appState={}){
  const storeNames=['models','records','slots','versions','lab_slots','refs','audit','files','file_chunks','heavy_files'];
  const metadata={version:1,createdAt:now(),dbName:DB_NAME,dbVersion:DB_VERSION,stores:{},appState:jsonSafe(appState)};
  const binary=[];
  for(const name of storeNames){
    const rows=await storeAll(name); metadata.stores[name]=[];
    for(const row of rows){
      if(name==='version_chunks' || name==='file_chunks') continue;
      metadata.stores[name].push(row);
    }
  }
  // Binary stores are represented as raw archive entries so large files never pass through base64.
  const db=await openDB();
  for(const storeName of ['version_chunks','file_chunks']){
    const rows=await req(db.transaction(storeName).objectStore(storeName).getAll());
    for(const row of rows){
      const data=row.data instanceof ArrayBuffer?row.data:row.data?.buffer||row.data;
      if(!data) continue;
      const id=storeName==='version_chunks'?`${row.versionId}::${row.index}`:`${row.key}::${row.index}`;
      binary.push({store:storeName,id,data});
    }
  }
  metadata.binary=binary.map((x,i)=>({store:x.store,id:x.id,index:i,bytes:x.data.byteLength}));
  const manifest=enc.encode(JSON.stringify(metadata));
  const parts=[enc.encode('MRDBACK1'),u32(manifest.byteLength),manifest];
  for(let i=0;i<binary.length;i++){
    const x=binary[i], name=enc.encode(`${x.store}/${x.id}`), bytes=new Uint8Array(x.data);
    parts.push(u16(name.byteLength),u32(bytes.byteLength),u32(crc32(bytes)),name,bytes);
  }
  return new Blob(parts,{type:'application/octet-stream'});
}

export async function restoreFullBackup(blob){
  const buf=await blob.arrayBuffer(), d=new DataView(buf), bytes=new Uint8Array(buf);let p=0;
  const magic=dec.decode(bytes.slice(0,8));if(magic!=='MRDBACK1')throw new Error('Invalid Mobile R&D backup package.');p=8;
  const manifestLen=readU32(d,p);p+=4;const manifest=JSON.parse(dec.decode(bytes.slice(p,p+manifestLen)));p+=manifestLen;
  if(manifest?.version!==1||!manifest.stores)throw new Error('Unsupported or invalid Mobile R&D backup format.');
  const binary=[];
  const descriptors=manifest.binary||[];
  for(let i=0;i<descriptors.length;i++){
    if(p+10>bytes.length)throw new Error('Backup package is truncated.');
    const nameLen=readU16(d,p);p+=2;const len=readU32(d,p);p+=4;const checksum=readU32(d,p);p+=4;
    if(p+nameLen+len>bytes.length)throw new Error('Backup package is truncated.');
    const name=dec.decode(bytes.slice(p,p+nameLen));p+=nameLen;const data=bytes.slice(p,p+len);p+=len;
    const expected=descriptors[i];
    if(!expected||expected.store+'/'+expected.id!==name||Number(expected.bytes)!==len)throw new Error(`Backup manifest mismatch for ${name}`);
    if(crc32(data)!==checksum)throw new Error(`Backup integrity check failed for ${name}`);
    binary.push({name,data});
  }
  if(p!==bytes.length)throw new Error('Backup package contains unexpected trailing data.');
  const active=['models','records','slots','versions','lab_slots','refs','audit','files','heavy_files','file_chunks','version_chunks'];
  await clearStores(active);
  const db=await openDB();
  const writable=['models','records','slots','versions','lab_slots','refs','audit','files','heavy_files'];
  for(const name of writable){const rows=manifest.stores[name]||[];if(!rows.length)continue;const t=db.transaction(name,'readwrite');for(const row of rows)t.objectStore(name).put(row);await new Promise((r,j)=>{t.oncomplete=r;t.onerror=()=>j(t.error)})}
  for(const x of binary){const slash=x.name.indexOf('/');const store=x.name.slice(0,slash), rest=x.name.slice(slash+1), sep=rest.lastIndexOf('::');if(sep<0)continue;const key=rest.slice(0,sep), index=Number(rest.slice(sep+2));const row=store==='version_chunks'?{versionId:key,index,data:x.data.buffer.slice(x.data.byteOffset,x.data.byteOffset+x.data.byteLength)}:{key,index,data:x.data.buffer.slice(x.data.byteOffset,x.data.byteOffset+x.data.byteLength)};const t=db.transaction(store,'readwrite');t.objectStore(store).put(row);await new Promise((r,j)=>{t.oncomplete=r;t.onerror=()=>j(t.error)})}
  return manifest;
}

export const STORAGE_LIMITS=Object.freeze({maxFileSize:MAX_FILE_SIZE,chunkSize:CHUNK_SIZE});
