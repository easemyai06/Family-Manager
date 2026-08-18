"""Re-capture the iPad Family Chat with a fuller, active conversation."""
import os, random
from playwright.sync_api import sync_playwright

BASE = "https://our-story-191.preview.emergentagent.com"
OUT = "/app/store_assets/raw_ipad"
VP = {"width": 1024, "height": 1366}

MSGS = [
    "On my way to grab Aarav now",
    "Anyone need anything from the shop?",
    "Grabbing milk and eggs too",
    "Dinner sounds perfect, thanks Meera",
    "Aarav scored a goal today!",
    "So proud of him",
    "Movie night on Saturday?",
    "I'll book the tickets",
    "Grandma's coming over too",
    "Can't wait to see everyone",
    "See everyone at 8",
]


def wait_root(page, ms=2800):
    try:
        page.wait_for_function(
            "() => { const r=document.getElementById('root'); return r && r.innerText && r.innerText.trim().length>15; }",
            timeout=30000)
    except Exception:
        pass
    page.wait_for_timeout(ms)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = browser.new_context(viewport=VP, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    wait_root(page, 3500)
    email = f"ipadchat{random.randint(10000,99999)}@fam.com"
    try:
        page.locator('[data-testid="get-started-btn"]').first.click()
    except Exception:
        page.goto(BASE + "/register", wait_until="domcontentloaded"); wait_root(page)
    page.wait_for_selector('[data-testid="register-email-input"]', timeout=20000)
    page.locator('[data-testid="register-name-input"]').fill("Raj Sharma")
    page.locator('[data-testid="register-email-input"]').fill(email)
    page.locator('[data-testid="register-password-input"]').fill("secret123")
    page.locator('[data-testid="register-submit-btn"]').click()
    page.wait_for_selector('[data-testid="try-demo-btn"]', timeout=30000)
    wait_root(page, 1500)
    print("seeding...", email)
    page.locator('[data-testid="try-demo-btn"]').click()
    page.wait_for_selector('[data-testid="tab-index"]', timeout=60000)
    wait_root(page, 3500)
    try:
        if page.locator('[data-testid="affection-dismiss"]').count() > 0:
            page.locator('[data-testid="affection-dismiss"]').first.click(); page.wait_for_timeout(900)
    except Exception:
        pass

    page.locator('[data-testid="tab-chat"]').first.click()
    wait_root(page, 2800)
    row = page.locator('[data-testid^="chat-"]').filter(has_text="Family Chat").first
    row.wait_for(state="visible", timeout=15000)
    row.dispatch_event("click")
    wait_root(page, 3000)
    page.wait_for_selector('[data-testid="chat-input"]', timeout=10000)

    for m in MSGS:
        page.locator('[data-testid="chat-input"]').fill(m)
        page.locator('[data-testid="chat-send-btn"]').click()
        page.wait_for_timeout(700)
    page.wait_for_timeout(2500)
    page.screenshot(path=os.path.join(OUT, "04_chat_convo.png"))
    print("saved fuller iPad chat")
    ctx.close(); browser.close()
