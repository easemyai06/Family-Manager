"""Compose polished marketing store screenshots (device frame + gradient + caption)
for both Apple App Store (1290x2796) and Google Play (1080x1920)."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

RAW = "/app/store_assets/raw"
FONT_DIR = "/app/frontend/assets/fonts"
OUT_APPLE = "/app/store_assets/apple"
OUT_GOOGLE = "/app/store_assets/google"
os.makedirs(OUT_APPLE, exist_ok=True)
os.makedirs(OUT_GOOGLE, exist_ok=True)

F_BOLD = os.path.join(FONT_DIR, "PlusJakartaSans-700.ttf")
F_MED = os.path.join(FONT_DIR, "PlusJakartaSans-500.ttf")
F_SEMI = os.path.join(FONT_DIR, "PlusJakartaSans-600.ttf")

# Screenshot aspect (height / width) of the raw captures (430x932 logical @3x)
ASPECT = 932 / 430

# Warm on-brand gradient (cream -> soft coral)
GRAD_TOP = (255, 247, 240)
GRAD_BOTTOM = (255, 202, 188)
TITLE_COLOR = (44, 44, 40)
SUB_COLOR = (110, 96, 88)
BEZEL_COLOR = (34, 33, 31)

# slide definitions: raw file, title, subtitle, decorative accent for glow
SLIDES = [
    ("01_home.png", "Your whole family,\nin one place", "Everything that matters today, at a glance", (255, 107, 107)),
    ("02_calendar.png", "Never miss a\nfamily moment", "Shared calendar with RSVPs & reminders", (127, 169, 201)),
    ("03_family.png", "Stay close,\nevery single day", "See everyone and share a little love", (232, 106, 140)),
    ("06_chores.png", "Chores kids\nactually enjoy", "Earn stars for helping out at home", (255, 209, 102)),
    ("04_chat_convo.png", "A private chat,\njust for family", "No ads. No strangers. Only your people.", (255, 107, 107)),
    ("05_emergency.png", "Peace of mind,\nalways", "SOS alerts, medical info & one-tap calling", (224, 87, 87)),
    ("09_rewards.png", "Turn helping\ninto a game", "Streaks, stars, badges & a leaderboard", (232, 163, 61)),
    ("08_timeline.png", "Keep every\nmemory safe", "Your family story, beautifully preserved", (217, 142, 90)),
]


def make_gradient(w, h, top, bottom):
    base = Image.new("RGB", (w, h), top)
    top_arr = list(top)
    bot_arr = list(bottom)
    px = base.load()
    # build a single column then expand
    col = Image.new("RGB", (1, h))
    cpx = col.load()
    for y in range(h):
        t = y / (h - 1)
        # ease for a softer transition
        t = t * t * (3 - 2 * t)
        r = int(top_arr[0] + (bot_arr[0] - top_arr[0]) * t)
        g = int(top_arr[1] + (bot_arr[1] - top_arr[1]) * t)
        b = int(top_arr[2] + (bot_arr[2] - top_arr[2]) * t)
        cpx[0, y] = (r, g, b)
    return col.resize((w, h))


def soft_glow(size, accent, radius_frac=0.55, alpha=70):
    """A large soft radial glow blob."""
    w, h = size
    blob = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(blob)
    r = int(min(w, h) * radius_frac)
    cx, cy = int(w * 0.5), int(h * 0.42)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=accent + (alpha,))
    return blob.filter(ImageFilter.GaussianBlur(int(r * 0.6)))


def rounded_mask(w, h, radius):
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    return m


def wrap_lines(text, font, max_w, draw):
    """Respect explicit newlines, then wrap each part to max_w."""
    out = []
    for para in text.split("\n"):
        words = para.split(" ")
        cur = ""
        for wd in words:
            trial = (cur + " " + wd).strip()
            if draw.textlength(trial, font=font) <= max_w or not cur:
                cur = trial
            else:
                out.append(cur)
                cur = wd
        out.append(cur)
    return out


def compose(canvas_w, canvas_h, raw_file, title, subtitle, accent, out_path,
            phone_frac, top_zone_frac, title_frac, sub_frac):
    # Background
    bg = make_gradient(canvas_w, canvas_h, GRAD_TOP, GRAD_BOTTOM).convert("RGBA")
    bg.alpha_composite(soft_glow((canvas_w, canvas_h), accent, 0.6, 60))

    draw = ImageDraw.Draw(bg)
    title_font = ImageFont.truetype(F_BOLD, int(canvas_w * title_frac))
    sub_font = ImageFont.truetype(F_MED, int(canvas_w * sub_frac))

    # ---- Text ----
    max_text_w = int(canvas_w * 0.86)
    top_pad = int(canvas_h * 0.052)
    tlines = wrap_lines(title, title_font, max_text_w, draw)
    line_h = int(int(canvas_w * title_frac) * 1.16)
    y = top_pad
    for ln in tlines:
        w_ln = draw.textlength(ln, font=title_font)
        draw.text(((canvas_w - w_ln) / 2, y), ln, font=title_font, fill=TITLE_COLOR)
        y += line_h
    y += int(canvas_h * 0.012)
    slines = wrap_lines(subtitle, sub_font, max_text_w, draw)
    sub_line_h = int(int(canvas_w * sub_frac) * 1.3)
    for ln in slines:
        w_ln = draw.textlength(ln, font=sub_font)
        draw.text(((canvas_w - w_ln) / 2, y), ln, font=sub_font, fill=SUB_COLOR)
        y += sub_line_h

    # ---- Phone geometry ----
    top_zone = int(canvas_h * top_zone_frac)
    bottom_margin = int(canvas_h * 0.035)
    avail_h = canvas_h - top_zone - bottom_margin
    bezel = max(14, int(canvas_w * 0.016))
    phone_w = int(canvas_w * phone_frac)
    inner_w = phone_w - 2 * bezel
    inner_h = int(inner_w * ASPECT)
    phone_h = inner_h + 2 * bezel
    if phone_h > avail_h:
        phone_h = avail_h
        inner_h = phone_h - 2 * bezel
        inner_w = int(inner_h / ASPECT)
        phone_w = inner_w + 2 * bezel
    px = (canvas_w - phone_w) // 2
    py = top_zone + (avail_h - phone_h) // 2

    phone_radius = int(bezel * 2.6)
    screen_radius = int(phone_radius - bezel * 0.7)

    # ---- Drop shadow ----
    shadow = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([px, py + int(bezel * 1.4), px + phone_w, py + phone_h + int(bezel * 1.4)],
                         radius=phone_radius, fill=(40, 30, 26, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(bezel * 1.6)))
    bg.alpha_composite(shadow)

    # ---- Phone bezel ----
    phone = Image.new("RGBA", (phone_w, phone_h), (0, 0, 0, 0))
    pd = ImageDraw.Draw(phone)
    pd.rounded_rectangle([0, 0, phone_w - 1, phone_h - 1], radius=phone_radius, fill=BEZEL_COLOR)

    # ---- Screen ----
    shot = Image.open(os.path.join(RAW, raw_file)).convert("RGB")
    shot = shot.resize((inner_w, inner_h), Image.LANCZOS)
    sm = rounded_mask(inner_w, inner_h, screen_radius)
    phone.paste(shot, (bezel, bezel), sm)

    # subtle bezel highlight ring
    pd.rounded_rectangle([1, 1, phone_w - 2, phone_h - 2], radius=phone_radius,
                         outline=(90, 88, 84, 160), width=2)

    bg.alpha_composite(phone, (px, py))

    bg.convert("RGB").save(out_path, "PNG")
    print("  ", out_path)


for i, (raw_file, title, subtitle, accent) in enumerate(SLIDES, 1):
    name = f"{i:02d}.png"
    print("Slide", i, raw_file)
    # Apple 6.7"  1290 x 2796
    compose(1290, 2796, raw_file, title, subtitle, accent,
            os.path.join(OUT_APPLE, name),
            phone_frac=0.80, top_zone_frac=0.20, title_frac=0.064, sub_frac=0.031)
    # Google Play phone 1080 x 1920
    compose(1080, 1920, raw_file, title, subtitle, accent,
            os.path.join(OUT_GOOGLE, name),
            phone_frac=0.66, top_zone_frac=0.205, title_frac=0.060, sub_frac=0.030)

print("DONE")
