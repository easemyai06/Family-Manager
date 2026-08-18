"""Compose polished 13-inch iPad marketing screenshots (2048x2732) — device frame +
warm brand gradient + caption. Matches the phone store set."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

RAW = "/app/store_assets/raw_ipad"
FONT_DIR = "/app/frontend/assets/fonts"
OUT = "/app/store_assets/ipad13"
os.makedirs(OUT, exist_ok=True)

F_BOLD = os.path.join(FONT_DIR, "PlusJakartaSans-700.ttf")
F_MED = os.path.join(FONT_DIR, "PlusJakartaSans-500.ttf")

W, H = 2048, 2732
ASPECT = 2732 / 2048  # iPad screenshot height/width

GRAD_TOP = (255, 247, 240)
GRAD_BOTTOM = (255, 202, 188)
TITLE_COLOR = (44, 44, 40)
SUB_COLOR = (110, 96, 88)
BEZEL_COLOR = (34, 33, 31)

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
    col = Image.new("RGB", (1, h))
    cpx = col.load()
    for y in range(h):
        t = y / (h - 1)
        t = t * t * (3 - 2 * t)
        cpx[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return col.resize((w, h))


def soft_glow(size, accent, radius_frac=0.6, alpha=60):
    w, h = size
    blob = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(blob)
    r = int(min(w, h) * radius_frac)
    cx, cy = int(w * 0.5), int(h * 0.4)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=accent + (alpha,))
    return blob.filter(ImageFilter.GaussianBlur(int(r * 0.6)))


def rounded_mask(w, h, radius):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    return m


def wrap_lines(text, font, max_w, draw):
    out = []
    for para in text.split("\n"):
        cur = ""
        for wd in para.split(" "):
            trial = (cur + " " + wd).strip()
            if draw.textlength(trial, font=font) <= max_w or not cur:
                cur = trial
            else:
                out.append(cur); cur = wd
        out.append(cur)
    return out


def compose(raw_file, title, subtitle, accent, out_path):
    bg = make_gradient(W, H, GRAD_TOP, GRAD_BOTTOM).convert("RGBA")
    bg.alpha_composite(soft_glow((W, H), accent))
    draw = ImageDraw.Draw(bg)

    title_font = ImageFont.truetype(F_BOLD, int(W * 0.044))
    sub_font = ImageFont.truetype(F_MED, int(W * 0.023))

    # text
    max_text_w = int(W * 0.86)
    y = int(H * 0.05)
    for ln in wrap_lines(title, title_font, max_text_w, draw):
        wln = draw.textlength(ln, font=title_font)
        draw.text(((W - wln) / 2, y), ln, font=title_font, fill=TITLE_COLOR)
        y += int(int(W * 0.044) * 1.16)
    y += int(H * 0.008)
    for ln in wrap_lines(subtitle, sub_font, max_text_w, draw):
        wln = draw.textlength(ln, font=sub_font)
        draw.text(((W - wln) / 2, y), ln, font=sub_font, fill=SUB_COLOR)
        y += int(int(W * 0.023) * 1.3)

    # iPad geometry (thin bezel)
    top_zone = int(H * 0.185)
    bottom_margin = int(H * 0.03)
    avail_h = H - top_zone - bottom_margin
    bezel = int(W * 0.011)
    frame_w = int(W * 0.82)
    inner_w = frame_w - 2 * bezel
    inner_h = int(inner_w * ASPECT)
    frame_h = inner_h + 2 * bezel
    if frame_h > avail_h:
        frame_h = avail_h
        inner_h = frame_h - 2 * bezel
        inner_w = int(inner_h / ASPECT)
        frame_w = inner_w + 2 * bezel
    fx = (W - frame_w) // 2
    fy = top_zone + (avail_h - frame_h) // 2
    frame_radius = int(bezel * 3.2)
    screen_radius = int(frame_radius - bezel * 0.6)

    # shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [fx, fy + int(bezel * 1.2), fx + frame_w, fy + frame_h + int(bezel * 1.2)],
        radius=frame_radius, fill=(40, 30, 26, 110))
    bg.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(int(bezel * 1.8))))

    # frame + screen
    frame = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rounded_rectangle([0, 0, frame_w - 1, frame_h - 1], radius=frame_radius, fill=BEZEL_COLOR)
    shot = Image.open(os.path.join(RAW, raw_file)).convert("RGB").resize((inner_w, inner_h), Image.LANCZOS)
    frame.paste(shot, (bezel, bezel), rounded_mask(inner_w, inner_h, screen_radius))
    fd.rounded_rectangle([1, 1, frame_w - 2, frame_h - 2], radius=frame_radius, outline=(90, 88, 84, 150), width=2)
    bg.alpha_composite(frame, (fx, fy))

    bg.convert("RGB").save(out_path, "PNG")
    print("  ", out_path)


for i, (raw_file, title, subtitle, accent) in enumerate(SLIDES, 1):
    print("iPad slide", i, raw_file)
    compose(raw_file, title, subtitle, accent, os.path.join(OUT, f"{i:02d}.png"))
print("DONE")
