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
- Home dashboard: greeting, quick actions, Today's Plan (events/chores/shopping), birthday banner,
  stories bar, Family Moments feed.
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
- Tested: 32/32 (v1) + 13/13 (chat) backend tests pass; frontend flows verified.

## Backlog (prioritized)
### P0 (next)
- Our Family Story: family timeline + individual life timelines + milestones + memory vault + On This Day.
- Family Tree (interactive) + generational timeline.
- Chat additions: voice notes (needs native build), message reactions, pinned messages, group management.
### P1
- Meal Planner + Recipes (recipe → meal → shopping links); Family Albums.
- Birthdays: scheduled wishes + celebration screen; RSVP + recurring events; external calendar sync.
- Family Rewards (stars → rewards), notifications center.
### P2
- Time Capsules, Future Letters, Family Yearbook.
- AI: event import (screenshot/paste), recipe creator, meal planner, family memory assistant, timeline suggestions.
- Universal search, admin panel (roles/permissions/devices), accessibility polish.

## Next tasks
1. Build Private Chat (backend messages/threads + real-time + UI).
2. Build Our Family Story (timeline + milestones + On This Day) linking existing posts/events/albums.
3. Add Meal Planner + Recipes with shopping-list integration.
