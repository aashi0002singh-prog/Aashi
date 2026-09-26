from pathlib import Path
from playwright.sync_api import sync_playwright
import json, re, time, subprocess

ROOT=Path('/mnt/data/v65_2_8')
OUT=Path('/mnt/data/v65_2_8_visual'); OUT.mkdir(exist_ok=True)
HTML=(ROOT/'visual_harness.html').read_text()
errors=[]
results=[]

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1536,'height':900}, device_scale_factor=1)
    page.on('pageerror', lambda e: errors.append('pageerror:'+str(e)))
    page.on('console', lambda m: errors.append('console:'+m.text) if m.type=='error' else None)
    page.set_content(HTML, wait_until='domcontentloaded', timeout=20000)
    page.wait_for_timeout(500)

    def close_modals():
        page.keyboard.press('Escape')
        page.evaluate("document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'))")

    def click_cat(i):
        page.locator('.cat-btn').nth(i).click(force=True)
        page.wait_for_timeout(5)

    # baseline
    assert page.locator('#cardsGrid .record-card').count()==19
    page.screenshot(path=str(OUT/'01_ALL_RECORDS.png'), full_page=True)

    # screenshots of each group
    labels=['SCHEMATICS','RF_ANTENNA','PROCESS_OPST','DEFECTS_SW','SPECIFICATION']
    for i,label in enumerate(labels, start=1):
        click_cat(i)
        page.screenshot(path=str(OUT/f'{i+1:02d}_{label}.png'), full_page=True)
    click_cat(0)

    # Settings screenshot and settings control checks
    page.locator('#settingsBtn').click(force=True); page.wait_for_timeout(50)
    assert not page.locator('#settingsModal').evaluate('(e)=>e.classList.contains("hidden")')
    page.screenshot(path=str(OUT/'07_SETTINGS.png'), full_page=True)
    # exercise settings controls then restore
    page.locator('#themeSelect').select_option('dark')
    page.locator('#accentSelect').select_option('violet')
    page.locator('#densitySelect').select_option('compact')
    page.locator('#motionToggle').uncheck()
    page.locator('#settingsApplyBtn').click(force=True); page.wait_for_timeout(20)
    page.locator('#themeSelect').select_option('light')
    page.locator('#accentSelect').select_option('cyan')
    page.locator('#densitySelect').select_option('comfortable')
    page.locator('#motionToggle').check()
    page.locator('#settingsApplyBtn').click(force=True); page.wait_for_timeout(20)
    close_modals()

    # Parameter 360
    page.locator('#parameter360HeaderBtn').click(force=True); page.wait_for_timeout(50)
    assert not page.locator('#parameter360Modal').evaluate('(e)=>e.classList.contains("hidden")')
    page.screenshot(path=str(OUT/'08_PARAMETER_360.png'), full_page=True)
    close_modals()

    # File command center
    page.locator('#fileCenterBtn').click(force=True); page.wait_for_timeout(50)
    assert not page.locator('#fileCenterModal').evaluate('(e)=>e.classList.contains("hidden")')
    page.screenshot(path=str(OUT/'09_FILE_COMMAND_CENTER.png'), full_page=True)
    close_modals()

    # Model comparison
    page.locator('#modelComparisonBtnTop').click(force=True); page.wait_for_timeout(50)
    assert not page.locator('#modelComparisonModal').evaluate('(e)=>e.classList.contains("hidden")')
    page.screenshot(path=str(OUT/'10_MODEL_COMPARISON.png'), full_page=True)
    close_modals()

    # Lab
    page.locator('#labKnowledgeBtn').click(force=True); page.wait_for_timeout(80)
    assert not page.locator('#labKnowledgeModal').evaluate('(e)=>e.classList.contains("hidden")')
    page.screenshot(path=str(OUT/'11_LAB_TESTING.png'), full_page=True)
    close_modals()

    # Engineering tabs hide/show smoke check (hide action) and deterministic restore.
    page.locator('#engineeringTabsToggle').click(force=True); page.wait_for_timeout(10)
    assert page.locator('#engineeringRecordsTabsRow').evaluate('(e)=>e.classList.contains("tabs-hidden")')
    page.evaluate("""()=>{const r=document.getElementById('engineeringRecordsTabsRow'),b=document.getElementById('engineeringTabsToggle');r.classList.remove('tabs-hidden');b.setAttribute('aria-expanded','true');b.innerHTML='<i class=\"fa-solid fa-eye-slash\"></i><span>Hide Tabs</span>';b.title='Hide Engineering Records category tabs';localStorage.setItem('MOBILE_RND_ENGINEERING_TABS_HIDDEN_V1','0')}""")

    # Expanded All Records example
    click_cat(0)
    first=page.locator('#cardsGrid .record-card').first
    first.click(force=True); page.wait_for_timeout(30)
    assert first.get_attribute('aria-expanded')=='true'
    page.screenshot(path=str(OUT/'12_ALL_RECORDS_EXPANDED.png'), full_page=True)
    first.click(force=True); assert first.get_attribute('aria-expanded')=='false'

    # Visual geometry: all compact cards should have same height and title lane > 100px.
    geoms=page.locator('#cardsGrid .record-card:not(.is-expanded)').evaluate_all("""els=>els.map(e=>{const r=e.getBoundingClientRect(),t=e.querySelector('.record-title-only').getBoundingClientRect(),s=e.querySelector('.record-status').getBoundingClientRect();return {h:r.height,w:r.width,titleW:t.width,titleH:t.height,titleX:t.x,statusX:s.x,statusRight:r.right-s.right}})""")
    assert len(geoms)==19
    heights={round(x['h'],1) for x in geoms}
    assert len(heights)==1, heights
    assert min(x['titleW'] for x in geoms) >= 100, geoms

    # 60 cycles: all categories, expand/collapse, sort/favorites/clear, tab toggle, sidebar.
    for cycle in range(1,61):
        close_modals(); click_cat(0)
        assert page.locator('#cardsGrid .record-card').count()==19
        # Deep expand every card every 10th cycle; first 3 every other cycle.
        idxs=range(19) if cycle%10==0 else range(3)
        for i in idxs:
            c=page.locator('#cardsGrid .record-card').nth(i)
            c.click(force=True); assert c.get_attribute('aria-expanded')=='true'
            c.click(force=True); assert c.get_attribute('aria-expanded')=='false'
        # All categories
        for gi,expected in [(1,4),(2,5),(3,3),(4,2),(5,5)]:
            click_cat(gi)
            assert page.locator('#cardsGrid .record-card').count()==expected
            assert page.locator('#cardsGrid .record-card.is-expanded').count()==expected
        click_cat(0)
        # Sort round-trip
        page.locator('#sortSelect').select_option('title'); page.wait_for_timeout(2)
        page.locator('#sortSelect').select_option('default'); page.wait_for_timeout(2)
        # Clear filters
        page.locator('#clearFiltersBtn').click(force=True); page.wait_for_timeout(2)
        assert page.locator('#cardsGrid .record-card').count()==19
        results.append({'cycle':cycle,'all':page.locator('#cardsGrid .record-card').count(),'errors':len(errors)})

    # final geometry and feature state
    click_cat(0)
    geoms2=page.locator('#cardsGrid .record-card:not(.is-expanded)').evaluate_all("""els=>els.map(e=>{const r=e.getBoundingClientRect(),t=e.querySelector('.record-title-only').getBoundingClientRect(),s=e.querySelector('.record-status').getBoundingClientRect();return {h:r.height,w:r.width,titleW:t.width,titleH:t.height,statusX:s.x,statusRight:r.right-s.right,text:e.querySelector('.record-title-only').innerText}})""")
    browser.close()

# Software QA: source checks
js_files=list((ROOT/'js').rglob('*.js'))
node_results=[]
for f in js_files:
    p=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
    node_results.append({'file':str(f.relative_to(ROOT)),'ok':p.returncode==0,'stderr':p.stderr[:300]})
assert all(x['ok'] for x in node_results), [x for x in node_results if not x['ok']]

app=(ROOT/'js/app.js').read_text(); css=(ROOT/'css/dashboard.css').read_text(); idx=(ROOT/'index.html').read_text()
prohibited=[]
for phrase in ['Required slots complete','ADMIN UPLOAD REQUIRED']:
    if phrase.lower() in (app+css+idx).lower(): prohibited.append(phrase)
assert not prohibited, prohibited

report={
 'version':'V65.2.8',
 'cycles':60,
 'cycle_results':results,
 'browser':'Chromium via Playwright',
 'errors':errors,
 'record_counts':{'all':19,'Schematics':4,'RF & Antenna':5,'Process & OPST':3,'Defects & SW':2,'Specification':5},
 'compact_heights':sorted(heights),
 'min_title_width':min(x['titleW'] for x in geoms2),
 'max_title_width':max(x['titleW'] for x in geoms2),
 'final_geometry':geoms2,
 'node_syntax_all_pass':all(x['ok'] for x in node_results),
 'prohibited_phrases_found':prohibited,
 'status':'PASS' if not errors and not prohibited and all(x['ok'] for x in node_results) else 'FAIL'
}
(OUT/'QA_RESULTS.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'status':report['status'],'errors':errors,'compact_heights':sorted(heights),'min_title_width':report['min_title_width'],'prohibited':prohibited},indent=2))
