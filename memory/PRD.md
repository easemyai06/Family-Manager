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


## Security Audit #5 remediation — June 2026
Read-only audit (codebase/preview; production not reachable by tooling — Publish to deploy). Verdict:
CONDITIONAL PASS — no Critical/High; strong family_id tenant isolation throughout. Fixes applied
(user chose to fix SEC-001 + SEC-003; SEC-002 deferred):
- SEC-001 (MEDIUM) FIXED — medical cards over-exposed: GET /api/emergency/medical/{id} now gates the
  DETAILED fields (medication/conditions/doctor/hospital/insurance_provider/policy_reference/
  emergency_contact) to self, parents/admin, and a trusted emergency delegate (for children they
  cover). Blood group + allergies stay family-visible for the emergency "Medical at a Glance". Response
  carries can_view_detail + detail_restricted; the /emergency/medical LIST endpoint was already
  summary-only. Frontend medical screen shows a "detailed info is private" note when restricted.
  Helper _can_view_medical_detail (server.py) mirrors the Vault delegate context via _secure_viewer.
- SEC-003 (LOW) FIXED — POST /families/members now allowlists role to parent|child|adult (rejects
  'admin'/unknown with 400), preventing a claimed pending profile from gaining organizer power.
- SEC-002 (LOW) DEFERRED per user — login throttle keys on left-most X-Forwarded-For (spoofable);
  bcrypt + dummy-hash still limit guessing. To revisit with correct proxy hop depth later.
- Verified via curl: admin sees full card (no regression); non-parent adult viewer gets summary-only
  (detail_restricted true); self sees own detail; add-member role admin/superuser -> 400, child -> 200.
  Preview only — Publish to ship to production.


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

## Feature Batch #28 — Auth+ / Chat / Notifications (June 2026)
User asks (all delivered): forgot-password by email code; PIN login (adult quick-unlock + kids pick-a-name);
parent/admin manage child logins (username + password + PIN, no email) incl. reset; simplify chat to ONE
common Family Chat opened directly from the Chat tab; deferred login-throttle hardening; a Notifications
Center inbox of recent family activity.
- Forgot password: POST /auth/forgot-password (always 200, rate-limited, no existence leak) emails a
  6-digit code (Emergent Resend), bcrypt-hashed in password_resets, 15-min expiry, <5 attempts.
  POST /auth/reset-password verifies + sets new password (min 6) and returns a login token. Screens:
  frontend/app/(auth)/forgot.tsx + link on login.
- PIN login: POST /auth/pin (set), DELETE /auth/pin (clear), POST /auth/pin-login {user_id|member_id, pin}
  (strict throttle pin:{subj}:{ip}). /auth/me now returns pin_set + family_chat_id. Device caches the
  account (REMEMBER_KEY) + roster of PIN-enabled members (ROSTER_KEY). Screens: (auth)/pin.tsx (pick-a-face
  + 4-digit pad), Account > QUICK SIGN-IN sets/changes/removes a 4-digit PIN.
- Login accepts email OR username. Child credentials: POST /families/members/{id}/credentials (parent/admin
  only; cannot target admin) creates a provider=child user (no email) linked to the member and sets
  username+password+PIN; also used to reset. /families/me members carry has_login/has_pin/username.
  Screen: member/credentials.tsx (modal) reached from Family tab member actions.
  NOTE: child-user insert intentionally OMITS the email field (not email:null) so it doesn't collide on
  the sparse-unique users.email index (was a DuplicateKeyError 500 on the 2nd child — fixed & retested).
- Chat simplified to a single Family Chat: TabBar intercepts the Chat tabPress and opens
  /chat/{familyChatId} directly; DMs/groups + new-chat UI removed; (tabs)/chat.tsx is a safety-net redirect;
  Home Message quick action, KidsHome and SimpleHome all open the family chat directly. Chat unread badge
  still shows on the tab.
- Notifications Center: GET /notifications (activity from OTHERS + upcoming birthdays), POST
  /notifications/read (sets notifications_last_read), GET /notifications/unread (badge). Screen:
  app/notifications.tsx opened from a Home header bell (replaced the redundant chat icon).
- SEC-002 hardening: _client_ip counts TRUSTED_PROXY_HOPS (default 1) from the RIGHT of X-Forwarded-For.
- Verified: testing agent iteration_27 — backend 14/14 pytest
  (backend/tests/test_batch28_forgot_pin_child_notif.py), frontend 5/5 flows. Preview only — Publish to ship.

## Security Audit #6 remediation — June 2026
Read-only audit (codebase/preview; production not reachable by tooling — Publish to deploy) focused on
the Batch #28 auth additions. Verdict: one HIGH fixed; everything else PASS.
- SEC-001 (HIGH) FIXED — account takeover via member-credentials: POST /families/members/{id}/credentials
  previously blocked only the 'admin' target, so a parent/admin could overwrite ANOTHER adult member's
  self-owned (email/Google/Apple) login and impersonate them. Fix: when the target already has a linked
  user, only allow the reset if that user's provider == "child" (parent-managed); otherwise 403
  ("This member signed in with their own account…"). /families/me now returns a `manage_login` flag
  (true only for non-admin members that are unlinked or child-provider) and the Family member-actions UI
  only shows "Set up / Reset login & PIN" when manage_login is true.
- Confirmed SAFE by the audit (no change needed): PIN login (DUMMY_BCRYPT_HASH + uniform "Incorrect PIN",
  no enumeration; member_id path authenticates as the linked user, no cross-family abuse; throttle
  pin:{subj}:{ip}); forgot/reset (always-200, bcrypt-hashed code, 15-min expiry, <5 attempts, single-use,
  per-IP verify throttle); login identifier+IP throttle; _client_ip right-of-XFF not trivially spoofable;
  notifications strictly family-scoped; medical-detail gating, add-member no-'admin', per-item family_id
  scoping, media/API token separation, invite child-photo hiding all still enforced.
- Accepted low-risk: 4-digit PIN with strict throttling (UUID prerequisite); CORS '*' + credentials off
  for a Bearer app.
- Verified via curl: child login create+reset 200/200; self-owned adult manage_login=false and admin reset
  -> 403. Preview only — Publish to ship to production.

## Feature Batch #29 — Chat retention / file & location sharing / Storage cleanup / Date pickers (June 2026)
User asks (all delivered): (1) family-wide chat auto-deletion with Off/24h/7d/30d/90d; (2) share files
(PDF/PPT/Word/Excel/docs) + share live location in chat; (3) two clearly-labelled cleanup options
(free phone space + clear family chat data); (4) tap-to-pick date/time for events; (5) birthday picker;
(6) show dates as dd-mm-yyyy across the app.
- Disappearing messages: PATCH /api/chats/{id}/retention {days:1|7|30|90|null}, parents/admin only (403
  else); _purge_expired_messages runs on GET/POST /messages (deletes old messages + their media +
  reactions). Chat header "⋮" (chat-options-btn) -> settings sheet with retention chips
  (retention-opt-0/1/7/30/90); a "Messages disappear after …" banner (retention-bar) shows when on;
  non-parents see chips disabled.
- Chat sharing: input "＋" (chat-attach-btn) sheet = Photo / File / Send location / Share live (15 min).
  Files via expo-document-picker -> uploadDocument -> POST message {type:'file', file_name/size/mime};
  file bubbles (file-<id>) show icon+size, tap opens token-gated /api/files URL. Location via
  expo-location (contextual permission -> request -> Open Settings if blocked); one-time type=location
  + live type=live_location (live_until=+15min) with foreground watchPositionAsync -> PATCH
  /chats/{id}/messages/{mid}/location; own active share shows "Stop sharing" (POST .../stop-live).
  Location bubbles (loc-<id>) show a static OSM map + "Open in Maps". NATIVE-ONLY: real geolocation +
  document open.
- Storage & Cleanup (More > Preferences > /settings/storage): GET /api/storage/usage stats; Option A
  "Clear downloaded files" clears expo-file-system cache/document dirs (device-only, everyone; web note);
  Option B "Clear family chat data" parents-only -> chips (90/30/7/all) for chat_media (strip
  attachments) or chat_history (delete messages) -> confirm modal -> POST /api/storage/cleanup.
- Date pickers: new src/components/ui/DateTimeField.tsx (DateField calendar + TimeField). Event create
  uses them (event-date/start-time-input/end-time-input/repeat-until); Edit Profile birthday uses
  DateField (edit-birthday, maxToday). All show DD-MM-YYYY. formatDMY applied across vault expiries,
  timeline, member birthday, highlights, capsules, search; relative labels + week/month range headers
  kept as-is.
- Verified: testing agent iteration_28 — backend 11/11 pytest
  (backend/tests/test_batch29_chat_retention_location_files_storage.py); frontend live-verified (attach
  sheet, retention banner on/off, location/file/live bubbles render). Fixed a crash: settings/storage.tsx
  used shadow(4) (helper only supports 1|2|3) -> shadow(3). Main agent re-smoked Storage screen (stats +
  both cleanup sections render) and Event date/time pickers (calendar opens, dd-mm-yyyy). Preview only —
  Publish to ship.

## Batch #29b — Follow-up delights (June 2026)
- File Gallery: GET /api/chats/{id}/media {photos[],files[]} (family-scoped). New screen /chat/gallery
  (from chat ⋮ > "Shared files & photos", settings-gallery) with Photos/Files tabs
  (gallery-tab-photos/files), 3-col photo grid + tap lightbox, file rows (fileIcon+size+sender+dd-mm-yyyy).
  Verified: demo shows Files (1) batch29_test.pdf.
- Birthday Countdown: time.ts daysUntilBirthday/birthdayCountdown; Family tab shows "🎂 in X days" badge
  (bday-<member_id>) when a member's birthday is within 30 days. Verified: Aarav "🎂 in 2 days".
- Location Preview: live_location bubbles now show a "LIVE" chip (red pulse dot) over the map + "Updated
  <ago> · until <time>"; static OSM map refreshes as coords PATCH in. Native geolocation only.
- Auto Cleanup Reminder: /api/home returns storage_hint (parents only) when family messages>=800 or
  media_files>=120; Home shows a dismissible (once/day) card (storage-nudge) -> /settings/storage.
  Verified: endpoint returns key (null below threshold on demo).

## Batch #29c — More delights (June 2026)
- Storage Breakdown: GET /api/storage/breakdown -> per-month {month,label,messages,media} (aggregate,
  last 24 months). Storage screen shows "WHERE YOUR SPACE GOES" with a bar per month. Verified: "August
  2026 · 12 msg · 1 media".
- Birthday Reminders: Home shows a dismissible (once/day/member) pink card (bday-nudge) for the nearest
  member with a birthday within 7 days + "Send a wish" button (bday-nudge-wish) -> /affection/send?member=.
  Uses home.upcoming_birthdays. Verified: "Aarav's birthday is in 2 days".
- Photo Save: chat gallery lightbox now has a Save button (gallery-lightbox-save) — downloads via
  expo-file-system then expo-media-library.saveToLibraryAsync with permission flow; web shows a note.
  Installed expo-media-library@18.2.1 + app.json plugin + NSPhotoLibraryAddUsageDescription. Native/device
  only for the actual save. Gallery verified loading with the new import (no web bundle break).
- Location Snapshot: ended live-location bubble now reads "Last known location" and keeps the last map
  pin + "Shared until <time> · tap to open in Maps" (frontend polish; native geolocation to create).

## Batch #30 — TRUSTED HELPERS (Phase 1) (June 2026)
A separate, restricted, role-based user type for non-family helpers (nanny, cook, driver, elder
caretaker, tutor, pet caretaker, nurse, babysitter, temporary, custom + house help). Helpers are NOT
family members — they never appear in Tree/Timeline/Memories and get least-privilege access.
- Auth (separate principal): account_type='helper' JWT (tv token_version + jti). Login via invite code
  (helper sets own PIN) OR parent-set username+PIN. bcrypt PIN, throttle key helper:username:ip.
  get_current_helper validates account_type+family+status+tv+live session+access-window per request;
  get_current_user rejects helper tokens and vice-versa. Sessions in db.helper_sessions enable
  Pause / Remove(instant revoke) / Sign-out-all.
- RBAC enforced on backend (not just UI). 12 permission keys + 11 role templates (/api/helpers/roles).
  Access window: date-range/temporary hard-expire; working days/hours are soft (UI hint only).
  Child-level scoping via assigned_member_ids (assigned Aarav != Anaya).
- Parent endpoints (admin/parent only): POST/GET/PATCH/DELETE /api/helpers, pause/resume,
  regenerate-invite, reset-pin, sessions, signout-all, audit, tasks (create/list), /helper-tasks/{id}
  patch/delete, /helpers/{id}/activity. Helper endpoints: /helper/activate, /helper/login, /helper/me,
  /helper/dashboard, /helper/tasks, /helper/tasks/{id}/start|complete|issue, /helper/upload (proof),
  /helper/signout. Tasks support schedule once/daily/weekly/monthly, due_time, category, for_member,
  priority, require_proof(photo/note/confirm). /api/home returns helpers_today[] for parents.
- Frontend: Welcome > "I'm a trusted helper" -> /helper-login (sign in / activate). Separate helperApi
  token (secureStore key helper_token), never mixed with family auth; root _layout guard allows
  helper-login/helper-portal/helper-join without a family user. Accessible Helper Dashboard
  (/helper-portal): Today's Work, task cards with Start / Mark done (photo/note proof) / Need help
  (reason + note). Parent side: Family tab "Trusted Helpers" section (add-helper-cta) + Add Helper
  wizard (/helper/add: role grid, who they help, access period + working days/hours, per-permission
  Allow/Deny, invite vs direct login) + Helper detail (/helper/[id]: access summary, assigned members,
  set login/regenerate invite, tasks + Assign modal, activity feed, devices + sign out all,
  pause/resume/remove).
- Verified: testing agent iteration — BACKEND 24/24 pytest
  (backend/tests/test_batch30_trusted_helpers.py) incl. all security boundaries (helper<->family token
  rejection, lifecycle revocation, proof enforcement, child scoping); FRONTEND helper login->dashboard
  + parent add/assign flows pass. Main agent curl-verified full lifecycle earlier. Demo helper:
  username 'sunita' PIN '1234' (Nanny, Aarav, 3 daily tasks). Preview only — Publish to ship.
- PENDING (Phase 2/3, per user-approved phasing): Parent<->Helper chat + Care Team chat, Handover
  Notes, Pickup/Drop live status, selective Emergency/Medical sharing, Location permission modes,
  device/session detail polish, in-app helper notifications feed, "Helpers Today" Home card UI,
  generic task "Assign To: Family member OR Helper". (English only; no multilingual.)

## Batch #31 — TRUSTED HELPERS Phase 2 (Chat / Handover / Pickup-Drop) (June 2026)
Follow-on to Phase 1. Three parent-approved features, all backend-authorized (never UI-only):
- Private Parent↔Helper Chat: brand-new `db.helper_messages` collection, COMPLETELY separate from the
  single common Family Chat (db.messages/db.chats) — a helper can never see family chat/history.
  Parent: GET/POST /api/helpers/{id}/chat (parent/admin manager). Helper: GET/POST /api/helper/chat
  gated by require_helper_permission('chat') (no-chat-perm helper → 403). Unread surfaced on
  /api/helpers list + /api/helpers/{id} (helper→parent) and /helper/dashboard (parent→helper, +can_chat).
- Handover Notes: `db.helper_handovers` daily log (by parent|helper, date, author, text). Parent
  GET/POST /api/helpers/{id}/handover; helper GET/POST /api/helper/handover (any active helper, no
  special perm). dashboard.handover_today = # of today's parent notes.
- Pickup & Drop live status: HelperTaskIn/Patch gained pickup_from/pickup_to. POST
  /api/helper/tasks/{id}/trip {stage: en_route|picked_up|reached} writes trip.{started_at,
  picked_up_at,reached_at,status} into helper_task_completions; 'reached' also completes the task.
  Each stage fires a parent notification.
- Notifications: _notify_parents_helper now also writes `db.helper_events`; _gather_notifications
  includes type='helper' items ONLY for admin/parent viewers (route /helper/{id}). Chat msgs, handover
  replies, trip stages and needs/issues all surface in the family Notifications Center for parents.
- Frontend: shared HelperChatView + HelperHandoverView components. Parent: /helper/[id] gains Chat
  (helper-chat-btn, unread badge) + Handover (helper-handover-btn); Assign-task modal shows Pick up
  from/Drop to when category=pickup; pickup rows show route + live trip badge; Family tab helper card
  shows unread-chat badge. Helper portal: Chat (portal-chat-btn, if can_chat) + Handover
  (portal-handover-btn, dot when parent note today) nav; pickup tasks show a trip stepper
  (Start Trip → Child Picked Up → Reached Home). New routes: helper/chat, helper/handover,
  helper-portal/chat, helper-portal/handover.
- Verified: testing agent Batch #31 — BACKEND 21/21 pytest
  (backend/tests/test_batch31_trusted_helpers_phase2.py) incl. chat isolation, no-chat-perm 403,
  cross-token 401 boundaries, chat/handover round-trips + unread counters, trip flow + completion,
  helper-events gated to parents, paused/removed lifecycle blocks. FRONTEND helper portal + parent
  flows pass. Demo helper Sunita (username sunita / PIN 1234) has a pickup task Delhi Public School →
  Home + seeded chat/handover. Preview only — Publish to ship to production.
- PENDING (Phase 3, per user-approved phasing): Care Team chat, selective Emergency/Medical sharing,
  live-GPS pickup map (permissions already wired), device/session detail polish. (English only.)

## Batch #32 — TRUSTED HELPERS Phase 3 (Care Team / Live Pickup Map / Medical / Ratings) (June 2026)
User-selected follow-ups; user choices: one family Care Team (all active helpers + parents);
medical fields = allergies+blood group+doctor+emergency contact (view-only, NO insurance/policy/
meds/conditions); medical only when the 'medical' permission is granted; ratings = daily 👍/👎 + note;
live GPS only during an active pickup trip (device build needed to actually move).
- Care Team group chat: new `db.care_team_messages` (family-scoped group, per-reader read_by[]),
  isolated from Family Chat AND from the 1:1 helper chat. Parent GET/POST /api/care-team/chat (+roster
  +me/my_type), GET /api/care-team/unread. Helper GET/POST /api/helper/care-team gated by chat perm.
  Shared component CareTeamChatView. Parent entry: Family tab "Care Team Chat" card (care-team-cta,
  unread badge) when >=1 active helper. Helper entry: portal Care Team button (portal-careteam-btn).
- Live Pickup Map: POST /api/helper/tasks/{id}/location {lat,lng} writes trip.lat/lng/loc_updated_at
  (400 before Start Trip). Helper portal pickup task shows a "Share live location" toggle (trip-live-*)
  while trip is en_route/picked_up (expo-location watchPositionAsync on native; web posts one point;
  auto-stops on Reached Home). Parent /helper/[id] pickup row shows a static OSM map (trip-map-*) +
  "Live · updated Xm ago" + tap opens Maps. Real GPS movement requires a device build.
- Medical Sharing: GET /helper/medical gated by 'medical' permission (403 without). Returns ONLY the
  helper's assigned members and ONLY {blood_group, allergies, doctor, hospital, emergency_contact} —
  meds/conditions/insurance/policy are NEVER sent (privacy verified). Portal Medical button
  (portal-medical-btn) shown only when can_view_medical; screen = /helper-portal/medical (medcard-*,
  tap-to-call emergency contact). Nanny role has NO medical perm by default.
- Helper Ratings: `db.helper_ratings` unique (helper_id,date). Parent POST /api/helpers/{id}/rating
  {up|down, note} (one-per-day upsert) + GET /api/helpers/{id}/ratings. Parent /helper/[id] "How was
  today?" (rate-up/rate-down/rate-note + history). Helper portal praise banner (portal-praise) when
  rated_up_today. helper/dashboard exposes can_view_medical, care_team_unread, rated_up_today.
- Verified: testing agent Batch #32 — BACKEND 26/26 pytest
  (backend/tests/test_batch32_trusted_helpers_phase3.py) incl. care-team isolation, no-chat-perm 403,
  cross-token 401 matrix, location 400-before-trip guard, MEDICAL leak-check (no meds/insurance) +
  cross-helper scoping, rating validation/upsert, paused/removed lifecycle blocks. FRONTEND all flows
  pass. Demo helper Sunita granted 'medical' perm + assigned Aarav (seeded medical card).
  Preview only — Publish to ship to production.
- REMAINING backlog: live-GPS map polish (device build), device/session detail, selective
  emergency sharing beyond medical, English-only helper UI (i18n later).

## Batch #33 — TRUSTED HELPERS Phase 4 (Care Team Photos / Trip ETA Alerts / Shift Reminders) (June 2026)
- BUGFIX: create_helper_task now persists pickup_from/pickup_to (previously only PATCH did) + new
  dest_lat/dest_lng on HelperTaskIn/Patch.
- Care Team Photos: CareTeamMsgIn already carried photo_url; frontend CareTeamChatView now has a '+'
  attach button (careteam-attach) -> Take photo (careteam-camera) / Gallery (careteam-gallery) with
  camera+media permission flow; photo bubbles (ctphoto-*) render via SmartImage (tap opens full).
  Parent uploads via uploadMedia, helper via helperUpload, then POST {photo_url}. Both care-team
  screens pass onSendPhoto. Still isolated from Family Chat + 1:1 helper chat.
- Trip ETA Alerts: POST /api/helper/tasks/{id}/location returns eta_min and, when the pickup task has
  dest_lat/dest_lng and the live point is within ETA_ALERT_M (2000m) during en_route/picked_up, fires
  a ONE-TIME parent notification "📍 <helper> is about N min from <dest>" (trip.eta_alerted guard;
  _haversine_m; import math). Parent sets the drop-off point on each pickup task via a button
  (dropoff-<task_id>) that captures their GPS -> PATCH dest_lat/dest_lng; shows "Arrival alerts on"
  once set. Real GPS movement needs a device build.
- Shift Reminders: _shift_status(h) reuses access.start_time/end_time/days (UTC). helper/dashboard
  returns shift={start_time,end_time,today,on_duty,minutes_until,reminder(0<=mins<=60)}. Helper portal
  shows a banner (portal-shift): ⏰ starts soon / 🟢 on shift / 🗓️ today's shift. Parents already set
  working hours in the Add Helper form (no new setup UI).
- Verified: testing agent Batch #33 — BACKEND 21/21 pytest
  (backend/tests/test_batch33_trusted_helpers_phase4.py) incl. pickup create persistence, ETA far/near
  single-fire + no-double + 400-before-trip, shift reminder true/false windows, care-team photo
  persistence + isolation, plus security regressions (no-chat 403, cross-token 401, medical leak-free,
  paused blocked). FRONTEND helper portal 100% (shift banner, praise, 4 nav, attach sheet, live toggle).
  Parent-side UI not re-driven this run due to a known Playwright web-auth-storage harness limitation
  (AsyncStorage/IndexedDB, not localStorage) — parent flows verified in #32 + all parent data paths
  validated by backend. Preview only — Publish to ship to production.
- REMAINING backlog: overnight-shift handling, timezone-aware working hours (currently UTC), true
  background/push shift & ETA alerts (needs push setup), device-build validation for GPS/camera.


## Batch #34 — TRUSTED HELPERS Phase 5 (Drop-off Photo / Shift Check-In / Care Team Voice Notes) (June 2026)
User-requested follow-ups on the helper system, all backend-authorized (never UI-only):
- Helper-scoped media token (NEW): make_helper_media_token (6h, account_type='helper_media'), returned
  by /helper/login, /helper/me, /helper/dashboard. serve_file branches: helper/helper_media tokens ->
  _serve_file_for_helper allows ONLY files that are (a) the helper's own uploads (owner_id==helper_id),
  (b) referenced by a care_team_messages photo_url/audio_url in the helper's family, or (c) referenced by
  this helper's helper_messages — everything else (Family Chat, Vault, other members' media, random
  paths) -> 404. Normal family media tokens still serve family files and can't be broadened by helpers.
- Care Team voice notes: CareTeamMsgIn gained audio_url/audio_dur (photo_url already existed);
  care_msg_public returns them; both send endpoints (parent /api/care-team/chat + helper
  /api/helper/care-team) accept text|photo|audio (empty -> 400). Frontend CareTeamChatView records via
  expo-audio useAudioRecorder (mic button careteam-mic -> recording bar careteam-rec-send/-cancel + mic
  permission flow) and plays back via VoiceMessage (ctvoice-*); photo bubbles ctphoto-*. Still fully
  isolated from Family Chat AND the 1:1 helper chat.
- Drop-off arrival photo: HelperTripIn gained proof_url; on stage=reached it stores trip.proof_url,
  completes the task, and the parent notification becomes 📸 'Arrival photo attached' (🚗 fallback if
  no photo). Helper portal 'Reached Home' (trip-reached-*) opens the camera (permission flow), uploads,
  then POSTs stage=reached with proof_url (proceeds even if camera canceled). Parent helper/[id] pickup
  row shows the arrival thumbnail (arrival-proof-*).
- Shift check-in / check-out: NEW db.helper_checkins (unique helper_id+date). POST /helper/checkin
  (idempotent; first fires 🟢 parent notif), POST /helper/checkout (400 if not checked in; fires 👋).
  dashboard.checkin + parent list_helpers/get_helper carry checked_in_at/checked_out_at. Helper portal
  'I've arrived — start my shift' (portal-checkin) -> 'On duty since HH:MM · Check out'
  (portal-onduty/portal-checkout) -> 'Shift ended' (portal-checkedout). Parent sees '🟢 On duty since
  HH:MM' on helper detail (helper-onduty) + Family tab helper card.
- Verified: testing agent Batch #34 — BACKEND 33/33 pytest
  (backend/tests/test_batch34_trusted_helpers_phase5.py) incl. the marquee media-token scoping (200 for
  own/care-team/helper-msg files, 404 for Family Chat / Vault / other-member / random paths; parent
  token no regression), care-team voice+photo accept/empty-400/isolation, drop-off proof persist+📸
  notif+activity, check-in idempotency + checkout-400-before-checkin + 👋, and security regressions
  (cross-token 401, no-chat 403, medical leak-free, paused blocked). FRONTEND (sunita/1234): shift banner,
  Care Team mic->recording bar->cancel (no crash), ctphoto-*/ctvoice-* bubbles render; parent on-duty +
  arrival-proof testIDs code-confirmed. No bugs found. Preview only — Publish to ship to production.
- NATIVE-ONLY (needs a real device build via Publish, NOT verifiable in Expo Go / web): mic voice
  recording, camera arrival-photo capture, real GPS movement for the live pickup map/ETA.
- REMAINING backlog: overnight-shift handling, timezone-aware working hours (currently UTC), true
  background/push shift & ETA alerts (needs push setup), device-build validation for GPS/camera/mic.
## Batch #35 — Family/Calendar/Home polish + Helper Alerts (June 2026)
Four user-requested changes, all shipped & tested (testing agent iteration_34: backend 8/8 pytest
`backend/tests/test_batch35_home_and_helper_notifs.py`, frontend flows 100%):
- Removed the "Love This Week" affection timeline from the Family tab (Send Some Love card kept).
- Calendar revamp (Cubbily-style): coral gradient hero (year + month + prev/Today/next), a horizontal
  color-coded family-member filter row (tap avatars to filter the month grid by whose events, empty =
  all), month-grid day cells now render colored event PILLS (left-accent + truncated title + "+N more")
  instead of plain dots, today/weekend/selected highlighting, and a selected-day agenda with a count
  badge. All prior agenda logic kept (RSVP, recurring 🔁 + delete-scope modal, remind/nudge, create FAB).
- Home done-tracking: Family tasks section shows "<n> done · <n> to do" + a "COMPLETED TODAY" list with
  each done task's owner avatar (who ticked it off); Kids & Chores done chips show a mini-avatar of who
  marked each chore done. Backend: /todos/items/{id}/toggle records done_by_member_id+done_at,
  /chores/{id}/complete records completed_by_member_id, /api/home returns tasks_done_today[] +
  kids[].chores[].done_by. (Fixed a latent shadowing bug where the helpers_today loop overwrote the
  family `tasks` list.)
- Helper in-portal Alerts feed: helper portal header bell (unread badge from dashboard.notif_unread)
  opens /helper-portal/notifications — an aggregated, newest-first feed of parent 1:1 messages, Care
  Team messages from others, parent handover notes and family ratings/praise (GET /helper/notifications,
  POST /helper/notifications/read). SECURITY-verified: the feed contains NO normal Family Chat data;
  a no-chat-perm helper still sees handover/ratings but no chat/care-team items. Preview only — Publish to ship.

## Batch #36 — Helper Alert Taps + Calendar Week/Day + Task Nudge (June 2026)
Three user-selected follow-ups, shipped & tested (testing agent iteration_35: backend 6/6 pytest
`backend/tests/test_batch36_task_nudge_helper_focus.py`, all 3 frontend flows pass):
- Helper Alert Taps: helper Alerts feed items for Care Team / 1:1 chat now carry message_id and route
  to /helper-portal/care-team?focus=<id> (or /chat?focus=<id>). CareTeamChatView reads highlightId,
  measures each bubble (onLayout), scrolls to the target on open and briefly flashes it (~2.6s), then
  re-enables auto-scroll-to-end. Care Team media still loads via the helper media token.
- Calendar Month/Week/Day: added a segmented switch (cal-view-month/week/day) in the gradient hero.
  Month = revamped grid + selected-day agenda. Week = scannable 7-day list (week-day-<ds>: weekday +
  today-highlighted date + time/title event chips, "No events" when empty; tap a day -> Day view).
  Day = single-day agenda. Hero prev/Today/next arrows are view-aware (month / 7-day / 1-day stepping);
  member color filter (cal-member-<id>) applies across all views. Existing RSVP/recurring-delete/FAB kept.
- Task Nudge: POST /todos/items/{id}/nudge — a parent (or the task owner) gently reminds the assignee
  of an OPEN task: posts "⏰ Reminder from <me>: @<assignee>, please finish \"<title>\"" to family chat +
  pushes the assignee (non-blocking). 400 if done, 404 if missing, 403 if a non-parent nudges another's
  task. Home Family-tasks rows show a "Remind" pill (task-nudge-<id>) for parents on assigned tasks ->
  bottom toast "⏰ Reminder sent to <name>". Preview only — Publish to ship to production.

## Batch #37 — Helper profile+ID / Overdue Reminders / Week Heatmap / Helper Reply Chip (June 2026)
Four user asks, shipped & tested (testing agent iteration_36: backend 7/8 pytest — 1 skipped child-403;
all frontend flows pass):
- Trusted Helper profile & documents (admin/parent only): HelperIn/HelperPatch gained address +
  id_card_url (phone/photo_url already existed). New reusable HelperProfileFields (photo avatar picker
  w/ camera+gallery + permission flow, phone, address, private ID-card image upload via uploadMedia) is
  used in the Add-Helper form AND a parent-only Edit modal on the helper detail (helper-edit-profile ->
  profile-save, PATCH /helpers/{id}). Detail shows a 'Contact & documents' card; identity header shows
  the photo. SECURITY: id_card_url is returned ONLY by parent endpoints (POST/GET/PATCH /helpers) — NOT
  by /helper/me or /helper/login; and a helper media token 404s the parent-owned id_card file. The
  helper portal has no edit UI. (Editing stays with admin/parent.)
- Overdue Reminders: POST /todos/nudge-overdue (parent/admin; 403 otherwise) reminds every assignee with
  overdue OPEN tasks in one go — one family-chat message per person + push. Home Family-tasks shows a red
  '<n> tasks overdue · Remind all' banner (task-nudge-overdue) -> toast '⏰ Reminded <names>'.
- Calendar Week Heatmap: Week-view rows are shaded by event count (coral alpha ramp), show the count
  under the date, and busy days (>=4 events) get a '🔥 Busy day · N events' caption + accent border;
  re-shades with the member color filter.
- Helper Reply Chip: Care Team alert rows in the helper Alerts feed have an 'On it 👍' chip
  (helper-reply-<i>) that POSTs to /helper/care-team without navigating (chip -> 'Sent' + flash).
  Preview only — Publish to ship to production.

## Batch #38 — Medical info revamp + Login redesign + Reset-email note (June 2026)
Shipped & tested (testing agent iteration_37: backend 5/5 pytest, all frontend flows pass):
- Emergency/Medical revamp: blood group is an 8-option chip selector; allergies are tap-to-pick popular
  pills + an 'Other' custom entry (removable tags); Doctor split into name + phone (tap-to-call in view);
  Insurance profile with 4 types — Health, Critical illness, Term life, Vehicle — each provider + policy
  number + optional phone. Backend MedicalCardIn gained doctor_phone + insurance:[InsuranceEntryIn];
  _MEDICAL_DETAIL_FIELDS includes doctor_phone + insurance so they're stripped for viewers without
  medical-detail permission (blood_group + allergies stay family-visible). Helper Care-Team medical view
  still exposes ONLY allergies/blood_group/doctor/hospital/emergency_contact — no doctor_phone/insurance
  leak (security-verified). Edit restricted to self or admin/parent.
- Login redesign: AuthContext computes hasQuickSignin at bootstrap; the root gate opens the PIN "Who's
  this?" picker first for returning families (else Welcome). PIN picker has an always-visible bottom
  area: 'Sign in with email & password' + a prominent 'I'm a trusted helper' button; back returns to
  Welcome. Welcome's trusted-helper is now a clearly visible outlined button. login.tsx simplified
  (or-divider before Google/Apple, PIN moved to a light link). forgot.tsx shows a 'check Spam/Junk' hint.
- Reset-password email: NOT a code bug — send_email matches the managed-Resend playbook and the proxy
  returns 202+id (live send to a real Gmail verified). User tests in PRODUCTION; delivery is a spam/inbox
  matter. Added the spam hint. Preview only for the UI — Publish to ship to production.

## UX Polish Batch #39 — Calendar Task view (start of app-wide standardization) — June 2026
Governing task: complete app-wide UI/UX standardization & professional polish. Kicked off with the
flagship Calendar module, which the user requires to support Month, Week, Day AND Task views.
- NEW backend GET /api/tasks/upcoming (family-scoped): all OPEN to-dos across every list sorted by
  due_date (undated last), each with assignee member-card, priority, days_until_due, overdue, scope,
  list_name, + can_manage. Reuses _member_card + _days_until.
- Calendar 4th view "Tasks" (cal-view-task): groups open to-dos into Overdue / Due today / This week /
  Later / No date with colored group headers + counts. Rows (cal-task-<id>) show a toggle circle
  (cal-task-check-<id> -> POST /todos/items/{id}/toggle, optimistic), title, High-priority flag, due
  date (red if overdue), list name, assignee avatar. Member filter row filters by assignee. Empty state
  "All caught up!". FAB routes to /todos in Task view. Hero shows "Tasks" + open count (no prev/next).
- Month-cell event pill font bumped 8->9 for readability.
- Demo seeder: a few Family Tasks / Vacation Packing to-dos now get realistic due dates (overdue / today
  / this-week) so the Task view demonstrates its grouping on fresh demos.
- Verified: testing agent Batch #39 — backend 6/6 pytest (test_batch39_tasks_upcoming.py; 401 w/o token,
  field shape, family-scoping, toggle removes from list) + frontend (4 segments, grouped tasks, toggle
  removes row, member filter, Month/Week/Day regression clean). Preview only — Publish to ship.
- REMAINING (app-wide polish backlog, not yet started): Home hierarchy, Family/Helpers, Chat/Care Team,
  Shopping/Meals/Recipes/Wishlist, Memories/Timeline/Tree, Vault/Insurance, Emergency/Medical,
  Notifications/Settings, Helper portal — plus optional shared primitives (EmptyState/SectionHeader/Chip).

## UX Polish Batch #40 — Home / Family & Helpers / Chat polish — June 2026
Continued the app-wide polish pass (pure visual/layout; no API/logic changes). Verified: testing agent
iteration_39 — all frontend checks PASS on the 3 touched screens; no blocking issues.
- Home: the "Needs Attention" section always floats to the top (renders nothing when empty) and an active
  SOS / expiring vault floats Emergency above it. Section header shows a red count badge; attention rows
  restyled with a tone-colored 4px left-accent border + tinted icon chip (glanceable urgency). SectionHead
  gained an optional badge prop.
- Family & Helpers: unified leading-icon circles to 46px across invite/empty/helper cards; helper name
  numberOfLines=1 + role numberOfLines=2 (no right-cluster collision on narrow screens); Care Team CTA got
  a matching border for cohesion; fixed a pre-existing unescaped-quote lint error.
- Chat: other-person bubbles now carry a 1px border (were borderless surfaceSecondary on a near-white bg)
  matching the Care Team view; message text lineHeight 20->21. Own bubbles unchanged (coral brand).
- Housekeeping: pruned 31 stale TEST_* marker messages (27 family chat + 3 care-team + 1 helper) left by
  earlier test runs, for a cleaner demo.
- REMAINING app-wide polish backlog: Shopping/Meals/Recipes/Wishlist, Memories/Timeline/Tree,
  Vault/Insurance, Emergency/Medical, Notifications/Settings, Helper portal + detail, Auth/onboarding;
  optional shared primitives (EmptyState/SectionHeader/Chip/Badge). Preview only — Publish to ship.
