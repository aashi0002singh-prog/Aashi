from playwright.sync_api import sync_playwright
from pathlib import Path
p='http://127.0.0.1:8765/index.html'
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1536,'height':900}, device_scale_factor=1)
    errs=[]
    page.on('console', lambda m: errs.append(('console',m.type,m.text)) if m.type=='error' else None)
    page.on('pageerror', lambda e: errs.append(('pageerror','',str(e))))
    page.goto(p, wait_until='domcontentloaded', timeout=15000)
    page.wait_for_timeout(1500)
    print('title',page.title())
    print('url',page.url)
    print('cards',page.locator('.record-card').count())
    print('tabs',page.locator('.cat-btn').count())
    print('errors',errs[:10])
    page.screenshot(path='/mnt/data/v65_2_7_shots/all.png', full_page=True)
    browser.close()
