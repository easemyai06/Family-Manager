"""Register a fresh account, seed the demo family, capture a clean Family Chat conversation."""
import os, time, random
from playwright.sync_api import sync_playwright

BASE = "https://our-story-191.preview.emergentagent.com"
EMAIL = f"shots{random.randint(10000,99999)}@fam.com"
PW = "secret123"
NAME = "Raj Sharma"
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

    print("register", EMAIL)
    # Welcome -> Get Started (register)
    try:
        page.locator('[data-testid="get-started-btn"]').first.click()
    except Exception:
        page.goto(BASE + "/register", wait_until="domcontentloaded"); wait_root(page)
    page.wait_for_selector('[data-testid="register-email-input"]', timeout=20000)
    page.locator('[data-testid="register-name-input"]').fill(NAME)
    page.locator('[data-testid="register-email-input"]').fill(EMAIL)
    page.locator('[data-testid="register-password-input"]').fill(PW)
    page.locator('[data-testid="register-submit-btn"]').click()

    # Onboarding -> Explore the Sharma Family (seed demo)
    page.wait_for_selector('[data-testid="try-demo-btn"]', timeout=30000)
    wait_root(page, 1500)
    print("seeding demo family...")
    page.locator('[data-testid="try-demo-btn"]').click()
    page.wait_for_selector('[data-testid="tab-index"]', timeout=60000)
    wait_root(page, 4000)
    # dismiss affection overlay if present
    try:
        if page.locator('[data-testid="affection-dismiss"]').count() > 0:
            page.locator('[data-testid="affection-dismiss"]').first.click(); page.wait_for_timeout(900)
    except Exception:
        pass

    # Open Chat -> Family Chat
    page.locator('[data-testid="tab-chat"]').first.click()
    wait_root(page, 2800)
    row = page.locator('[data-testid^="chat-"]').filter(has_text="Family Chat").first
    row.wait_for(state="visible", timeout=15000)
    row.dispatch_event("click")
    wait_root(page, 3200)
    try:
        page.wait_for_selector('[data-testid="chat-input"]', timeout=8000)
        print("in conversation")
    except Exception:
        print("WARN not in conversation")
    page.wait_for_timeout(1500)
    page.screenshot(path=os.path.join(OUT, "04_chat_convo.png"))
    print("saved clean 04_chat_convo.png from", EMAIL)
    ctx.close(); browser.close()
