# FamilyHome — App Store Screenshots

Polished, marketing-style screenshots generated from the **real app** (Sharma demo family,
clean/non-sensitive data) with a device frame, on-brand warm gradient, and a benefit-led caption.

## Folders
- `apple/`  — Apple App Store (iPhone), **1290 × 2796 px** (iPhone 6.7"/6.9", portrait). 8 images.
- `ipad13/` — Apple App Store (iPad), **2048 × 2732 px** (13-inch iPad Display, portrait). 8 images.
- `google/` — Google Play, **1080 × 1920 px** (phone, 9:16, portrait). 8 images.
- `raw/`    — Raw un-framed iPhone captures (source material), 1290 × 2796 px.
- `raw_ipad/` — Raw un-framed iPad captures (source material), 2048 × 2732 px.

Upload the iPhone set (`apple/`) to the 6.7"/6.9" slot and the iPad set (`ipad13/`) to the 13-inch iPad slot in App Store Connect. Google Play uses the `google/` set.

## The 8 screenshots (same order in both folders)
| # | Screen | Caption |
|---|--------|---------|
| 01 | Home dashboard | Your whole family, in one place |
| 02 | Calendar + RSVP | Never miss a family moment |
| 03 | Family + Send Love | Stay close, every single day |
| 04 | Kids Chores & Stars | Chores kids actually enjoy |
| 05 | Family Chat | A private chat, just for family |
| 06 | Emergency / SOS | Peace of mind, always |
| 07 | Family Rewards | Turn helping into a game |
| 08 | Our Family Story (memories) | Keep every memory safe |

## Notes
- All data shown is the fictional "Sharma Family" demo seed — no real user data, credentials,
  emails, tokens, or private documents are exposed.
- Store listing tip: the first 2–3 screenshots matter most; the current order leads with the
  Home dashboard and Calendar, which best communicate the core value.
- To regenerate: `python /app/scripts/capture_screens.py` (raw captures) then
  `python /app/scripts/compose.py` (framed marketing images).
- iPad set: `python /app/scripts/capture_ipad.py` (+ `capture_ipad_chat.py` for a fuller chat) then
  `python /app/scripts/compose_ipad.py`.
