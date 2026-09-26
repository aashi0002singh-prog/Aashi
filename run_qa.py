from playwright.sync_api import sync_playwright
from pathlib import Path
import json, time, os
html=Path('/mnt/data/v65_2_7/visual_harness.html').read_text()
out=Path('/mnt/data/v65_2_7_visual'); out.mkdir(exist_ok=True)
results=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1536,'height':900}, device_scale_factor=1)
    errors=[]
    page.on('console', lambda m: errors.append(f'console:{m.type}:{m.text}') if m.type=='error' else None)
    page.on('pageerror', lambda e: errors.append('pageerror:'+str(e)))
    page.set_content(html, wait_until='domcontentloaded', timeout=20000)
    page.wait_for_timeout(1800)
    # capture baseline and inspect
    def check(label):
        cards=page.locator('.record-card').count(); tabs=page.locator('.cat-btn').count()
        results.append({'label':label,'cards':cards,'tabs':tabs,'errors':len(errors)})
        assert cards>0, label
    print('errors',errors[:20]); print('cards',page.locator('.record-card').count(),'body',page.locator('body').inner_text()[:700]); check('baseline')
    page.screenshot(path=str(out/'01_ALL_RECORDS.png'), full_page=True)
    # 60 cycles: each cycle all categories + expand/collapse all-records first 3 cards + settings
    cats=page.locator('.cat-btn')
    cat_names=[]
    for i in range(cats.count()): cat_names.append(cats.nth(i).inner_text())
    for cycle in range(1,61):
        # All records
        page.locator('.cat-btn').nth(0).click(); page.wait_for_timeout(20)
        assert page.locator('.record-card').count()==19
        # expand/collapse every card once
        cards=page.locator('.record-card')
        n=cards.count()
        for i in range(n):
            cards.nth(i).click(); page.wait_for_timeout(5)
            assert cards.nth(i).get_attribute('aria-expanded')=='true'
            cards.nth(i).click(); page.wait_for_timeout(5)
            assert cards.nth(i).get_attribute('aria-expanded')=='false'
        # groups
        for gi in range(1,6):
            page.locator('.cat-btn').nth(gi).click(); page.wait_for_timeout(15)
            assert page.locator('.record-card').count() > 0
            # all group cards should be expanded by design
            assert page.locator('.record-card.is-expanded').count()==page.locator('.record-card').count()
        # settings open/close via likely settings button
        # locate button text/title containing settings
        btn=page.locator('button').filter(has_text='Settings')
        if btn.count():
            btn.first.click(); page.wait_for_timeout(10)
            if page.locator('#settingsModal').count(): assert not page.locator('#settingsModal').evaluate('(e)=>e.classList.contains("hidden")')
            close=page.locator('[data-close="settingsModal"]')
            if close.count(): close.first.click()
        if cycle in (1,30,60): results.append({'cycle':cycle,'cards':page.locator('.record-card').count(),'errors':len(errors)})
    # screenshots per category
    for gi,name in enumerate(cat_names):
        page.locator('.cat-btn').nth(gi).click(); page.wait_for_timeout(120)
        fname=f'{gi+1:02d}_{name.replace("/","_").replace(" ","_").replace("&","AND")}.png'
        page.screenshot(path=str(out/fname), full_page=True)
    # settings
    # inspect all buttons and ids for settings
    texts=page.locator('button').all_inner_texts()
    # common IDs
    candidates=['settingsBtn','portalSettingsBtn','settingsHeaderBtn']
    clicked=False
    for c in candidates:
        loc=page.locator('#'+c)
        if loc.count(): loc.first.click(); clicked=True; break
    if not clicked:
        for i,t in enumerate(texts):
            if 'setting' in t.lower():
                page.locator('button').nth(i).click(); clicked=True; break
    page.wait_for_timeout(100)
    page.screenshot(path=str(out/'07_SETTINGS.png'), full_page=True)
    # expanded example
    page.locator('.cat-btn').nth(0).click(); page.wait_for_timeout(100)
    page.locator('.record-card').first.click(); page.wait_for_timeout(100)
    page.screenshot(path=str(out/'08_ALL_RECORDS_EXPANDED.png'), full_page=True)
    # computed geometry assertions for all compact cards
    page.locator('.cat-btn').nth(0).click(); page.wait_for_timeout(100)
    geoms=page.locator('.record-card:not(.is-expanded)').evaluate_all("els=>els.map(e=>{const t=e.querySelector('.record-title-only'),i=e.querySelector('.record-icon'),s=e.querySelector('.record-status'); const r=e.getBoundingClientRect(),tr=t?.getBoundingClientRect(),ir=i?.getBoundingClientRect(); return {h:r.height,w:r.width,titleH:tr?.height,titleW:tr?.width,iconX:ir?.x,titleX:tr?.x,statusX:s?.getBoundingClientRect().x};})")
    heights=[round(x['h'],1) for x in geoms]
    results.append({'compact_heights_unique':sorted(set(heights)),'min_title_width':min(x['titleW'] for x in geoms),'max_title_width':max(x['titleW'] for x in geoms),'errors_total':len(errors)})
    browser.close()
Path('/mnt/data/v65_2_7_visual/QA_RESULTS.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results[-3:],indent=2))
print('errors',errors[:20])
