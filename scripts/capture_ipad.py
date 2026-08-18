"""Capture FamilyHome app screens at 13-inch iPad resolution (2048x2732) for store assets.
Phase A: rich data from protectdemo. Phase B: clean Family Chat from a fresh seeded account."""
import os, random
from playwright.sync_api import sync_playwright

BASE = "https://our-story-191.preview.emergentagent.com"
OUT = "/app/store_assets/raw_ipad"
os.makedirs(OUT, exist_ok=True)

# iPad Pro 13" portrait: 1024x1366 logical @2x = 2048x2732 physical (App Store 13" iPad size)
VP = {"width": 1024, "height": 1366}
DSF = 2


def wait_root(page, ms=2800):
    try:
        page.wait_for_function(
            "() => { const r=document.getElementById('root'); return r && r.innerText && r.innerText.trim().length>15; }",
            timeout=30000)
    except Exception as e:
        print("  wait_root warn:", e)
    page.wait_for_timeout(ms)


def dismiss_affection(page):
    try:
        if page.locator('[data-testid="affection-dismiss"]').count() > 0:
            page.locator('[data-testid="affection-dismiss"]').first.click()
            page.wait_for_timeout(900)
    except Exception:
        pass


def click_test(page, tid, timeout=20000):
    loc = page.locator(f'[data-testid="{tid}"]').first
    loc.wait_for(state="visible", timeout=timeout)
    try:
        loc.scroll_into_view_if_needed(timeout=4000)
    except Exception:
        pass
    loc.click()


def shot(page, name):
    p = os.path.join(OUT, name + ".png")
    page.screenshot(path=p)
    print("  saved", p)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # ---------- Phase A: protectdemo (rich data) ----------
    ctxA = browser.new_context(viewport=VP, device_scale_factor=DSF)
    page = ctxA.new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    wait_root(page, 3500)
    try:
        click_test(page, "login-link-btn")
    except Exception:
        page.goto(BASE + "/login", wait_until="domcontentloaded"); wait_root(page)
    page.wait_for_selector('[data-testid="login-email-input"]', timeout=20000)
    page.locator('[data-testid="login-email-input"]').fill("protectdemo@fam.com")
    page.locator('[data-testid="login-password-input"]').fill("secret123")
    page.locator('[data-testid="login-submit-btn"]').click()
    page.wait_for_selector('[data-testid="tab-index"]', timeout=45000)
    wait_root(page, 3500)
    dismiss_affection(page)
    wait_root(page, 1200)

    print("iPad: home")
    shot(page, "01_home")
    for tab, name in [("calendar", "02_calendar"), ("family", "03_family")]:
        click_test(page, f"tab-{tab}"); wait_root(page, 3000); dismiss_affection(page); shot(page, name)
    for key, name in [("emergency", "05_emergency"), ("chores", "06_chores"),
                      ("rewards", "09_rewards"), ("timeline", "08_timeline")]:
        click_test(page, "tab-more"); wait_root(page, 1600)
        click_test(page, f"more-{key}"); wait_root(page, 3200); dismiss_affection(page); shot(page, name)
        page.go_back(); page.wait_for_timeout(1200)
    ctxA.close()

    # ---------- Phase B: fresh account -> clean Family Chat ----------
    ctxB = browser.new_context(viewport=VP, device_scale_factor=DSF)
    page = ctxB.new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    wait_root(page, 3500)
    email = f"ipad{random.randint(10000,99999)}@fam.com"
    try:
        click_test(page, "get-started-btn")
    except Exception:
        page.goto(BASE + "/register", wait_until="domcontentloaded"); wait_root(page)
    page.wait_for_selector('[data-testid="register-email-input"]', timeout=20000)
    page.locator('[data-testid="register-name-input"]').fill("Raj Sharma")
    page.locator('[data-testid="register-email-input"]').fill(email)
    page.locator('[data-testid="register-password-input"]').fill("secret123")
    page.locator('[data-testid="register-submit-btn"]').click()
    page.wait_for_selector('[data-testid="try-demo-btn"]', timeout=30000)
    wait_root(page, 1500)
    print("iPad: seeding demo for chat...", email)
    page.locator('[data-testid="try-demo-btn"]').click()
    page.wait_for_selector('[data-testid="tab-index"]', timeout=60000)
    wait_root(page, 3500)
    dismiss_affection(page)
    click_test(page, "tab-chat"); wait_root(page, 2800)
    row = page.locator('[data-testid^="chat-"]').filter(has_text="Family Chat").first
    row.wait_for(state="visible", timeout=15000)
    row.dispatch_event("click")
    wait_root(page, 3200)
    try:
        page.wait_for_selector('[data-testid="chat-input"]', timeout=8000)
    except Exception:
        print("  WARN not in convo")
    page.wait_for_timeout(1200)
    shot(page, "04_chat_convo")
    ctxB.close()
    browser.close()
    print("DONE")
