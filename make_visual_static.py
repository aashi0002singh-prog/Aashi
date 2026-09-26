from pathlib import Path
import json,re,html
root=Path('/mnt/data/v65_2_8'); out=Path('/mnt/data/v65_2_8_visual'); out.mkdir(exist_ok=True)
idx=(root/'index.html').read_text(); head=idx.split('<body',1)[0]; body=re.split(r'<body[^>]*>',idx,maxsplit=1,flags=re.I)[1].rsplit('</body>',1)[0]
body=re.sub(r'<script[^>]*>.*?</script>','',body,flags=re.S|re.I)
head=re.sub(r'<link[^>]*>','',head,flags=re.I); head=re.sub(r'<script[^>]*src=[^>]*>.*?</script>','',head,flags=re.S|re.I)
css='\n'.join((root/'css'/f).read_text() for f in ['dashboard.css','lab-knowledge.css','modular-features.css','model-comparison.css'])
utility='''<style>.flex{display:flex}.grid{display:grid}.hidden{display:none!important}.block{display:block}.items-center{align-items:center}.justify-between{justify-content:space-between}.gap-1{gap:.25rem}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.mt-1{margin-top:.25rem}.mt-3{margin-top:.75rem}.font-bold{font-weight:700}.text-xs{font-size:.75rem}.w-full{width:100%}.flex-wrap{flex-wrap:wrap}.min-w-0{min-width:0}.text-center{text-align:center}.sticky{position:sticky}.top-0{top:0}.z-40{z-index:40}.min-h-screen{min-height:100vh}.bg-slate-100{background:#f1f5f9}.text-slate-800{color:#1e293b}.antialiased{-webkit-font-smoothing:antialiased}.fa-solid,.fa-regular{font-family:inherit}.fa-solid:before,.fa-regular:before{content:""}</style>'''
data=json.load(open(root/'models.json')); items=data['items']; colors=data['colors']
catmap={'Schematics':'Schematics','RF & Wireless':'RF & Wireless','Process & Tech':'Process & Tech','Defect summary & SW process':'Defect summary & SW process','Specification':'Specification'}
def card(k,expanded=False):
 i=items[k]; c=colors[i['category']]
 status='<span class="record-status all-missing"><span class="status-dot missing"></span><span>NO DOCUMENT</span></span>'
 head=f'''<article class="record-card {"is-expanded is-group-view" if expanded else ""}" style="--record-accent:{c}" data-record="{k}" tabindex="0" aria-expanded="{str(expanded).lower()}"><div class="record-stripe" style="background:{c}"></div><div class="record-collapsed-face"><div class="record-icon" style="background:{c}"><i></i></div><div class="record-title-only">{html.escape(i["title"])}</div>{status}<button class="favorite-btn"><i></i></button><span class="expand-cue"><i>⌄</i></span></div>'''
 if not expanded: return head+'</article>'
 slots=[]
 names=i.get('subItems') or i.get('mergedSources') or [{'name':i['title'],'filename':i.get('filename','')}]
 for idx,s in enumerate(names):
  nm=s.get('name',f'Document {idx+1}'); fn=s.get('filename','') or 'Engineering document'
  slots.append(f'''<div class="expanded-file-row is-missing"><div class="expanded-file-main"><div class="expanded-file-title"><i></i><span>{html.escape(nm)}</span><span class="expanded-status missing">MISSING</span></div><div class="expanded-file-meta"><span>{html.escape(fn)}</span><span>0 B</span></div><div class="slot-missing-note">No document uploaded yet.</div></div></div>''')
 detail=f'''<div class="record-expanded-panel"><div class="expanded-summary"><span>0 uploaded versions • unlimited history</span><span>Document details</span></div><div class="inline-preview"><div class="inline-preview-empty">Select Preview on a document below to load the binary without preloading large engineering files.</div></div><div class="expanded-file-list">{"".join(slots)}</div><div class="expanded-footer"><button class="text-action">Copy details</button><button class="text-action">Copy link</button><button class="text-action">Open details</button></div></div></article>'''
 return head+detail
# create body with all cards injected
script='''<script>\nconst catDefs=[['all','All'],['Schematics','Schematics'],['RF & Wireless','RF & Antenna'],['Process & Tech','Process & OPST'],['Defect summary & SW process','Defects & SW'],['Specification','Specification']]; document.getElementById('categoryTabs').innerHTML=catDefs.map(x=>`<button class="cat-btn" data-cat="${x[0]}">${x[1]}<b class="cat-count"></b></button>`).join('');\nconst cats=[...document.querySelectorAll('.cat-btn')];\nfunction render(mode){document.body.dataset.recordView=mode==='all'?'all':'group'; const grid=document.getElementById('cardsGrid'); const all=[...document.querySelectorAll('#allTemplate .record-card')]; grid.innerHTML=''; const src=mode==='all'?all:all.filter(c=>c.dataset.cat===mode); src.forEach(c=>grid.appendChild(c.cloneNode(true))); if(mode!=='all') grid.querySelectorAll('.record-card').forEach(c=>{c.classList.add('is-expanded','is-group-view');c.setAttribute('aria-expanded','true');}); document.getElementById('recordCount').textContent=mode==='all'?`${all.length} of ${all.length} records • Compact view`:`${src.length} records • Full detail view`; }\ncats.forEach((b,i)=>b.addEventListener('click',()=>render(b.dataset.cat==='all'?'all':b.dataset.cat)));\ndocument.addEventListener('click',e=>{const c=e.target.closest('#cardsGrid .record-card'); if(c && !e.target.closest('button')){const ex=c.classList.toggle('is-expanded');c.setAttribute('aria-expanded',String(ex)); if(ex){const t=document.getElementById('allTemplate').querySelector(`[data-record="${c.dataset.record}"]`); if(t?.querySelector('.record-expanded-panel') && !c.querySelector('.record-expanded-panel')) c.insertAdjacentHTML('beforeend',t.querySelector('.record-expanded-panel').outerHTML);}}}); render('all');\n</script>'''
# template includes all categories and group-expanded variants hidden offscreen
all_cards=[]
for k in data['order']:
 c=items[k]['category']; all_cards.append(card(k,False).replace('record-card ','record-card ').replace(f'data-record="{k}"',f'data-record="{k}" data-cat="{c}"',1))
template='<div id="allTemplate" style="display:none">'+''.join(all_cards)+'</div>'
# add group details template to allTemplate by making expanded clone if needed
expanded_template='<div id="expandedTemplates" style="display:none">'+''.join(card(k,True).replace('data-record="'+k+'"','data-record="'+k+'" data-cat="'+items[k]['category']+'"',1) for k in data['order'])+'</div>'
# fix render group source to use expanded template instead of compact clone
script=script.replace("const all=[...document.querySelectorAll('#allTemplate .record-card')];", "const all=[...document.querySelectorAll('#allTemplate .record-card')]; const expanded=[...document.querySelectorAll('#expandedTemplates .record-card')];")
script=script.replace("const src=mode==='all'?all:all.filter(c=>c.dataset.cat===mode);", "const src=mode==='all'?all:expanded.filter(c=>c.dataset.cat===mode);")
script=script.replace("if(mode!=='all') grid.querySelectorAll('.record-card').forEach(c=>{c.classList.add('is-expanded','is-group-view');c.setAttribute('aria-expanded','true');});", "if(mode!=='all') grid.querySelectorAll('.record-card').forEach(c=>{c.classList.add('is-expanded','is-group-view');c.setAttribute('aria-expanded','true');});")
# custom top card status positioning works from CSS
html=f'''<!doctype html><html><head>{head}<style>{css}</style>{utility}</head><body>{body}{template}{expanded_template}{script}</body></html>'''
(root/'visual_static.html').write_text(html)
print('wrote',len(html))
