# FamilyHome — Product Requirements (living doc)

## Original problem statement
Build a private family super-app: "Cozi + WhatsApp + a completely private Instagram + a permanent
digital family history." Invitation-only Family Circles. Four pillars: ORGANIZE, CONNECT, REMEMBER,
PRESERVE. Signature experience: "Send Some Love ❤️" with animated recipient experiences. Must feel
emotional, premium, warm, family-friendly, usable by grandparents and exciting for kids.

## User choices (v1)
- Priorities: (a) Home Feed + Affection + Family Profiles, (b) Calendar + Chores + Shopping + To-Dos.
- Auth: Email + Password (JWT) + Emergent-managed Google Sign-In.
- AI: deferred to a later phase.
- Visual: modern & premium + bright & playful → "Tactile / Playful LIGHT" coral/botanical theme.
- Demo Sharma Family seeding: enabled.

## Architecture
- Frontend: Expo Router (React Native), react-native-reanimated, react-native-keyboard-controller,
  expo-image, expo-linear-gradient, expo-blur, @gorhom/bottom-sheet, expo-image-picker.
  Theme system (light/dark/system) + custom fonts (Plus Jakarta Sans + Nunito).
- Backend: FastAPI + MongoDB (motor). JWT auth (bcrypt), Emergent Google session exchange,
  Emergent Object Storage for media (`/api/upload`, `/api/files/{path}?token=`).
- All backend routes under `/api`. String UUID ids, `_id` excluded from responses.

## Personas
- Family Admin (creator, full control), Parent, Child/Teen (parent-created profiles), Adult relative.

## Core requirements (static)
- Private, invitation-only families; no public discovery; child-safe.
- Connected modules (calendar → memory, recipe → meal → shopping, chat → affection, tree → timeline).

## Implemented (2026-06)
- Auth: register/login (JWT), Google Sign-In (Emergent), /auth/me, logout, global 401 handler.
- Onboarding: create family / join by code / seed demo "Sharma Family".
- Home dashboard (REDESIGNED 2026-06 → Family Operating System): role-aware Family Dashboard
  (not a social feed). Sections, ordered by persona (parent/child/grandparent): Family header
  (date/greeting/family + search/chat/avatar), Family Status strip (manual availability per
  member — home/work/school/available/busy/travelling/vacation/activity; tap own to set, no
  location), Needs Attention (overdue/due tasks, pending chores, shopping, expiring Vault items,
  upcoming birthday), Today at a Glance (agenda), Family Tasks (All/Mine/Kids filter), Kids &
  Chores (progress + praise/star), Today's Meals, Shopping preview, Coming Up (events+birthdays),
  Family Noticeboard (family chat pinned + last message + unread), Memory of the Day (On This
  Day), Wish List Reminder (nearest birthday, reservation-safe), Important Information (Vault
  expiry summary — no policy numbers), Emergency quick access, Daily Brief (counts), Latest Post
  peek (single, no endless feed), Quick Actions. Powered by one aggregated GET /api/home.
- Family Noticeboard (/notice): anyone posts a note (title, details, optional expiry + pin-to-top,
  urgent flag); owner/parent can edit/delete; expired notes auto-hide; live preview on Home.
- Customize Dashboard (/dashboard/customize): per-user hide / pin-to-top / reorder (up-down) of Home
  cards + Compact view, saved via GET/PUT /api/dashboard/prefs.
- Home chore widgets: kids' chores are tappable on Home to mark done (star celebration).
- Evening Recap: after ~6pm a summary card (events, chores done, love shared) with a
  "Save today's best moment" -> add memory shortcut (uses home.today_summary).
- Edit Profile (/member/edit): update photo, name and phone (email read-only) via
- Noticeboard reactions + replies (/notice/[id]): ❤️/👍/✅/🎉 one-per-member reactions + threaded
  replies; board rows show reaction/reply counts.
- Notice expiry reminders: notes expiring tomorrow appear in Home "Needs Attention" and trigger a
  morning push (native builds).
- Chore streaks: kids[].streak counts consecutive all-chores-done days; badges Rising Star(3)/
  Star Week(7)/On Fire(14)/Legend(30) shown on Home Kids & My-chores cards.
- Event email + calendar invite: POST /api/events emails invited members (Emergent Resend, best-effort)
  with an "Add to your calendar" link to GET /api/events/{id}/invite.ics (public .ics VEVENT).
- Event RSVP: invited members tap Going / Maybe / Can't make it right on a calendar event card
  (POST /api/events/{id}/rsvp; only invited members/owner, else 403); each event shows a live
  "N going · N maybe · N can't make it" summary (rsvp_summary + my_rsvp on hydrate_event).
- Recurring events: an event can repeat Weekly or Monthly, ending after a set number of times OR on a
  chosen date; concrete occurrences share a series_id (monthly clamps short months); deleting asks
  "just this one" (skip one date) or "the whole series"; the emailed .ics carries an RRULE. 🔁 badge.
- RSVP reminders: the host sees who hasn't replied ("Waiting on …") and can send a gentle nudge that
  posts a reminder in the family chat + pushes those members (POST /api/events/{id}/nudge).
- Home Emergency Pin: the Emergency card auto-floats to the top of Home (in a red "Active SOS" or
  "documents expiring soon" state) whenever an SOS is active or a Vault document is expiring.
- Emergency Info shortcut: each member profile has an "Emergency Info 🚑" link to their medical card.
- Medical quick view: the Emergency Center screen shows a "Medical at a Glance" list (each member's
  blood group + allergies, tap for the full card) via GET /api/emergency/medical, for fast access.
- Store compliance (App Store / Play Store): More > Support & Legal adds Help & Support
  (mailto info@easemyai.com), in-app Privacy Policy + Terms of Use (publisher Ease My Ai Pvt Ltd,
  governing law India), and Account & Data with in-app Account Deletion (DELETE /api/auth/account —
  organizer purges the whole family space; member deletes only self). App version shown in More.
  NOTE: stores also require a PUBLIC Privacy Policy URL entered in the listing console.
- Public hostable legal pages: GET /api/legal/privacy & /api/legal/terms serve self-contained HTML
  (no auth) usable as the store-listing Privacy/Terms URLs (prod: https://our-story-191.emergent.host/api/legal/privacy).
- Data export: organizer-only "Export My Data" (More > Account & Data) downloads a full JSON copy of
  the family via GET /api/family/export (credentials stripped); good to run before deleting.
- Medical on SOS: the active SOS banner (and Home urgent card) show the triggering member's blood
  group + allergies for fast responder access (snapshot on trigger + hydrate on read).

## Security posture (audited)
- Family-scoping (family_id filter) enforced across all data endpoints; account delete/export are
  organizer-scoped to the caller's own family only; email invites go only to registered members.
- Fixed (audit iteration_18): SEC-001 /api/register-push now requires auth + binds to caller;
  SEC-002 /api/files/{path} is family-scoped (BOLA); SEC-003 the long-lived JWT is no longer put in
  image URLs on native (expo-image Authorization header; web keeps ?token=); POST /families/members
  is admin/parent-only. Verified by testing agent (13/13 backend + frontend image regression clean).
- Deferred (low risk): CORS allowlist, chat-membership scoping on reactions.
- Batch #21 hardening: login brute-force rate limiting (5/email→10-min lock, 30/IP→5-min, Mongo TTL);
  short-lived media tokens (scope='media', 7d, family-scoped) so the long-lived login JWT never rides
  in a media URL (web/documents/audio) — media tokens are rejected by the API; native images use an
  Authorization header. Verified by testing agent (iteration_19: 13/13 backend + image regression).
- Notifications: More > Preferences > Notifications lets a user turn on phone push (Emergent-managed).
  Requires user to upload Firebase google-services.json to /app/frontend/ and only delivers on a
  real device after Publish + build (app.json android.googleServicesFile wired; EMERGENT_PUSH_KEY
  placeholder is auto-set at deploy — never edit it).
- Security Audit #2 re-hardening: serve_file now also enforces Vault per-item visibility (a member
  can't fetch a parents-only Vault file by direct URL); login lockout is keyed on email+IP with
  X-Forwarded-For (no global-IP lock, can't be used to lock a victim from another network); media
  URLs never fall back to the login token. Verified by testing agent (iteration_20: 17/17 backend +
  image regression clean). Residual low-risk items (CORS wildcard, public .ics by design) documented.
- Notice "Seen by": opening a noticeboard note marks it seen; posters see a "Seen by N" count that
  expands to the list of who viewed it (POST /api/notices/{id}/seen; seen_count on board + Home).
- Trusted Emergency Access: a parent grants an adult relative view-only access to every child's medical
  cards + insurance/documents (revocable anytime) via More > Protect > Emergency Center > Trusted Access
  (GET/POST/DELETE /api/emergency/delegates; delegates can view but not edit children's Vault items).
- Notice photos: attach a photo (permission slip, party flyer) to a noticeboard note; the image
  shows on the board list, the note detail, and the Home noticeboard preview thumbnail (photo_url
  on notices, image picker in create modal).
  PATCH /families/members/{id} + PATCH /auth/profile.
- Feed: photo/text posts, 7 reaction types (toggle), comments, post detail, create post w/ image upload.
- Stories: 24h stories bar + create.
- Affection (signature): Send Some Love (recipient + type + note), full-screen Reanimated animation
  with haptics, received-affection overlay + "Send One Back", Family Hug, Love This Week timeline.
- Family: cover, members grid, member profiles (details, stars, posts), add member (w/ photo).
- Calendar: month grid w/ per-member color dots, agenda, create/delete events, participants.
- Chores: grouped by child, complete/uncomplete, stars leaderboard, add/delete, "Great job" + Send Proud.
- Shopping: multiple lists, items w/ qty, check/uncheck, unchecked-first, add/delete.
- To-Dos: multiple lists, tasks w/ priority + assignee, toggle, add/delete.
- More: navigation hub, invite code, appearance (light/dark/system), logout.
- Demo seed: Sharma family w/ members, posts+reactions+comments, stories, events, chores, shopping,
  to-dos, affection + love timeline, and chat (family group + a direct chat).
- Chat: conversation list w/ unread badges + Chat-tab aggregate badge; family/direct/custom-group
  conversations; text, photo, reply, and affection-in-chat messages; typing indicators; read
  receipts (Sent/Seen/Seen by N); near-real-time via polling; Chat→Affection link (chat love shows
  in Love timeline + recipient overlay); unread_messages surfaced on Home.
- Chat additions: voice notes (tap-and-hold mic, waveform playback via expo-audio; native-only
  recording) + message reactions (long-press picker ❤️😂👍😮😢🎉, toggle, reaction chips w/ counts)
  + pin one message per conversation (pinned bar) + group management (rename, add/remove members —
  custom groups only).
- Our Family Story: family timeline (year groups + category filters), individual member stories
  (from member profile), Add Memory (photos/date/category/people/importance — any member), Memory
  Detail (photo carousel + ❤️ love reaction + written notes/comments + delete), Memory Vault (3-col
  photo grid grouped by year), Family Yearbook (on-screen scrollable per-year cover + memory pages).
  On This Day card on Home + a once-a-day in-app morning reminder banner.
- Family Tree: auto-grouped by generation (grandparents → parents → children) from roles, tap any
  node to open that person's profile/story.
- Birthday Wishes: written wish + emoji, wishes stack on the birthday person's celebration screen
  (opened from Home birthday banner + member profile).
- Group chat cover photo: set/change from the group manage screen; shows in chat list + header.
- Time Capsules: write a message (+ optional photos) to the whole family that stays sealed until a
  future unlock date; locked content is hidden until then; author can delete; push on unlock.
- Weekly Highlights: warm 7-day recap (posts, memories, birthday wishes, love sent, most-active
  member, new memories) — Sunday card on Home + a screen in More.
- Places We've Been: memories grouped by location into a visual grid; tap a place → its memories.
- Family Rewards: per-member ⭐ star points (posts/love/memories/wishes/chores), family 🔥 streak
  (consecutive active days), unlockable badges + a confetti celebration for kids; Home streak chip.
- Family Albums: shared photo albums; creator-only photo adds; grid + detail + create.
- Memory Search: instant search on Our Family Story by title, place or person.
- Star of the Week (Weekly Winner): most stars earned in the last 7 days wins (posts/love/
  memories/wishes + child chore completions count 8⭐ each); 👑 crown card on Rewards, a
  Star of the Week card on Weekly Highlights, and week_leaderboard exposed via /api/rewards.
- Search Everywhere: global search screen (Home header search icon) across people, memories,
  posts and chats (case-insensitive, scoped to the caller's family) via GET /api/search?q=.
- Meal Planner + Recipes: save family recipes (title, photo, ingredients, prep time) and assign
  them to Breakfast/Lunch/Dinner slots across a Mon–Sun week (week switcher). One tap "Add to
  Shopping" aggregates every planned recipe's ingredients into a de-duped "Meal Plan 🍽️"
  shopping list (idempotent). More > Recipes + More > Meal Planner.
- Wish Lists & Gift Planning (CELEBRATE & WISH pillar): every member has "My Wishlist" + a shared
  "Family Wishlist"; items carry photo, product link, price, store, size, colour, notes, priority
  (1–3), occasion, category and per-item visibility (Family / Parents / Grandparents / Selected).
  Secret Gift Mode: adults privately reserve ("I'm Getting This 🎁") to avoid duplicate gifts —
  reservation + buyer are hidden from the wish owner/children unless revealed, while other adults
  see who reserved; statuses Wished/Reserved/Purchased/Received; private adult-only gift-planning
  notes per item. Linked from the birthday screen. More reorganized into 6 pillars (Connect /
  Organize / Remember / Preserve / Celebrate & Wish / Protect); Family Vault + Emergency Center
  are "Soon" placeholders (Phases B & C).
- Family Vault (PROTECT): a PIN/biometric-locked area (expo-local-authentication + 4-digit PIN via
  VaultGate; 3-min unlock session) for insurance policies & important documents in folders
  (Insurance/Documents/Home/Vehicles/Travel). Items carry issue/expiry dates, tags, notes, photo +
  PDF attachments (private token-gated storage) and per-item visibility (family/parents/
  grandparents/selected). Upcoming Expiries view (30/60/90/6mo) + a daily push reminder to parents
  30 days before expiry. More > Protect > Family Vault.
- Emergency Center (PROTECT): quick-access hub with a big Family SOS button (best-effort location
  share + posts "🚨 FAMILY SOS" into the family chat + push), emergency contacts & SOS numbers
  (⭐Critical pinned, big Call/WhatsApp buttons), emergency instructions (expandable steps), a
  Family Emergency Plan (parents edit; last-reviewed), and per-member Medical Cards (blood group,
  allergies, doctor, insurance…). More > Protect > Emergency Center. Birthday screens surface a
  member's top wishes inline.
- Push notifications (Emergent-managed relay): device token registration (native), morning "On This
  Day" reminder + capsule-unlock reminder (daily 08:00 UTC loop, deduped) + new-message push +
  birthday-wish push. Requires user to add Firebase google-services.json and Publish+build to work;
  EMERGENT_PUSH_KEY is a deploy-injected placeholder.
- Tested: 32/32 (v1) + 13/13 (chat) + 11/11 (story+reactions+voice) + 11/11 (pin+group+push)
  + 10/10 (tree+birthday+memory-reactions+group-photo) + 11/11 (capsules+highlights+places)
  + 17/17 (rewards+albums+search) + 10/10 (weekly-winner+search-everywhere)
  + 13/13 (meal-planner+recipes) + 16/16 (wish-lists+secret-gift-mode)
  + 18/18 (family-vault+emergency-center) backend tests pass; frontend flows verified.
- Google Sign-In: verified against the current Emergent Google Auth playbook (web redirect +
  hash/query session_id parse; native WebBrowser + Linking cold/hot handlers; backend
  /auth/session exchanges session_id via X-Session-ID and mints the app JWT). Real OAuth can't
  be automated; email/password is the automated test path.

## Backlog (prioritized)
### P0 (next) — PROTECT follow-ups & polish (Phases A/B/C shipped)
- Emergency Access delegation (item 83): DONE (Batch #16) — parents grant an adult relative view-only
  access to all children's medical + Vault insurance/documents via Emergency Center > Trusted Access.
- Cross-app hooks (item 84): Profile → Emergency Info shortcut; Timeline milestone → linked Vault
  doc; auto "Emergency" pin on Home.
- Vault hardening (optional): access/audit logs, re-auth before opening a single sensitive doc.
### P1
- Birthdays: scheduled wishes. Recurring events DONE (Batch #16); external calendar sync (beyond .ics).
  Notifications center.
### P2
- Future Letters. AI: event import (screenshot/paste), recipe creator, memory assistant, timeline suggestions.
- Admin panel (roles/permissions/devices), accessibility polish.
### Refactor (tech debt)
- server.py is ~3.7k lines — consider splitting into routers (vault, emergency, wishlists, chat, …).


## App Store Screenshots (marketing assets) — June 2026
- Generated polished, marketing-style store screenshots from the REAL app (Sharma demo family, clean data).
- 8 screens each for Apple (1290×2796) and Google Play (1080×1920): Home, Calendar/RSVP, Family, Chores & Stars, Family Chat, Emergency/SOS, Rewards, Our Family Story.
- Style: dark device frame + on-brand warm gradient + benefit-led caption (no emoji in captions; text-only for clean rendering).
- Output: `/app/store_assets/apple`, `/app/store_assets/google`, raw captures in `/app/store_assets/raw`, docs in `/app/store_assets/README.md`.
- Tooling: `scripts/capture_screens.py` + `scripts/capture_chat_fresh.py` (Playwright captures) and `scripts/compose.py` (PIL compositor).
- No sensitive data exposed (fictional demo family only). Chat captured from a fresh seeded account to avoid TEST_SOS demo noise.



## Sign in with Apple (App Store blocker fix) — June 2026
- Added Sign in with Apple (iOS) alongside Google login to satisfy Apple guideline 5.1.1(v).
- Backend: `POST /api/auth/apple` verifies the Apple identity token against Apple JWKS (RS256, issuer + audience + expiry), upserts a user keyed on `apple_sub`, and issues the app JWT (same as login). Audiences default to bundle id `com.emergent.ourstory.ff6oeh` + `host.exp.Exponent` (`APPLE_AUDIENCES` env). Email index made sparse-unique; `apple_sub` sparse-unique index added.
- Token revocation on account deletion wired best-effort in `DELETE /api/auth/account` (`_apple_revoke_user`) — activates once Apple creds are provided as backend env: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (.p8 contents), `APPLE_CLIENT_ID`. Without creds it logs & skips (sign-in still works).
- Frontend: `loginWithApple` in `AuthContext`; reusable `src/components/AppleSignInButton.tsx` (native Apple button, iOS + `isAvailableAsync` only) added to Welcome/Login/Register. `expo-apple-authentication` installed + added to `app.json` plugins; `ios.usesAppleSignIn: true`.
- Export compliance: `ios.config.usesNonExemptEncryption: false` set in `app.json`.
- CAVEAT: Apple button + full sign-in flow are iOS-native only — NOT testable in web preview / Expo Go web. Must be validated on a real iOS build. Backend verified: invalid token -> 401; existing register/login/me unaffected (no regression).


## Store launch prep — listing copy, data-safety, Apple linking, readiness re-run — June 2026
- Apple ID account-linking: `POST /api/auth/apple/link` (authed) attaches `apple_sub` to the current user (409 if already linked elsewhere); `public_user` now returns `apple_linked`. Frontend `linkWithApple` in AuthContext; Account & Data screen shows a "SIGN-IN METHODS" section (iOS only) with a native "Continue with Apple" link button, or an "Apple ID linked ✓" row. Verified: link endpoint 401 unauth / 401 authed+bad token; `/auth/me` returns `apple_linked`; account screen renders (iOS-only section hidden on web).
- Store listing copy: `/app/store_assets/store_listing.md` (App Store name/subtitle/keywords/promo/description + Google Play title/short/full + console fields).
- Data-safety answers: `/app/store_assets/app_privacy_data_safety.md` (Apple App Privacy + Google Play Data safety, derived from in-app privacy policy; no ads/tracking, account-linked, deletion available).
- Readiness re-run (App Store): 0 blockers, 0 warnings — SIWA + export-compliance resolved; remaining items are manual (device test, Apple revocation creds, Connect forms).


## Security Audit #3 + remediation — June 2026
- Audit verdict: CONDITIONAL PASS. One HIGH (in the new Apple sign-in), rest P3.
- SEC-001 (HIGH) FIXED — Apple sign-in account takeover: `/auth/apple` no longer trusts the client-supplied email and no longer auto-links `apple_sub` to an existing email account. Now uses ONLY the token's verified email (`email_verified` true); if that email already belongs to another account, returns 409 directing the user to sign in with their original method and link Apple in Settings (the authenticated `/auth/apple/link` flow). RS256 + issuer + audience already pinned.
- P3 FIXED — `PATCH /families/members/{id}` now enforces self-or-(admin/parent) authorization (mirrors member-status endpoint).
- P3 FIXED — `/auth/session` (Google) now persists newly-created users (`insert_one`) so first-time Google sign-in works.
- P3 ACCEPTED (not changed, low risk, bearer-token app): CORS `allow_origins=["*"]` + `allow_credentials=True`; login throttle keyed on left-most X-Forwarded-For (spoofable) — bcrypt cost still limits guessing.
- Verified: apple bad-token+victim-email -> 401 (no takeover); login/`auth/me` 200; self member edit 200. Audit ran against codebase/preview (no production access — user must Publish to deploy fixes).


## 13-inch iPad store screenshots — June 2026
- Generated 8 polished marketing screenshots for the App Store 13-inch iPad slot at 2048×2732: Home, Calendar/RSVP, Family, Chores, Family Chat, Emergency/SOS, Rewards, Timeline.
- Captured the app at iPad viewport (1024×1366 @2x) — layout adapts cleanly (4-col members, full-width cards). Chat re-captured from a fresh seeded account with a fuller family thread to avoid empty whitespace on the tall screen.
- Output: `/app/store_assets/ipad13/` (framed) and `/app/store_assets/raw_ipad/` (raw). Tooling: `scripts/capture_ipad.py`, `scripts/capture_ipad_chat.py`, `scripts/compose_ipad.py`. README updated.


## Bug fix: invite code missing — June 2026
- Root cause: the `@api.get("/families/invite")` route decorator was accidentally clobbered when the public legal pages were inserted before `get_invite`, so the endpoint 404'd. The More tab fetch failed silently (`invite` stayed null) → the "Invite Family" section never rendered.
- Fix: restored the decorator; `get_invite` now self-heals a missing `invite_code` (backfills for demo/legacy families). Verified: `GET /api/families/invite` → 200 `{invite_code, family_name}`.
- UX: moved the Invite Family card to the TOP of More (right under the profile) and made it tappable — opens the native Share sheet with an invite message (falls back to a toast with the code on web). Files: `backend/server.py`, `frontend/app/(tabs)/more.tsx`. Lint clean; screenshot-confirmed.
- NOTE: fix is in preview only — user must Publish/redeploy to reach production.


## Members: Joined/Pending + Admin add/remove + shareable invite link/WhatsApp — June 2026
- Joined vs Pending: GET /api/families/me now tags each member `joined` (true iff a linked account
  exists) + `is_me`, and returns `can_manage`/`viewer_role`/`viewer_member_id`. Family tab shows a
  green "Joined" pill or amber "Pending" pill under every member so invites are visibly tracked.
- Admin add/remove: admins/parents see "Manage" + "+ Add" on the Family tab. Manage mode puts a red ✕
  on removable members (never on yourself or the admin) → confirm modal → DELETE /api/families/members/{id}
  (admin/parent only; self=400, admin target=403; a joined member is unlinked (users.family_id=None,
  must re-join) and pending members are just deleted).
- Shareable invite link: `src/lib/invite.ts` builds Linking.createURL("/join",{invite:CODE}); the new
  `app/join.tsx` route + AuthContext both capture `?invite=` into storage, and onboarding/create-family
  pre-fills Join mode with the code. Web-safe share (Web Share API/clipboard fallback; RN Share.share
  throws in the browser).
- WhatsApp: the Add-member success screen offers "Invite via WhatsApp" (whatsapp:// → wa.me → share
  fallback) + "Share invite link". `LSApplicationQueriesSchemes:["whatsapp"]` added to iOS infoPlist.
- CAVEAT: deep-link auto-fill of the code + the actual WhatsApp launch are native-only (not testable in
  web/Expo Go). Verified: backend 7/7 pytest (join/pending/remove/authorization); frontend flows
  (badges, Manage remove modal 5→4, add success screen) screenshot-verified. Preview only — Publish to ship.


## Members follow-ups: auto-link invites + role editing + resend invite — June 2026- Auto-link invites (no duplicates): GET /api/families/preview?code= returns the family name + its
  PENDING profiles; POST /api/families/join now takes an optional claim_member_id that links the joiner
  to that pending profile instead of creating a second member. Onboarding Join is a 2-step flow — enter
  code → Continue → "Which one is you?" (pick a pending profile or "I'm a new member") → Join. Deep-link
  invites auto-fill the code and jump straight to the claim step.
- Role editing from the Family tab: MemberPatch gained `role`; PATCH /api/families/members/{id} role is
  admin/parent-only, limited to parent/child/adult, protects the admin's role, and keeps is_child in
  sync. Family tab → Manage → tap a non-admin member's "…" badge → actions modal with a Parent/Child/
  Adult segmented control.
- Resend invite: the same member actions modal shows "Invite via WhatsApp" + "Share invite link" for
  PENDING members (reuses the family invite code, web-safe share). Remove is also in the modal (confirm).
- Verified: backend 13/13 pytest (preview/claim/role guards); frontend 100% (claim = no duplicate joiner
  becomes the claimed profile; role change persists; resend hidden for joined members). Preview only —
  Publish to ship.


## Accessibility & Readability — Phase 1 (foundations) — June 2026
User mandate: accessibility/readability/simplicity are core "definition of done" (parents, grandparents,
teens, young kids, low-vision users). Kids Mode / Grandparent Mode deferred to a later phase.
- New "Accessibility & Display" screen (More > Preferences → /settings/accessibility): Text Size
  (Default 1x / Large 1.2x / Extra Large 1.45x), High Contrast, Larger Buttons, Reduce Motion, and
  "Show Text With Icons". Prefs persist per-key in storage, exposed via useTheme().
- Global text scaling: AppText multiplies size by textScale (system Dynamic Type still applies via
  default allowFontScaling). App-wide enlargement + reflow verified.
- Buttons: min-height 48 (56 in Larger Buttons mode) + accessibilityRole/label/state.
- High-contrast palette (tokens.contrastColors) strengthens text/borders in light & dark.
- Reduce Motion wired into the Send Love animation (skips particles + spring bounce; defaults to the
  phone's Reduce Motion setting, user-overridable).
- Friendlier login errors on 401/429.
- Verified: testing agent iteration_23 — 8/8 pass (settings, persistence, contrast, regression at
  Default & Extra Large on Home/Family/Calendar/Chat/Send Love, friendly login error, reduce-motion
  Send Love). Frontend-only; preview — Publish to ship.
- PENDING later phases: (2) screen-reader label + contrast/touch-target audit across all core flows;
  (3) Kids Mode & Grandparent (Simplified) Mode; (4) localization-readiness string extraction.


## Accessibility — Phase 2 + Kids Mode + Grandparent Mode — June 2026
- A11y Phase 2: screen-reader labels (accessibilityRole/label/state) added to icon-only controls across
  Home header, tab bar (selected + unread), Emergency (SOS/call/back), Chat (send/mic/attach/back),
  Calendar (month nav/add FAB), Vault (back/lock/add), Chores (back/add/checkbox/delete).
- Grandparent "Simple Home": opt-in toggle in Accessibility (HOME LAYOUT). When ON, Home renders a
  large-button 6-tile grid: Family Calendar, Messages, Send Love, Memories, Birthdays, Emergency.
- Kids Mode: when the logged-in user's member is a child (is_child || role==='child'), Home renders a
  friendly KidsHome (greeting, Today, My Chores with big check toggles, Quick Actions: Hug parents /
  Send Love / Family Chat / My Wishlist). The bottom tab bar hides the 'More' tab (admin) for child
  accounts. persona detection via src/lib/dashboard.personaOf.
- Verified: testing agent iteration_24 — 4/4 pass (Grandparent grid + navigation + toggle-off restore;
  Kids Mode via join+claim child profile, More tab hidden, chore toggle + StarBurst; a11y labels;
  adult regression). Frontend-only; preview — Publish to ship.
- Still pending later: Phase 4 localization-readiness string extraction.


## Security Audit #4 remediation — June 2026
Read-only audit of the current codebase (production host not reachable by tooling — fixes reach prod
after Publish). New invite/member/role lifecycle passed the audit. Fixes applied in backend/server.py:
- SEC-001 (MEDIUM, BOLA): every shopping_items & todo_items find/update/delete + list-delete cascade is
  now scoped by family_id — cross-family toggle/read returns 404 and cross-family delete is a no-op.
- SEC-002 (MEDIUM, invite preview): invite codes are now 10 hex chars (new_invite_code); GET
  /families/preview drops children's photo_url and is rate-limited per user (20 / 10 min -> 429).
- CORS hardening (LOW): allow_credentials=False (app uses Authorization: Bearer, not cookies).
- Verified: testing agent iteration_25 — 7/7 (BOLA shopping+todo blocked, same-family CRUD OK, invite
  preview child-photo hidden + 429 throttle, join+claim intact, auth 200/401). New pytest suite:
  backend/tests/test_bola_shopping_todo_invite.py. Preview only — Publish to ship to production.


## Responsive layout & alignment pass (Batch #27) — June 2026
Mandate: full responsive-layout / font-alignment / text-wrapping / mobile-UI audit across the app for
small/standard/large Android + iPhones (layout-only; no functionality changes; Dynamic Type preserved).
- Anti-patterns fixed: VaultGate PIN keypad (was fixed width 300 -> overflowed 320px) now width 100% /
  maxWidth 340 with 30% keys; PostCard, post/[id].tsx and AffectionAnimation switched from module-level
  Dimensions.get to useWindowDimensions (resize-safe images/particles); important titles now wrap to 2
  lines (Home needs-attention + Today event, Vault folder/expiry names, Calendar "waiting on").
- Verified: testing agent iteration_26 — FULL multi-width audit PASS. 3 widths (320/390/430) x ~18
  screens = 54+ measurements, ALL pass (0 horizontal document overflow, 0 ellipsis-clipped important
  text). Vault PIN fits at 320. Family/Quick Actions/Emergency/Vault grids fit at 320. Extra Large text
  (1.45x) on Home/Calendar/Family/More at 320/390: 0 overflow, text wraps as expected, header icons stay
  on-row, tab labels single-line. No fixes required. Frontend-only; preview — Publish to ship.
