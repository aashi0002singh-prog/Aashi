import {isModuleEnabled} from '../module-manager.js';
import {MODEL_ORDER,createDefaultData} from '../../../data/models.js';
import {getFile} from '../../database.js';
import {downloadBlob,escapeHtml,formatBytes,toast} from '../../ui.js';

const esc=escapeHtml;
const modal=()=>document.getElementById('parameter360Modal');
const res=()=>document.getElementById('parameter360Results');
const STORAGE_KEY='MOBILE_RND_DB_DATA_V10';

function loadData(){
  try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');return raw&&Object.keys(raw).length?raw:createDefaultData()}
  catch{return createDefaultData()}
}
function subpartId(sub,index){return String(sub?.id||sub?.name||`part-${index+1}`).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||`part-${index+1}`}
function storageKeysFor(model,key,sub,index){
  if(key==='M'){const id=subpartId(sub,index);return [`${model}_O_${id}`,`${model}_M`,`${model}_P`,`${model}_I`]}
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
function search(q){
  q=q.trim().toLowerCase();
  if(!q){res().innerHTML='<div class="p360-empty"><i class="fa-solid fa-magnifying-glass"></i><p>Search a parameter, specification, tag, document or record.</p></div>';return}
  const data=loadData(),rows=[];
  Object.keys(data||{}).forEach(model=>{
    const m=data[model];
    Object.entries(m?.items||{}).forEach(([key,item])=>{
      const subs=Array.isArray(item?.subItems)?item.subItems:[];
      const hay=[model,m?.meta?.name,m?.meta?.ap,m?.meta?.modem,m?.meta?.status,m?.meta?.swVersion,key,item?.title,item?.category,item?.filename,item?.uploadedFilename,...(item?.tags||[]),...subs.flatMap(s=>[s?.name,s?.filename,s?.uploadedFilename])].join(' ').toLowerCase();
      if(!hay.includes(q))return;
      const subMatches=subs.filter(s=>[s?.name,s?.filename,s?.uploadedFilename].join(' ').toLowerCase().includes(q));
      const matchedSub=subMatches[0];
      const storageCandidates=storageKeysFor(model,key,matchedSub,matchedSub?subs.indexOf(matchedSub):0);
      const fileName=matchedSub?.uploadedFilename||matchedSub?.filename||item?.uploadedFilename||item?.filename||'';
      const storageKey=fileName?storageCandidates.join('||'):null;
      rows.push({model,key,item,subMatches,storageKey:fileName?storageKey:null,fileName});
    });
  });
  res().innerHTML=rows.length?rows.slice(0,100).map(resultMarkup).join(''):'<div class="p360-empty"><i class="fa-solid fa-circle-question"></i><p>No matching engineering record found in the local model repository.</p></div>';
}

export function initParameter360(){
  if(!isModuleEnabled('parameter360'))return;
  ['parameter360HeaderBtn','parameter360Btn'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>{modal().classList.remove('hidden');document.getElementById('parameter360Search')?.focus()}));
  document.getElementById('parameter360Search')?.addEventListener('input',e=>search(e.target.value));
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
