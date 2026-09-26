from playwright.sync_api import sync_playwright
from pathlib import Path
import json
html=Path('/mnt/data/v65_2_7/visual_static.html').read_text(); out=Path('/mnt/data/v65_2_7_visual'); out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page(viewport={'width':1536,'height':900},device_scale_factor=1)
 errors=[]; p.on('pageerror',lambda e:errors.append(str(e))); p.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 p.set_content(html,wait_until='domcontentloaded',timeout=20000); p.wait_for_timeout(100)
 cats=[('all','01_ALL_RECORDS.png'),('Schematics','02_SCHEMATICS.png'),('RF & Wireless','03_RF_ANTENNA.png'),('Process & Tech','04_PROCESS_OPST.png'),('Defect summary & SW process','05_DEFECTS_SW.png'),('Specification','06_SPECIFICATION.png')]
 for label,f in cats:
  p.locator(f'.cat-btn[data-cat="{label}"]').click(); p.wait_for_timeout(30); p.screenshot(path=str(out/f),full_page=True)
 for mid,f in [('settingsModal','07_SETTINGS.png'),('parameter360Modal','08_PARAMETER_360.png'),('fileCenterModal','09_FILE_COMMAND_CENTER.png'),('modelComparisonModal','10_MODEL_COMPARISON.png'),('labKnowledgeModal','11_LAB_TESTING.png')]:
  p.locator('#'+mid).evaluate("e=>e.classList.remove('hidden')"); p.screenshot(path=str(out/f),full_page=True); p.locator('#'+mid).evaluate("e=>e.classList.add('hidden')")
 p.locator('.cat-btn[data-cat="all"]').click(); p.wait_for_timeout(30); p.locator('#cardsGrid .record-card').first.click(); p.screenshot(path=str(out/'12_ALL_RECORDS_EXPANDED.png'),full_page=True)
 # geometry
 p.locator('.cat-btn[data-cat="all"]').click(); cards=p.locator('#cardsGrid .record-card'); n=cards.count(); ge=[cards.nth(i).bounding_box() for i in range(n)]
 # fast 60-cycle interaction loop inside browser
 res=p.evaluate("""()=>{let ok=0; const tabs=[...document.querySelectorAll('.cat-btn')]; for(let c=0;c<60;c++){for(const t of tabs)t.click();tabs[0].click();const card=document.querySelector('#cardsGrid .record-card');card.click();if(card.getAttribute('aria-expanded')!=='true')return {ok,fail:'expand'};card.click();if(card.getAttribute('aria-expanded')!=='false')return {ok,fail:'collapse'};ok++;}return {ok,fail:null};}""")
 heights=sorted(set(round(x['height'],1) for x in ge)); titlews=[]
 for i in range(n): titlews.append(cards.nth(i).locator('.record-title-only').bounding_box()['width'])
 print(json.dumps({'cards':n,'heights':heights,'title_width_min':round(min(titlews),1),'title_width_max':round(max(titlews),1),'cycles':res,'errors':errors},indent=2))
 (out/'VISUAL_QA_RESULTS.json').write_text(json.dumps({'cards':n,'heights':heights,'title_width_min':min(titlews),'title_width_max':max(titlews),'cycles':res,'errors':errors},indent=2))
 b.close()
