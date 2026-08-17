"""Capture the Family Chat conversation view for a stronger chat screenshot."""
import os
from playwright.sync_api import sync_playwright

BASE = "https://our-story-191.preview.emergentagent.com"
EMAIL = "protectdemo@fam.com"
PW = "secret123"
OUT = "/app/store_assets/raw"


def wait_root(page, ms=2600):
    try:
        page.wait_for_function(
            "() => { const r=document.getElementById('root'); return r && r.innerText && r.innerText.trim().length>15; }",
            timeout=30000,
        )
    except Exception as e:
        print("  wait_root warn:", e)
    page.wait_for_timeout(ms)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = browser.new_context(viewport={"width": 430, "height": 932}, device_scale_factor=3)
    page = ctx.new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    wait_root(page, 3500)
    try:
        page.locator('[data-testid="login-link-btn"]').first.click()
    except Exception:
        page.goto(BASE + "/login", wait_until="domcontentloaded"); wait_root(page)
    page.wait_for_selector('[data-testid="login-email-input"]', timeout=20000)
    page.locator('[data-testid="login-email-input"]').fill(EMAIL)
    page.locator('[data-testid="login-password-input"]').fill(PW)
    page.locator('[data-testid="login-submit-btn"]').click()
    page.wait_for_selector('[data-testid="tab-index"]', timeout=45000)
    wait_root(page, 3000)
    # dismiss affection
    try:
        if page.locator('[data-testid="affection-dismiss"]').count() > 0:
            page.locator('[data-testid="affection-dismiss"]').first.click(); page.wait_for_timeout(800)
    except Exception:
        pass

    page.locator('[data-testid="tab-chat"]').first.click()
    wait_root(page, 2500)
    print("opening Family Chat conversation")
    row = page.locator('[data-testid^="chat-"]').filter(has_text="Family Chat").first
    row.wait_for(state="visible", timeout=15000)
    row.dispatch_event("click")
    wait_root(page, 3200)
    # confirm we navigated into the conversation (input present)
    try:
        page.wait_for_selector('[data-testid="chat-input"]', timeout=8000)
        print("in conversation")
    except Exception:
        print("WARN: still on list, retrying via bounding-box click")
        box = row.bounding_box()
        if box:
            page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            wait_root(page, 3000)

    # Scroll the message list to the TOP to show the wholesome family exchange
    page.wait_for_timeout(1500)
    page.evaluate(
        """() => {
        const divs = Array.from(document.querySelectorAll('div'));
        let best=null, bestH=0;
        for (const d of divs){
          const s=getComputedStyle(d);
          if ((s.overflowY==='auto'||s.overflowY==='scroll') && d.scrollHeight>d.clientHeight+40){
            if (d.scrollHeight>bestH){bestH=d.scrollHeight; best=d;}
          }
        }
        if(best){best.scrollTop=0;}
      }"""
    )
    page.wait_for_timeout(1800)
    page.screenshot(path=os.path.join(OUT, "04_chat_convo.png"))
    print("saved 04_chat_convo.png")
    ctx.close(); browser.close()
