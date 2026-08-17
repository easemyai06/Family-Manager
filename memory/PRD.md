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
