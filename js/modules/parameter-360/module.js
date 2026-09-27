import {isModuleEnabled} from '../module-manager.js';
import {createDefaultData,slotBaseKey,subpartId} from '../../../data/models.js';
import {getFile,listFileMetadata} from '../../database.js';
import {downloadBlob,escapeHtml,formatBytes,toast} from '../../ui.js';

const esc=escapeHtml;
const modal=()=>document.getElementById('parameter360Modal');
const res=()=>document.getElementById('parameter360Results');
const STORAGE_KEY='MOBILE_RND_DATA';
window.__p360SearchToken=0;

function loadData(){
  try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');return raw&&Object.keys(raw).length?raw:createDefaultData()}
  catch{return createDefaultData()}
}
function storageKeysFor(model,key,sub,index){
  if(sub)return [slotBaseKey(model,key,sub,index)];
  return [`${model}_${key}`];
}
function recordLabel(item,key){return item?.title||key}
function navigateToRecord(model,key){
  modal()?.classList.add('hidden');
  const hash=`#record/${encodeURIComponent(model)}/${encodeURIComponent(key)}`;
  if(location.hash===hash){document.getElementById(`record-${key}`)?.scrollIntoView({behavior:'smooth',block:'center'});return}
  location.hash=hash;
  setTimeout(()=>document.getElementById(`record-${key}`)?.scrollIntoView({behavior:'smooth',block:'center'}),180);
}
async function downloadSearchFile(storageKey,filename){
  try{
    const candidates=String(storageKey||'').split('||').filter(Boolean);
    let record=null;
    for(const key of candidates){record=await getFile(key);if(record?.blob)break;}

    if(!record?.blob){toast('The selected record has no complete uploaded file in local storage.','info');return}
    const ok=downloadBlob(record.blob,record.filename||filename||'engineering-document');
    if(ok)toast('Download started.','success');else toast('Browser blocked the download. Please allow downloads for this site.','error');
  }catch(err){console.error('Parameter 360 download failed',err);toast('Could not retrieve the uploaded file from local storage.','error')}
}
function resultMarkup(r){
  const fileName=r.fileName||'No linked file';
  const size=r.fileSize?` · ${formatBytes(r.fileSize)}`:'';
  const hasFile=!!r.storageKey;
  return `<article class="p360-result p360-result-clickable" tabindex="0" role="button" data-p360-result="${esc(r.model)}|${esc(r.key)}">
    <div class="p360-model">${esc(r.model)}</div>
    <div class="min-w-0">
      <h4>${esc(recordLabel(r.item,r.key))}</h4>
      <p>${esc(r.item.category||'Engineering Record')} · ${esc(fileName)}${size}</p>
      ${r.subMatches.length?`<p class="p360-subparts">Linked part: ${r.subMatches.map(s=>esc(s.name)).join(', ')}</p>`:''}
      <div class="p360-tags">${(r.item.tags||[]).slice(0,5).map(t=>`<span>${esc(t)}</span>`).join('')}</div>
      <div class="p360-actions">
        <button type="button" class="p360-action p360-open" data-p360-open data-model="${esc(r.model)}" data-key="${esc(r.key)}"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open Record</button>
        ${hasFile?`<button type="button" class="p360-action p360-download" data-p360-download data-storage-key="${esc(r.storageKey)}" data-filename="${esc(fileName)}"><i class="fa-solid fa-download"></i> Download</button>`:''}
      </div>
    </div>
    <span class="p360-key">${esc(r.key)}</span>
  </article>`;
}
async function search(q,token){
  q=q.trim().toLowerCase();
  if(!q){res().innerHTML='<div class="p360-empty"><i class="fa-solid fa-magnifying-glass"></i><p>Search a parameter, specification, tag, document or record.</p></div>';return}
  const data=loadData(),rows=[],stored=await listFileMetadata(),byBase=new Map();
  if(token!==window.__p360SearchToken)return;
  for(const record of stored){const base=record.baseKey||String(record.key||'').split('::v::')[0];if(!base)continue;const list=byBase.get(base)||[];list.push(record);byBase.set(base,list)}
  for(const list of byBase.values())list.sort((a,b)=>String(a.updatedAt||'').localeCompare(String(b.updatedAt||'')));
  const resolveStored=(candidates)=>{for(const candidate of candidates){const versions=byBase.get(candidate)||[];if(versions.length)return versions[versions.length-1]}return null};
  for(const model of Object.keys(data||{})){
    const m=data[model];
    for(const [key,item] of Object.entries(m?.items||{})){
      const subs=Array.isArray(item?.subItems)?item.subItems:[];
      const hay=[model,m?.meta?.name,m?.meta?.ap,m?.meta?.modem,m?.meta?.status,m?.meta?.swVersion,key,item?.title,item?.category,item?.filename,item?.uploadedFilename,item?.note,...(item?.tags||[]),...subs.flatMap(s=>[s?.name,s?.filename,s?.uploadedFilename,s?.note])].join(' ').toLowerCase();
      if(!hay.includes(q))continue;
      const subMatches=subs.filter(s=>[s?.name,s?.filename,s?.uploadedFilename,s?.note].join(' ').toLowerCase().includes(q));
      const matchedSub=subMatches[0],candidates=storageKeysFor(model,key,matchedSub,matchedSub?subs.indexOf(matchedSub):0),storedRecord=resolveStored(candidates);
      const fileName=storedRecord?.filename||matchedSub?.uploadedFilename||item?.uploadedFilename||'No uploaded file';
      rows.push({model,key,item,subMatches,storageKey:storedRecord?.key||null,fileName,fileSize:storedRecord?.size||0});
    }
  }
  if(token!==window.__p360SearchToken)return;
  res().innerHTML=rows.length?rows.slice(0,100).map(resultMarkup).join(''):'<div class="p360-empty"><i class="fa-solid fa-circle-question"></i><p>No matching engineering record found in the local model repository.</p></div>';
}
export function initParameter360(){
  if(!isModuleEnabled('parameter360'))return;
  ['parameter360HeaderBtn','parameter360Btn'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>{modal().classList.remove('hidden');document.getElementById('parameter360Search')?.focus()}));
  document.getElementById('parameter360Search')?.addEventListener('input',e=>{const token=++window.__p360SearchToken;search(e.target.value,token).catch(err=>{console.error('Parameter 360 search failed',err);res().innerHTML='<div class="p360-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>Search could not access the local file repository.</p></div>'})});
  res()?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const result=e.target.closest('[data-p360-result]');if(result){e.preventDefault();const [model,key]=result.dataset.p360Result.split('|');navigateToRecord(model,key);}}});
  res()?.addEventListener('click',e=>{
    const open=e.target.closest('[data-p360-open]');
    if(open){navigateToRecord(open.dataset.model,open.dataset.key);return}
    const result=e.target.closest('[data-p360-result]');
    if(result){const [model,key]=result.dataset.p360Result.split('|');navigateToRecord(model,key);return}
    const dl=e.target.closest('[data-p360-download]');
    if(dl){downloadSearchFile(dl.dataset.storageKey,dl.dataset.filename);return}
  });
  modal()?.addEventListener('click',e=>{if(e.target.closest('[data-close-360]'))modal().classList.add('hidden')});
}
