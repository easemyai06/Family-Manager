"""Capture real FamilyHome app screens (logged-in) at phone resolution for store assets."""
import os
from playwright.sync_api import sync_playwright

BASE = "https://our-story-191.preview.emergentagent.com"
EMAIL = "protectdemo@fam.com"
PW = "secret123"
OUT = "/app/store_assets/raw"
os.makedirs(OUT, exist_ok=True)


def wait_root(page, ms=2600):
    try:
        page.wait_for_function(
            "() => { const r=document.getElementById('root'); return r && r.innerText && r.innerText.trim().length>15; }",
            timeout=30000,
        )
    except Exception as e:
        print("  wait_root warn:", e)
    page.wait_for_timeout(ms)


def shot(page, name):
    path = os.path.join(OUT, name + ".png")
    page.screenshot(path=path)
    print("  saved", path)


def dismiss_affection(page):
    try:
        if page.locator('[data-testid="affection-animation"]').count() > 0 and page.locator('[data-testid="affection-animation"]').first.is_visible():
            page.locator('[data-testid="affection-dismiss"]').first.click()
            page.wait_for_timeout(1000)
            print("  dismissed affection overlay")
    except Exception as e:
        print("  affection dismiss warn:", e)


def click_test(page, tid, timeout=20000):
    loc = page.locator(f'[data-testid="{tid}"]').first
    loc.wait_for(state="visible", timeout=timeout)
    try:
        loc.scroll_into_view_if_needed(timeout=4000)
    except Exception:
        pass
    loc.click()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = browser.new_context(viewport={"width": 430, "height": 932}, device_scale_factor=3)
    page = ctx.new_page()

    print("Loading app...")
    page.goto(BASE, wait_until="domcontentloaded")
    wait_root(page, 3500)

    # Go to login
    print("Logging in...")
    try:
        click_test(page, "login-link-btn", timeout=20000)
    except Exception:
        # maybe already showing login or a different welcome control
        page.goto(BASE + "/login", wait_until="domcontentloaded")
        wait_root(page, 2500)
    page.wait_for_selector('[data-testid="login-email-input"]', timeout=20000)
    page.locator('[data-testid="login-email-input"]').fill(EMAIL)
    page.locator('[data-testid="login-password-input"]').fill(PW)
    page.locator('[data-testid="login-submit-btn"]').click()

    # Wait for home
    page.wait_for_selector('[data-testid="tab-index"]', timeout=45000)
    wait_root(page, 3500)
    dismiss_affection(page)
    wait_root(page, 1500)

    print("Capturing HOME")
    shot(page, "01_home")

    # Tab screens
    for tab, name in [("calendar", "02_calendar"), ("family", "03_family"), ("chat", "04_chat")]:
        print("Capturing tab", tab)
        try:
            click_test(page, f"tab-{tab}")
            wait_root(page, 3000)
            dismiss_affection(page)
            shot(page, name)
        except Exception as e:
            print("  ERROR tab", tab, e)

    # Non-tab screens via More
    non_tab = [
        ("emergency", "05_emergency"),
        ("chores", "06_chores"),
        ("meals", "07_meals"),
        ("timeline", "08_timeline"),
        ("rewards", "09_rewards"),
        ("wishlist", "10_wishlist"),
        ("vault", "11_vault"),
        ("shopping", "12_shopping"),
    ]
    for key, name in non_tab:
        print("Capturing more ->", key)
        try:
            click_test(page, "tab-more")
            wait_root(page, 1800)
            click_test(page, f"more-{key}")
            wait_root(page, 3200)
            dismiss_affection(page)
            shot(page, name)
            page.go_back()
            page.wait_for_timeout(1200)
        except Exception as e:
            print("  ERROR more", key, e)
            try:
                page.go_back()
                page.wait_for_timeout(1000)
            except Exception:
                pass

    ctx.close()
    browser.close()
    print("DONE")
