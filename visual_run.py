from playwright.sync_api import sync_playwright
from pathlib import Path
import json
html=Path('/mnt/data/v65_2_8/visual_static.html').read_text(); out=Path('/mnt/data/v65_2_8_visual'); out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page(viewport={'width':1536,'height':900},device_scale_factor=1)
 errs=[]; p.on('pageerror',lambda e:errs.append(str(e))); p.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
 p.set_content(html,wait_until='domcontentloaded',timeout=20000); p.wait_for_timeout(300)
 # all records
 p.screenshot(path=str(out/'01_ALL_RECORDS.png'),full_page=True)
 cats=[('Schematics','02_SCHEMATICS.png'),('RF & Wireless','03_RF_ANTENNA.png'),('Process & Tech','04_PROCESS_OPST.png'),('Defect summary & SW process','05_DEFECTS_SW.png'),('Specification','06_SPECIFICATION.png')]
 for label,f in cats:
  p.locator(f'.cat-btn[data-cat="{label}"]').click(); p.wait_for_timeout(50); p.screenshot(path=str(out/f),full_page=True)
 # settings modal manually open
 p.locator('#settingsModal').evaluate("e=>e.classList.remove('hidden')")
 p.screenshot(path=str(out/'07_SETTINGS.png'),full_page=True)
 p.locator('#settingsModal').evaluate("e=>e.classList.add('hidden')")
 # parameter 360
 p.locator('#parameter360Modal').evaluate("e=>e.classList.remove('hidden')")
 p.screenshot(path=str(out/'08_PARAMETER_360.png'),full_page=True)
 p.locator('#parameter360Modal').evaluate("e=>e.classList.add('hidden')")
 # file center
 p.locator('#fileCenterModal').evaluate("e=>e.classList.remove('hidden')")
 p.screenshot(path=str(out/'09_FILE_COMMAND_CENTER.png'),full_page=True)
 p.locator('#fileCenterModal').evaluate("e=>e.classList.add('hidden')")
 # comparison
 p.locator('#modelComparisonModal').evaluate("e=>e.classList.remove('hidden')")
 p.screenshot(path=str(out/'10_MODEL_COMPARISON.png'),full_page=True)
 p.locator('#modelComparisonModal').evaluate("e=>e.classList.add('hidden')")
 # lab
 p.locator('#labKnowledgeModal').evaluate("e=>e.classList.remove('hidden')")
 p.screenshot(path=str(out/'11_LAB_TESTING.png'),full_page=True)
 # all expanded sample
 p.locator('.cat-btn[data-cat="all"]').click(); p.wait_for_timeout(50)
 p.locator('#cardsGrid .record-card').first.click(); p.wait_for_timeout(50)
 p.screenshot(path=str(out/'12_ALL_RECORDS_EXPANDED.png'),full_page=True)
 # geometry and expansion checks
 p.locator('.cat-btn[data-cat="all"]').click(); p.wait_for_timeout(50)
 cards=p.locator('#cardsGrid .record-card'); n=cards.count(); ge=[]
 for i in range(n):
  r=cards.nth(i); box=r.bounding_box(); tb=r.locator('.record-title-only').bounding_box(); sb=r.locator('.record-status').bounding_box(); ge.append((box,tb,sb))
 # 60 visual cycles across all categories and expansion toggle first card
 for cyc in range(60):
  for label,_ in [('all',''),*[(x[0],'') for x in cats]]:
   p.locator(f'.cat-btn[data-cat="{label}"]').click(); p.wait_for_timeout(1)
  p.locator('.cat-btn[data-cat="all"]').click(); p.wait_for_timeout(1)
  c=p.locator('#cardsGrid .record-card').first; c.click(); p.wait_for_timeout(1); assert c.get_attribute('aria-expanded')=='true'; c.click(); assert c.get_attribute('aria-expanded')=='false'
 heights=sorted(set(round(g[0]['height'],1) for g in ge))
 print(json.dumps({'cards':n,'unique_compact_heights':heights,'min_title_width':round(min(g[1]['width'] for g in ge),1),'max_title_width':round(max(g[1]['width'] for g in ge),1),'errors':errs},indent=2))
 b.close()
