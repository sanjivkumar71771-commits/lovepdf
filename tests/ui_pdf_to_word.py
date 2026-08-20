import asyncio, os, zipfile, sys
from playwright.async_api import async_playwright
from docx import Document

BASE = os.environ.get('REACT_APP_BACKEND_URL', 'https://lovepdf-tools-1.preview.emergentagent.com')

async def run_one(p, pdf_path, expected_name, expected_text):
    browser = await p.chromium.launch(headless=True)
    ctx = await browser.new_context(accept_downloads=True)
    page = await ctx.new_page()
    page.on('console', lambda m: print(f'CONSOLE[{m.type}]:', m.text))
    url = f'{BASE}/tool/pdf-to-word'
    print(f'--> Navigating: {url}')
    await page.goto(url, wait_until='domcontentloaded')
    await page.wait_for_selector('input[type=file]', timeout=15000, state='attached')
    await page.set_input_files('input[type=file]', pdf_path)
    await page.wait_for_timeout(1500)
    # Click main convert button (labeled with tool name)
    btn = page.locator('button:has-text("PDF to Word")').last
    async with page.expect_download(timeout=120000) as dl_info:
        # click the convert button first
        await btn.click()
        # Wait for result-view download button (has 'Download')
        try:
            await page.wait_for_selector('button:has-text("Download")', timeout=90000)
            await page.click('button:has-text("Download")')
        except Exception as e:
            print('No download button appeared:', e)
    download = await dl_info.value
    suggested = download.suggested_filename
    out_path = f'/tmp/dl_{expected_name}'
    await download.save_as(out_path)
    print(f'Suggested filename: {suggested}')
    print(f'Saved to: {out_path} size={os.path.getsize(out_path)}')

    ok_name = suggested == expected_name
    # zip integrity
    try:
        z = zipfile.ZipFile(out_path)
        zip_bad = z.testzip()
    except Exception as e:
        zip_bad = f'open-failed: {e}'
    # docx open
    try:
        doc = Document(out_path)
        text = '\n'.join(p.text for p in doc.paragraphs)
        docx_ok = True
    except Exception as e:
        text = ''
        docx_ok = f'docx-failed: {e}'
    contains = expected_text.lower() in text.lower()
    print(f'RESULT[{expected_name}]: name_ok={ok_name} zip_bad={zip_bad} docx_ok={docx_ok} contains_expected={contains}')
    print('--- text sample ---')
    print(text[:500])
    print('-------------------')
    await ctx.close(); await browser.close()
    return {'name_ok': ok_name, 'zip_bad': zip_bad, 'docx_ok': docx_ok, 'contains': contains, 'suggested': suggested}

async def main():
    async with async_playwright() as p:
        r1 = await run_one(p, '/tmp/text.pdf', 'text.docx', 'Hello World')
        r2 = await run_one(p, '/tmp/scan.pdf', 'scan.docx', 'SCANNED DOCUMENT TEST')
    print('\n==== SUMMARY ====')
    print('text.pdf:', r1)
    print('scan.pdf:', r2)
    ok = (r1['name_ok'] and r1['zip_bad'] is None and r1['docx_ok'] is True and r1['contains']
          and r2['name_ok'] and r2['zip_bad'] is None and r2['docx_ok'] is True and r2['contains'])
    print('ALL PASS:', ok)
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    asyncio.run(main())
