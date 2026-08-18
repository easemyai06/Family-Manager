# FamilyHome — Store Listing Copy

Ready-to-paste metadata for the App Store and Google Play. Character limits are noted; the strings below fit within them.

---

## Apple App Store

### App Name (≤30)
`FamilyHome`

### Subtitle (≤30)
`Your family, all in one place`

### Promotional Text (≤170, editable anytime without review)
`One private, ad-free home for your whole family — calendar, chores, lists, chat, memories and emergency info, together in one beautifully simple app.`

### Keywords (≤100, comma-separated, no spaces after commas)
`family organizer,shared calendar,chores,kids,grocery,to-do,meals,memories,family chat,SOS,vault`

### Description (≤4000)
```
FamilyHome is the private, ad-free home for everything your family does together — from today's school run to the memories you'll want forever.

No feeds. No strangers. No ads. Just your people, beautifully organized.

EVERYTHING TODAY, AT A GLANCE
A warm family dashboard shows what actually needs you: today's events, chores left, what to buy, upcoming birthdays and anything urgent — all in one calm view you can personalize.

ONE SHARED FAMILY CALENDAR
Plan together and never miss a moment. Create events, invite family members, and let everyone RSVP with Going / Maybe / Can't make it. Set weekly or monthly repeats, and send a gentle nudge to anyone who hasn't replied. Invitations drop straight into everyone's calendar.

CHORES & REWARDS KIDS LOVE
Give kids simple chores, reward them with stars, and watch streaks and badges grow. A friendly leaderboard turns helping out at home into a game the whole family enjoys.

LISTS THAT KEEP EVERYONE IN SYNC
Shared shopping lists, to-do lists, a weekly meal planner, and a recipe book — plan the week's dinners and auto-build the grocery list in a tap.

A PRIVATE FAMILY CHAT
Group chat and direct messages just for family — with replies, reactions, voice notes and photos. No ads and no outsiders, ever.

MEMORIES, BEAUTIFULLY KEPT
Save your family story as a timeline, relive "On This Day," build photo albums, and celebrate the little moments together.

PEACE OF MIND WHEN IT MATTERS
Keep emergency contacts, medical info (blood group, allergies) and important documents handy in a private Family Vault. A one-tap SOS alerts your whole family instantly, and trusted adults can be given view-only emergency access.

WISH LISTS & CELEBRATIONS
Keep everyone's wish lists in one place so gifting is easy and birthdays are never forgotten.

PRIVATE BY DESIGN
Your content is visible only to your family group. Sensitive items like documents and medical cards have their own visibility controls. We never sell your data and we never show ads. You can export your family data or delete your account at any time, right from the app.

Sign in with email, Google, or Apple.

FamilyHome — your family, your memories, your little world.

Publisher: Ease My Ai Pvt Ltd
Questions? info@easemyai.com
```

### App Store Connect — other fields (manual)
- Support URL: your deployed `…/api/legal/support` page, or a simple site linking to `info@easemyai.com`
- Marketing URL (optional): your website
- Privacy Policy URL: your deployed `https://<your-domain>/api/legal/privacy`
- Category: Primary **Lifestyle** (Secondary: Productivity)
- Age rating: 4+ (no objectionable content)
- Copyright: `© 2026 Ease My Ai Pvt Ltd`

---

## Google Play

### App Title (≤30)
`FamilyHome: Family Organizer`

### Short Description (≤80)
`Private family organizer: calendar, chores, lists, chat, memories & SOS.`

### Full Description (≤4000)
Use the same body as the App Store description above (it fits within Google's 4000-char limit).

### Play Console — other fields (manual)
- App category: **Parenting** (or Lifestyle)
- Contact email: `info@easemyai.com`
- Privacy Policy URL: `https://<your-domain>/api/legal/privacy`
- Content rating: complete the IARC questionnaire → expected **Everyone**

---

### Notes
- Screenshots to upload live in `/app/store_assets/apple` (8) and `/app/store_assets/google` (8).
- Replace `<your-domain>` with your production domain after you deploy (the legal pages are served by the backend at `/api/legal/privacy` and `/api/legal/terms`).
