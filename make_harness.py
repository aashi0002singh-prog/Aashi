from pathlib import Path
import re
root=Path('/mnt/data/v65_2_8')
idx=(root/'index.html').read_text()
head=idx.split('<body',1)[0]
body=re.split(r'<body[^>]*>',idx,maxsplit=1,flags=re.I)[1].rsplit('</body>',1)[0]
body=re.sub(r'<script[^>]*>.*?</script>','',body,flags=re.S|re.I)
head=re.sub(r'<link[^>]*>','',head,flags=re.I)
head=re.sub(r'<script[^>]*src=[^>]*>\s*</script>|<script[^>]*src=[^>]*/>|<script[^>]*src=[^>]*></script>','',head,flags=re.I)
css='\n'.join((root/'css'/f).read_text() for f in ['dashboard.css','lab-knowledge.css','modular-features.css','model-comparison.css'])
utility='''<style>.flex{display:flex}.grid{display:grid}.hidden{display:none!important}.block{display:block}.items-center{align-items:center}.justify-between{justify-content:space-between}.gap-1{gap:.25rem}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.mt-1{margin-top:.25rem}.mt-3{margin-top:.75rem}.font-bold{font-weight:700}.text-xs{font-size:.75rem}.w-full{width:100%}.flex-wrap{flex-wrap:wrap}.min-w-0{min-width:0}.text-center{text-align:center}.sticky{position:sticky}.top-0{top:0}.z-40{z-index:40}.min-h-screen{min-height:100vh}.bg-slate-100{background:#f1f5f9}.text-slate-800{color:#1e293b}.antialiased{-webkit-font-smoothing:antialiased}</style>'''
fa='''<style>.fa-solid,.fa-regular,.fa-brands{font-family:inherit;font-style:normal}.fa-solid:before,.fa-regular:before,.fa-brands:before{content:""}.record-icon i,.section-icon i,.modal-icon i,.header-module-btn i,.sidebar-module-btn i,.tool-btn i,.btn i,.favorite-btn i,.expand-cue i{display:block;width:10px;height:10px;border:1px solid currentColor;border-radius:2px;opacity:.85}</style>'''
# Core globals
core_files=['data/models.js','js/database.js','js/ui.js','js/modules/module-manager.js','js/app.js','js/file-command-center.js']
# Feature modules isolated to prevent top-level const/function collisions in classic script execution.
feature_files=['js/modules/lab-knowledge/data.js','js/modules/lab-knowledge/module.js','js/modules/parameter-360/module.js','js/model-comparison/comparison.js']

def clean(s):
 s=re.sub(r'^import[^;]+;\s*','',s,flags=re.M)
 s=re.sub(r'^export\s+(?=(const|let|var|function|async function|class))','',s,flags=re.M)
 s=s.replace('await import("./database.js")','Promise.resolve({saveVersionForSlot})')
 return s
bundle=[]
for f in core_files:
 s=clean((root/f).read_text())
 if f=='js/app.js': s=re.sub(r'^const MAX_FILE_SIZE=.*?;\s*$', '', s, flags=re.M)
 bundle.append(f'// ---- {f} ----\n{s}')
 if f=='js/database.js': bundle.append('''\n// Visual harness persistence stubs: keep UI deterministic without browser storage.\nwindow.listDocumentsByContext=async()=>({slot:null,versions:[]});\nwindow.getFileVersion=async()=>null;\nwindow.migrateLegacyFilesToVersions=async()=>{};\nwindow.deleteAllFiles=async()=>{};\nwindow.deleteAuditLogs=async()=>{};\nwindow.addAudit=async()=>{};\nwindow.registerModel=async x=>x;\nwindow.registerRecord=async x=>x;\nwindow.registerSlot=async x=>x;\nwindow.renameModelCode=async()=>{};\nwindow.createFullBackup=async()=>new Blob(['{}'],{type:'application/json'});\nwindow.restoreFullBackup=async()=>{};\nwindow.getRepositoryDocuments=async()=>[];\nwindow.getAuditLogs=async()=>[];\nwindow.saveVersionForSlot=async()=>({});\n''')
# data for feature modules needs to be global before the IIFEs
bundle.append(f'// ---- feature data ----\n{clean((root/feature_files[0]).read_text())}')
for f in feature_files[1:]:
 s=clean((root/f).read_text())
 if f=='js/model-comparison/comparison.js': s=s.replace('new URL("./comparison-worker.js",import.meta.url)','"about:blank"')
 bundle.append(f'// ---- {f} (isolated) ----\n(function(){{\n{s}\nif(typeof initLabKnowledge!=="undefined") window.initLabKnowledge=initLabKnowledge;\nif(typeof initParameter360!=="undefined") window.initParameter360=initParameter360;\n}})();')
# After app and feature scripts initialize, wire module buttons and module visibility.
bootstrap='''\n(function(){\n try{ if(window.applyModuleVisibility) window.applyModuleVisibility(); }catch(e){}\n try{ if(window.initLabKnowledge) window.initLabKnowledge(); }catch(e){}\n try{ if(window.initParameter360) window.initParameter360(); }catch(e){}\n document.getElementById('modelDocumentBtn')?.addEventListener('click',()=>document.getElementById('fileSummaryTitle')?.scrollIntoView({behavior:'smooth',block:'start'}));\n document.getElementById('modelComparisonBtnTop')?.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('portal-open-excel-comparison')));\n})();\n'''
# Add style overrides already in dashboard.css and script bundle.
out=f'''<!doctype html><html><head>{head}<style>{css}</style>{utility}{fa}</head><body>{body}<script>{'\n'.join(bundle)}{bootstrap}</script></body></html>'''
(root/'visual_harness.html').write_text(out)
print(root/'visual_harness.html', len(out))
