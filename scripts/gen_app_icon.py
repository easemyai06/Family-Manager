import asyncio
import os
import base64
from io import BytesIO
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT_DIR = "/app/scripts/icon_out"
os.makedirs(OUT_DIR, exist_ok=True)

IOS_PROMPT = (
    "Design a modern flat mobile app store icon, perfectly square, full-bleed 1:1. "
    "Concept: a cozy rounded house combined with a heart forming the roof/center of the house. "
    "Style: flat and modern, clean solid shapes with subtle soft depth, smooth rounded geometry, "
    "friendly and premium, warm and family-friendly. "
    "Background: a soft smooth diagonal gradient from warm coral (#FF6B6B) at the top to gentle warm cream (#FFF3EC) at the bottom. "
    "The house-heart symbol is centered, in creamy white with a soft coral accent, with a tiny botanical leaf sprout accent. "
    "No text, no letters, no words, no drop shadow behind the whole square, no rounded corner mask (leave a full square), "
    "no border, no photorealism. Crisp vector-like illustration. High resolution, centered composition with balanced padding."
)

ANDROID_PROMPT = (
    "Design a single flat modern app icon symbol on a solid warm coral background of exact color #FF6B6B, perfectly square 1:1. "
    "Concept: a cozy rounded house combined with a heart forming the roof/center, rendered in creamy white (#FFF6F0) "
    "with a tiny botanical leaf sprout accent. Style: flat and modern, clean solid shapes, smooth rounded geometry, friendly and premium. "
    "The symbol is centered and NOT too large: it must sit within the middle 60 percent of the canvas with generous empty coral padding all around "
    "(important for Android adaptive icon safe zone). Solid flat coral fills the entire background edge to edge, exact color #FF6B6B. "
    "No text, no letters, no words, no gradient, no border, no rounded corner mask. Crisp vector-like illustration, high resolution."
)


async def gen(prompt, name):
    chat = LlmChat(api_key=API_KEY, session_id=f"icon-{name}", system_message="You are a professional app icon designer.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    _text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not images:
        print(f"[{name}] NO IMAGE returned")
        return None
    img_bytes = base64.b64decode(images[0]["data"])
    path = os.path.join(OUT_DIR, f"{name}_raw.png")
    with open(path, "wb") as f:
        f.write(img_bytes)
    print(f"[{name}] saved raw -> {path} ({len(img_bytes)} bytes, mime {images[0]['mime_type']})")
    return path


def square_resize(src, dst, size=1024, bg=(255, 107, 107)):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    im = im.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)
    im.save(dst, "PNG")
    print(f"resized {src} -> {dst} {im.size}")


async def main():
    ios_raw = await gen(IOS_PROMPT, "ios")
    and_raw = await gen(ANDROID_PROMPT, "android")
    if ios_raw:
        square_resize(ios_raw, os.path.join(OUT_DIR, "icon.png"))
        square_resize(ios_raw, os.path.join(OUT_DIR, "favicon.png"), size=512)
    if and_raw:
        square_resize(and_raw, os.path.join(OUT_DIR, "adaptive-icon.png"))


if __name__ == "__main__":
    asyncio.run(main())
