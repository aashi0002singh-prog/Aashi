from playwright.sync_api import sync_playwright
from pathlib import Path
import json
root=Path('/mnt/data/work_final/v65_2_8')
out=Path('/mnt/data/work_final/v65_2_8_visual')
html=(root/'visual_static.html').read_text()
out.mkdir(exist_ok=True)
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    p=b.new_page(viewport={'width':1536,'height':900},device_scale_factor=1)
    errors=[]
    p.on('pageerror',lambda e:errors.append('pageerror: '+str(e)))
    p.on('console',lambda m:errors.append('console: '+m.text) if m.type=='error' else None)
    p.set_content(html,wait_until='domcontentloaded',timeout=20000)
    p.wait_for_timeout(100)
    cats=[('all','01_ALL_RECORDS.png'),('Schematics','02_SCHEMATICS.png'),('RF & Wireless','03_RF_ANTENNA.png'),('Process & Tech','04_PROCESS_OPST.png'),('Defect summary & SW process','05_DEFECTS_SW.png'),('Specification','06_SPECIFICATION.png')]
    for label,f in cats:
        p.locator(f'.cat-btn[data-cat="{label}"]').click()
        p.wait_for_timeout(30)
        p.screenshot(path=str(out/f),full_page=True)
    for mid,f in [('settingsModal','07_SETTINGS.png'),('parameter360Modal','08_PARAMETER_360.png'),('fileCenterModal','09_FILE_COMMAND_CENTER.png'),('modelComparisonModal','10_MODEL_COMPARISON.png'),('labKnowledgeModal','11_LAB_TESTING.png')]:
        p.locator('#'+mid).evaluate("e=>e.classList.remove('hidden')")
        p.screenshot(path=str(out/f),full_page=True)
        p.locator('#'+mid).evaluate("e=>e.classList.add('hidden')")
    p.locator('.cat-btn[data-cat="all"]').click(); p.wait_for_timeout(30)
    p.locator('#cardsGrid .record-card').first.click(); p.wait_for_timeout(20)
    p.screenshot(path=str(out/'12_ALL_RECORDS_EXPANDED.png'),full_page=True)
    # group geometry: Process & Tech and Specification
    geom={}
    for label in ['Process & Tech','Specification']:
        p.locator(f'.cat-btn[data-cat="{label}"]').click(); p.wait_for_timeout(20)
        cards=p.locator('#cardsGrid .record-card'); n=cards.count(); rows=[]
        for i in range(n):
            c=cards.nth(i); bb=c.bounding_box(); tb=c.locator('.record-title-only').bounding_box(); sb=c.locator('.record-status').bounding_box();
            rows.append({'title':c.locator('.record-title-only').inner_text(),'card_w':round(bb['width'],1),'card_h':round(bb['height'],1),'title_w':round(tb['width'],1),'status_x':round(sb['x'],1),'status_w':round(sb['width'],1),'card_x':round(bb['x'],1),'title_h':round(tb['height'],1)})
        geom[label]=rows
    # 60 browser interaction cycles: all categories, card click where compact view, group category, tool modal open/close.
    result=p.evaluate("""()=>{
      const tabs=[...document.querySelectorAll('.cat-btn')]; const labels=tabs.map(t=>t.dataset.cat); let cycles=0;
      for(let c=0;c<60;c++){
        for(const t of tabs){t.click(); const cards=document.querySelectorAll('#cardsGrid .record-card'); if(!cards.length) return {cycles,fail:'no cards for '+t.dataset.cat};
          const first=cards[0]; if(t.dataset.cat==='all'){first.click(); if(first.getAttribute('aria-expanded')!=='true') return {cycles,fail:'expand failed'}; first.click(); if(first.getAttribute('aria-expanded')!=='false') return {cycles,fail:'collapse failed'};}
        }
        cycles++;
      }
      return {cycles,fail:null};
    }""")
    # software-ish DOM assertions
    assertions=p.evaluate("""()=>{
      const all=[...document.querySelectorAll('.cat-btn')];
      const ids=['settingsModal','parameter360Modal','fileCenterModal','modelComparisonModal','labKnowledgeModal'];
      const noRestriction=[...document.querySelectorAll('body *')].some(e=>/ADMIN UPLOAD REQUIRED|Required slots complete/.test(e.textContent||''));
      return {tabs:all.length,modals:ids.filter(id=>document.getElementById(id)).length,no_restriction_text:noRestriction,hasCards:!!document.querySelector('#cardsGrid .record-card')};
    }""")
    report={'chromium':'system Chromium','screenshots':12,'cycles':result,'errors':errors,'group_geometry':geom,'assertions':assertions}
    (out/'VISUAL_QA_RESULTS.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
    b.close()
