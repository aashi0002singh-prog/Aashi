const DB_NAME="MobileRD_Master_DB";
const DB_VERSION=5;
const CHUNK_STORE="file_chunks";
const CHUNK_SIZE=4*1024*1024;
const FILE_STORE="files";
const LEGACY_FILE_STORE="heavy_files";
const LOG_STORE="audit";

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      const tx=e.target.transaction;
      if(!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE);
      if(!db.objectStoreNames.contains(CHUNK_STORE)) db.createObjectStore(CHUNK_STORE);
      if(!db.objectStoreNames.contains(LOG_STORE)) db.createObjectStore(LOG_STORE,{keyPath:"id",autoIncrement:true});
      if(db.objectStoreNames.contains(LEGACY_FILE_STORE)){
        const oldStore=tx.objectStore(LEGACY_FILE_STORE),newStore=tx.objectStore(FILE_STORE);
        oldStore.openCursor().onsuccess=event=>{
          const cursor=event.target.result;
          if(!cursor)return;
          const value=cursor.value;
          if(value?.blob)newStore.put(value,cursor.primaryKey);
          else if(value instanceof Blob)newStore.put({blob:value,filename:String(cursor.primaryKey),size:value.size,type:value.type||"",updatedAt:new Date().toISOString()},cursor.primaryKey);
          cursor.continue();
        };
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("IndexedDB open failed"));
  });
}

export async function saveFile(key,file,onProgress){
  if(!file) throw new Error("No file selected");
  const db=await openDB();
  const total=Math.max(1,Math.ceil(file.size/CHUNK_SIZE));
  const now=new Date().toISOString();
  const metadata={filename:file.name,size:file.size,type:file.type||"application/octet-stream",updatedAt:now,chunked:true,chunkCount:total,status:"writing"};
  const old=await new Promise((resolve,reject)=>{
    const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).get(key);
    req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error||new Error("File lookup failed"));
    tx.onerror=()=>reject(tx.error||new Error("File lookup failed"));
  });
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction([FILE_STORE,CHUNK_STORE],"readwrite");
      tx.objectStore(FILE_STORE).put(metadata,key);
      if(old?.chunked&&old.chunkCount){for(let i=0;i<old.chunkCount;i++)tx.objectStore(CHUNK_STORE).delete([key,i]);}
      tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error||new Error("File preparation failed")); tx.onabort=()=>reject(tx.error||new Error("File preparation aborted"));
    });
    for(let i=0;i<total;i++){
      const start=i*CHUNK_SIZE,end=Math.min(file.size,start+CHUNK_SIZE),chunk=file.slice(start,end);
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(CHUNK_STORE,"readwrite");
        tx.objectStore(CHUNK_STORE).put(chunk,[key,i]);
        tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error||new Error("File chunk save failed")); tx.onabort=()=>reject(tx.error||new Error("File chunk save aborted"));
      });
      if(typeof onProgress==="function")onProgress(Math.round(((i+1)/total)*100),i+1,total);
      await new Promise(r=>setTimeout(r,0));
    }
    metadata.status="complete";
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_STORE,"readwrite");
      tx.objectStore(FILE_STORE).put(metadata,key);
      tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error||new Error("File finalize failed")); tx.onabort=()=>reject(tx.error||new Error("File finalize aborted"));
    });
  }catch(err){
    try{
      await new Promise(resolve=>{
        const tx=db.transaction([FILE_STORE,CHUNK_STORE],"readwrite");
        tx.objectStore(FILE_STORE).delete(key);
        for(let i=0;i<total;i++)tx.objectStore(CHUNK_STORE).delete([key,i]);
        tx.oncomplete=resolve; tx.onerror=resolve; tx.onabort=resolve;
      });
    }catch{}
    throw err;
  }finally{db.close()}
}


export async function getFiles(keys=[]){
  const wanted=[...new Set((keys||[]).filter(Boolean))];
  if(!wanted.length)return new Map();
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(FILE_STORE,"readonly");
    const store=tx.objectStore(FILE_STORE);
    const out=new Map(); let settled=false;
    const fail=err=>{if(settled)return;settled=true;try{db.close()}catch{};reject(err||new Error("File lookup failed"))};
    tx.oncomplete=()=>{if(settled)return;settled=true;try{db.close()}catch{};resolve(out)};
    tx.onerror=()=>fail(tx.error); tx.onabort=()=>fail(tx.error||new Error("File lookup aborted"));
    for(const key of wanted){
      const req=store.get(key);
      req.onsuccess=()=>{const r=req.result;if(r&&(r.status==="complete"||!r.status))out.set(key,{...r,blob:r.chunked?null:r.blob})};
      req.onerror=()=>fail(req.error);
    }
  });
}

export async function getFile(key){
  const db=await openDB();
  try{
    const record=await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).get(key);
      req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error||new Error("File lookup failed"));
      tx.onerror=()=>reject(tx.error||new Error("File lookup failed"));
    });
    if(!record||record.status==="writing")return null;
    if(!record.chunked)return record;
    const chunks=[];
    for(let i=0;i<record.chunkCount;i++){
      const chunk=await new Promise((resolve,reject)=>{
        const tx=db.transaction(CHUNK_STORE,"readonly"),req=tx.objectStore(CHUNK_STORE).get([key,i]);
        req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error||new Error("File chunk lookup failed"));
        tx.onerror=()=>reject(tx.error||new Error("File chunk lookup failed"));
      });
      if(!chunk)throw new Error("Uploaded file is incomplete");
      chunks.push(chunk);
    }
    return {...record,blob:new Blob(chunks,{type:record.type||"application/octet-stream"})};
  }finally{db.close()}
}


export async function listFileVersions(baseKey){
  const db=await openDB();
  try{
    const keys=await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).getAllKeys();
      req.onsuccess=()=>resolve(req.result||[]);
      req.onerror=()=>reject(req.error||new Error("File version lookup failed"));
      tx.onerror=()=>reject(tx.error||new Error("File version lookup failed"));
    });
    const matching=keys.filter(k=>typeof k==="string"&&(k===baseKey||k.startsWith(baseKey+"::v::")));
    const out=[];
    for(const key of matching){
      const record=await new Promise((resolve,reject)=>{
        const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).get(key);
        req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error("File version read failed"));
        tx.onerror=()=>reject(tx.error||new Error("File version read failed"));
      });
      if(record&&(record.status==="complete"||!record.status)) out.push({key,...record,blob:record.chunked?null:record.blob});
    }
    out.sort((a,b)=>String(a.updatedAt||"").localeCompare(String(b.updatedAt||"")));
    return out;
  }finally{db.close()}
}

export async function saveFileVersion(baseKey,file,options={},onProgress){
  const suffix=Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8);
  const versionKey=`${baseKey}::v::${suffix}`;
  await saveFile(versionKey,file,onProgress);
  const db=await openDB();
  try{
    const record=await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).get(versionKey);
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error("Version metadata lookup failed"));
    });
    if(record){
      record.baseKey=baseKey;
      record.versionLabel=String(options.revision||"").trim()||`Version ${new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14)}`;
      record.note=String(options.note||"").trim();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(FILE_STORE,"readwrite");tx.objectStore(FILE_STORE).put(record,versionKey);
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Version metadata save failed"));tx.onabort=()=>reject(tx.error||new Error("Version metadata save aborted"));
      });
    }
    return {key:versionKey,record};
  }finally{db.close()}
}

export async function deleteAllFiles(){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const stores=[FILE_STORE,CHUNK_STORE];
    if(db.objectStoreNames.contains(LEGACY_FILE_STORE))stores.push(LEGACY_FILE_STORE);
    const tx=db.transaction(stores,"readwrite");
    tx.objectStore(FILE_STORE).clear();
    tx.objectStore(CHUNK_STORE).clear();
    if(stores.includes(LEGACY_FILE_STORE))tx.objectStore(LEGACY_FILE_STORE).clear();
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();reject(tx.error||new Error("File reset failed"))};
  });
}

export async function addAudit(action,details={}){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(LOG_STORE,"readwrite");
    tx.objectStore(LOG_STORE).add({action,details,at:new Date().toISOString()});
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();reject(tx.error||new Error("Audit write failed"))};
  });
}

export async function getAuditLogs(limit=100){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(LOG_STORE,"readonly"),req=tx.objectStore(LOG_STORE).getAll();
    req.onsuccess=()=>resolve(req.result.reverse().slice(0,limit));
    req.onerror=()=>reject(req.error||new Error("Audit lookup failed"));
    tx.oncomplete=()=>db.close();
    tx.onerror=()=>{db.close();reject(tx.error||new Error("Audit lookup failed"))};
  });
}

export async function deleteAuditLogs(){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(LOG_STORE,"readwrite");
    tx.objectStore(LOG_STORE).clear();
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();reject(tx.error||new Error("Audit reset failed"))};
    tx.onabort=()=>{db.close();reject(tx.error||new Error("Audit reset aborted"))};
  });
}
