"""Capture FamilyHome screens for the User Manual (phone resolution)."""
import os
from playwright.sync_api import sync_playwright

BASE = "https://our-story-191.preview.emergentagent.com"
EMAIL = "protectdemo@fam.com"
PW = "secret123"
OUT = "/app/docs/manual"
os.makedirs(OUT, exist_ok=True)


def wait_root(page, ms=2200):
    try:
        page.wait_for_function(
            "() => { const r=document.getElementById('root'); return r && r.innerText && r.innerText.trim().length>10; }",
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
        loc = page.locator('[data-testid="affection-dismiss"]').first
        if loc.count() > 0 and loc.is_visible():
            loc.click()
            page.wait_for_timeout(900)
            print("  dismissed affection overlay")
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


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])

    # ---------- LOGGED-OUT SCREENS ----------
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = ctx.new_page()
    print("Loading app (logged out)...")
    page.goto(BASE, wait_until="domcontentloaded")
    wait_root(page, 3200)

    try:
        shot(page, "00_welcome")
    except Exception as e:
        print("  welcome err", e)

    try:
        click_test(page, "login-link-btn", timeout=15000)
    except Exception:
        page.goto(BASE + "/(auth)/login", wait_until="domcontentloaded")
    wait_root(page, 2000)
    try:
        page.wait_for_selector('[data-testid="login-email-input"]', timeout=15000)
        shot(page, "01_login")
    except Exception as e:
        print("  login err", e)

    # Forgot password
    try:
        click_test(page, "forgot-link", timeout=8000)
        wait_root(page, 1800)
        shot(page, "02_forgot")
        page.go_back()
        wait_root(page, 1500)
    except Exception as e:
        print("  forgot err", e)

    # PIN sign-in
    try:
        click_test(page, "login-pin-btn", timeout=8000)
        wait_root(page, 1800)
        shot(page, "03_pin")
    except Exception as e:
        print("  pin err", e)

    ctx.close()

    # ---------- LOGGED-IN SCREENS ----------
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = ctx.new_page()
    print("Logging in...")
    page.goto(BASE, wait_until="domcontentloaded")
    wait_root(page, 3000)
    try:
        click_test(page, "login-link-btn", timeout=15000)
    except Exception:
        page.goto(BASE + "/(auth)/login", wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="login-email-input"]', timeout=20000)
    page.locator('[data-testid="login-email-input"]').fill(EMAIL)
    page.locator('[data-testid="login-password-input"]').fill(PW)
    page.locator('[data-testid="login-submit-btn"]').click()
    page.wait_for_selector('[data-testid="tab-index"]', timeout=45000)
    wait_root(page, 3200)
    dismiss_affection(page)
    wait_root(page, 1200)

    print("Capturing HOME")
    shot(page, "10_home")

    # Notifications (bell on home)
    try:
        click_test(page, "home-notifications")
        wait_root(page, 2600)
        shot(page, "11_notifications")
        click_test(page, "notif-back", timeout=8000)
        wait_root(page, 1500)
    except Exception as e:
        print("  notif err", e)

    # My profile via home avatar
    try:
        click_test(page, "home-avatar")
        wait_root(page, 2400)
        dismiss_affection(page)
        shot(page, "12_member")
        page.go_back()
        wait_root(page, 1500)
    except Exception as e:
        print("  member err", e)

    # Tabs
    for tab, name in [("calendar", "13_calendar"), ("family", "14_family")]:
        try:
            click_test(page, f"tab-{tab}")
            wait_root(page, 2600)
            dismiss_affection(page)
            shot(page, name)
        except Exception as e:
            print("  tab err", tab, e)

    # Chat (single family conversation via tab intercept)
    try:
        click_test(page, "tab-chat")
        wait_root(page, 3000)
        dismiss_affection(page)
        shot(page, "15_chat")
        page.go_back()
        wait_root(page, 1500)
    except Exception as e:
        print("  chat err", e)

    # go home before More navigation
    try:
        click_test(page, "tab-index")
        wait_root(page, 1500)
    except Exception:
        pass

    # More -> screens
    more_screens = [
        ("affection", "16_affection"),
        ("chores", "17_chores"),
        ("rewards", "18_rewards"),
        ("shopping", "19_shopping"),
        ("meals", "20_meals"),
        ("recipes", "21_recipes"),
        ("wishlist", "22_wishlist"),
        ("timeline", "23_timeline"),
        ("tree", "24_tree"),
        ("vault", "25_vault"),
        ("emergency", "26_emergency"),
        ("accessibility", "27_accessibility"),
        ("account", "28_account"),
    ]
    for key, name in more_screens:
        try:
            click_test(page, "tab-more")
            wait_root(page, 1600)
            click_test(page, f"more-{key}")
            wait_root(page, 2800)
            dismiss_affection(page)
            shot(page, name)
            page.go_back()
            page.wait_for_timeout(1100)
        except Exception as e:
            print("  more err", key, e)
            try:
                page.go_back()
                page.wait_for_timeout(900)
            except Exception:
                pass

    # More menu itself
    try:
        click_test(page, "tab-more")
        wait_root(page, 2000)
        shot(page, "29_more")
    except Exception as e:
        print("  more-menu err", e)

    ctx.close()
    browser.close()
    print("DONE")
