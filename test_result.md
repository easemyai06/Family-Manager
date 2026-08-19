#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: "FamilyHome — finish in-progress feature batch: (1) Voice Notes in chat (tap-and-hold), (2) Our Family Story timeline + Add Memory + Memory Detail + Memory Vault, (3) Message Reactions in chat, (4) On This Day on Home. Also chat regression."

backend:
  - task: "Timeline CRUD (/api/timeline GET/POST/GET{id}/DELETE) + On This Day (/api/timeline/on-this-day) + Home on_this_day"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Backend verified via curl on fresh demo family: /timeline returns 8 seeded memories, on-this-day returns 1 event (Kerala trip, 7 yrs ago), home.on_this_day populated. Any member can create a memory."
  - task: "Chat message reactions (/api/messages/{id}/react toggle)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Reaction toggle endpoint present; messages hydrate reactions summary + my_reaction. Needs runtime UI verification."
  - task: "Voice note upload (/api/upload kind=audio) + voice message send (type=voice)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Upload supports kind=audio (audio/m4a). send_message supports type=voice with duration + media. Recording itself is native-only."

frontend:
  - task: "Our Family Story timeline screen + Add Memory + Memory Detail + Memory Vault (grouped by year)"
    implemented: true
    working: "NA"
    file: "frontend/app/timeline/index.tsx, create.tsx, [id].tsx, vault.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Built 3 missing screens. Timeline list (filters, year groups), Add Memory (photos/date/category/people/importance, any member), Memory Detail (carousel + delete), Memory Vault (3-col photo grid grouped by year). Reachable from More > Our Family Story, member profile Story button, and Home On This Day."
  - task: "On This Day card on Home dashboard"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Horizontal On This Day card section renders home.on_this_day items with X years ago + tap to memory detail; 'Family Story' link to /timeline. Confirmed present in DOM on smoke screenshot."
  - task: "Chat message reactions UI (long-press picker, reaction chips)"
    implemented: true
    working: "NA"
    file: "frontend/app/chat/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Long-press message opens action sheet with emoji reactions (❤️😂👍😮😢🎉) + Reply. Reaction chips render under bubble with counts; my_reaction highlighted."
  - task: "Voice notes in chat (tap-and-hold mic, waveform playback)"
    implemented: true
    working: "NA"
    file: "frontend/app/chat/[id].tsx, frontend/src/components/VoiceMessage.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "expo-audio (SDK54). Press-and-hold mic records, release sends; permission flow: check->request->Open Settings if blocked. VoiceMessage plays with waveform + duration. Recording is NATIVE-ONLY (may not work on web preview/Expo Go)."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Our Family Story timeline screen + Add Memory + Memory Detail + Memory Vault (grouped by year)"
    - "On This Day card on Home dashboard"
    - "Chat message reactions UI (long-press picker, reaction chips)"
    - "Timeline CRUD + On This Day backend"
    - "Chat message reactions backend"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: "Completed in-progress feature batch. Please test BACKEND (timeline CRUD, on-this-day, message reactions, audio upload) and FRONTEND flows (Our Family Story: open from More, add a memory with photo, view detail, open vault; On This Day card on Home; chat message reactions via long-press). Voice recording is native-only — do NOT fail the build if web recording is unavailable, just verify the mic button + permission handling render. Use fresh account register+seed to get timeline data (the older testdad@fam.com family predates timeline seed). Seeded test account: storytester@fam.com / secret123 (already has 8 memories)."

# ============ Feature Batch #4 (Pin / Group mgmt / Yearbook / Memory Reminders + Push) ============
backend_batch4:
  - task: "Pin/unpin a chat message (single pin per conversation)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "POST /api/chats/{id}/pin {message_id} sets single pinned_message_id; POST /api/chats/{id}/unpin clears; hydrate_chat returns pinned_message w/ sender. Verified via curl."
  - task: "Group chat management (rename, add/remove members) — custom groups only"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "PATCH /api/chats/{id} {name, add_member_ids, remove_member_ids}. Rejects type=family/direct (400). Keeps caller in group; min 2 members. Verified via curl (rename+add+remove ok; family chat 400)."
  - task: "Push notifications: register-push + send_push + morning On This Day reminder loop + new-message push"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "POST /api/register-push relays to Emergent (returns 500 with placeholder key in preview — EXPECTED, real key injected at deploy). send_push helper; morning_reminder_loop scheduled daily 08:00 UTC (deduped via push_log); push on new chat message to offline members; POST /api/push/test-reminder for manual trigger. Verified endpoints exist and respond; actual delivery only works after Publish+build."

frontend_batch4:
  - task: "Pin message UI (long-press Pin/Unpin, pinned banner at top of conversation)"
    implemented: true
    working: "NA"
    file: "frontend/app/chat/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Long-press action sheet has Pin/Unpin (testID action-pin). Pinned banner (testID pinned-bar) shows below header w/ tap-to-unpin. Single pin replaces older."
  - task: "Group management screen (rename + add/remove members)"
    implemented: true
    working: "NA"
    file: "frontend/app/chat/manage.tsx, frontend/app/chat/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Gear button (testID chat-manage-btn) shows only for type=group, opens /chat/manage?id=. Rename input + member checklist (self locked). Save applies add/remove diff via PATCH."
  - task: "Family Yearbook on-screen scroll view (year selector + cover + memory pages)"
    implemented: true
    working: "NA"
    file: "frontend/app/timeline/yearbook.tsx, frontend/app/timeline/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Book icon in timeline header (testID open-yearbook) opens Yearbook. Year chips, gradient cover w/ counts, per-memory 'pages' with photo/date/title/desc/people; tap page opens memory detail. Confirmed timeline header renders book+vault buttons via screenshot."
  - task: "In-app morning memory reminder banner on Home (once/day, dismissible)"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Banner (testID otd-nudge) shows at top of Home when on_this_day exists and not dismissed today (storage key otdNudge:YYYY-MM-DD). Tap opens memory; X (otd-nudge-dismiss) dismisses for the day."
  - task: "Push registration wiring in _layout (native only)"
    implemented: true
    working: "NA"
    file: "frontend/app/_layout.tsx, frontend/src/lib/push.ts"
    stuck_count: 0
    priority: "low"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Module-scope setNotificationHandler + Android channel; useEffect tap handlers (warm+cold) route via action_url; denied weekly nudge w/ Open Settings; registerForPush on user. NATIVE-ONLY — web early-returns; do not fail on web."

agent_communication_batch4:
    -agent: "main"
    -message: "Batch #4 complete. TEST BACKEND: pin/unpin, PATCH group (rename/add/remove; family+direct must 400), register-push (expect 500 w/ placeholder key = OK), push/test-reminder. TEST FRONTEND: chat long-press Pin -> pinned banner appears -> tap banner unpins; group gear button opens manage screen (rename + toggle members + save); timeline 'open-yearbook' opens Yearbook w/ year chips + pages; Home morning banner 'otd-nudge' appears once/day and dismisses. Push delivery + voice recording are NATIVE-ONLY (need Publish+build) — verify UI/permission handling only, do NOT fail on web. Account with data: storytester@fam.com / secret123 (also has 9 memories now). To test group mgmt, create a custom group first (New chat -> select 2+ people -> name it)."

# ============ Feature Batch #5 (Family Tree / Birthday Wishes / Memory Reactions+Notes / Group Photo) ============
backend_batch5:
  - task: "Memory reactions (love toggle) + memory comments (notes)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "POST /api/timeline/{id}/react toggles a love (timeline_reactions); GET/POST /api/timeline/{id}/comments; hydrate_timeline returns love_count, comment_count, my_love. delete_timeline also cleans reactions+comments. Verified via curl (love_count=1 my_love=true; comment added+listed)."
  - task: "Birthday wishes (send + list per member/year) + push to birthday person"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/birthdays/{member_id}/wishes?year= returns {member, year, wishes(hydrated from)}; POST adds a wish {message, emoji} for current year + non-blocking push to birthday person. Verified via curl."
  - task: "Group cover photo (ChatPatch.photo_url) + avatar in hydrate_chat for groups"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "PATCH /api/chats/{id} now accepts photo_url; hydrate_chat sets avatar=photo_url for group type. Verified via curl (avatar set true)."

frontend_batch5:
  - task: "Family Tree screen (auto generation grouping, tap-through to profile/story)"
    implemented: true
    working: "NA"
    file: "frontend/app/tree/index.tsx, frontend/app/(tabs)/more.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "More tab > Family Tree (route /tree, no longer 'soon'). Auto-buckets members into Grandparents/Parents/Children by role+relationship, connector spine, each node (testID tree-node-<id>) taps to member profile."
  - task: "Birthday Wishes screen (celebration header + wish feed + emoji composer)"
    implemented: true
    working: "NA"
    file: "frontend/app/birthday/[id].tsx, frontend/app/(tabs)/index.tsx, frontend/app/member/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Opened from Home birthday banner (testID birthday-banner) and member profile 'Birthday Wishes' (testID member-birthday-wishes). Emoji picker (wish-emoji-<e>) + message (wish-input) + send (wish-send); wishes stack in feed."
  - task: "Reactions + notes on a memory (memory detail)"
    implemented: true
    working: true
    file: "frontend/app/timeline/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Screenshot-confirmed: memory detail shows love button (testID memory-love) with count, note count, comment list (memory-comment-<id>), and 'Leave a note' composer (memory-comment-input / memory-comment-send). Needs full interaction retest."
  - task: "Group photo picker in manage screen + shown in chat list & conversation header"
    implemented: true
    working: "NA"
    file: "frontend/app/chat/manage.tsx, frontend/app/(tabs)/chat.tsx, frontend/app/chat/[id].tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Group manage screen has a photo picker (testID group-photo-picker) that uploads + PATCHes photo_url; chat list and conversation header show the group photo when set (else icon)."

agent_communication_batch5:
    -agent: "main"
    -message: "Batch #5 complete. TEST BACKEND: memory react toggle + comments; birthday wishes GET/POST; group PATCH photo_url. TEST FRONTEND: (1) More > Family Tree renders generations, tap a node -> member profile; (2) member profile 'Birthday Wishes' + Home birthday banner -> birthday screen, pick emoji + send a wish -> appears in feed; (3) memory detail love toggle + add a note (already screenshot-verified, please retest interaction); (4) create/open a custom group -> gear -> manage -> set a group photo -> save -> photo shows in chat list + header. Account: storytester@fam.com / secret123 (has 9 memories + members Raj/Priya/Aarav/Anaya/Meera). Note: Home birthday banner only appears if a birthday is within the upcoming window; use member profile button to reach Birthday Wishes reliably. Push/voice remain native-only (don't fail on web)."

# ============ Feature Batch #6 (Time Capsules / Weekly Highlights / Places view) ============
backend_batch6:
  - task: "Time Capsules CRUD + locked-content hiding + unlock push"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/capsules (locked hides message/media, returns days_until), POST /api/capsules {message, media, unlock_date} (any member; unlock_date must be future -> 400 otherwise), GET /api/capsules/{id}, DELETE (author only -> 403). Morning loop pushes family when a capsule unlocks. Seed adds 2 demo capsules (1 locked +120d, 1 unlocked -30d). Verified via curl: 2 capsules, locked message HIDDEN."
  - task: "Weekly Highlights aggregation (/api/highlights/week)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Returns period + counts {posts, memories, wishes, loves} over last 7 days, top_poster, and mini lists of posts+memories. Verified via curl (counts + top_poster Aarav)."
  - task: "Places grouping (/api/timeline/places) + location filter on /api/timeline"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/timeline/places groups memories by location (count + cover), declared before /timeline/{id} to avoid capture. GET /api/timeline?location= filters case-insensitive. Verified via curl (7 places)."

frontend_batch6:
  - task: "Time Capsules screens (list, create with future unlock date, detail locked/unlocked)"
    implemented: true
    working: true
    file: "frontend/app/capsule/index.tsx, create.tsx, [id].tsx, frontend/app/(tabs)/more.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Screenshot-confirmed list shows Unlocked capsule (message) + Sealed capsule (Opens in 120 days, hidden). More > Time Capsules (no longer soon). Create: message + optional photos + unlock date presets/stepper (min tomorrow) + save-capsule-btn. Detail: locked shows countdown, unlocked shows message+photos; author can delete."
  - task: "Weekly Highlights screen + Sunday Home card"
    implemented: true
    working: "NA"
    file: "frontend/app/highlights/index.tsx, frontend/app/(tabs)/index.tsx, frontend/app/(tabs)/more.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "More > Weekly Highlights opens recap (period, 4 stat cards, top poster, new memories list). Home shows a 'sunday-highlights' card ONLY on Sundays (today may not be Sunday -> card hidden is expected). Opened anytime from More."
  - task: "Places We've Been screen + tap-through to filtered timeline"
    implemented: true
    working: "NA"
    file: "frontend/app/places/index.tsx, frontend/app/timeline/index.tsx, frontend/app/(tabs)/more.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "More > Places We've Been: 2-col grid of places (cover + count). Tapping (place-<location>) opens the timeline filtered to that location with the place name as title."

agent_communication_batch6:
    -agent: "main"
    -message: "Batch #6 complete. TEST BACKEND: capsules GET/POST(future date required)/GET{id}/DELETE(author only); highlights/week; timeline/places + timeline?location=. TEST FRONTEND: (1) More > Time Capsules -> list (screenshot-verified) -> FAB create (message + unlock date preset/stepper) -> new locked capsule appears; open a locked capsule (countdown, message hidden) and an unlocked one (message shown). (2) More > Weekly Highlights renders stats+memories. (3) More > Places We've Been grid -> tap a place -> filtered timeline. Use capsuletester@fam.com / secret123 (freshly seeded: 8 memories across 7 places + 2 capsules). NOTE: Home Sunday-highlights card only shows on Sundays; today likely isn't Sunday so verify via More instead. Push/voice remain native-only."

# ============ Feature Batch #7 (Rewards: streak+stars+badges / Family Albums / Memory Search) ============
backend_batch7:
  - task: "Rewards aggregation (/api/rewards) + family streak in /api/home"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/rewards returns per-member star points (posts 10/love 5/memory 15/wish 5/chore 8), leaderboard sorted, family streak (consecutive active days w/ 1-day grace), and 8 badges w/ earned+progress. /api/home now returns family_streak. Verified via curl (streak=3, Raj 135 top, badges earned First Post+Storyteller)."
  - task: "Family Albums CRUD (creator-only add photos)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET/POST /api/albums, GET /api/albums/{id}, POST /api/albums/{id}/photos (creator ONLY -> 403 else; sets cover if none), DELETE (creator only). Seed adds 'Goa Getaway' album w/ 3 photos. Verified via curl."

frontend_batch7:
  - task: "Family Rewards screen (streak, star leaderboard, badges, kid celebration)"
    implemented: true
    working: true
    file: "frontend/app/rewards/index.tsx, frontend/src/components/StarBurst.tsx, frontend/app/(tabs)/more.tsx, frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Screenshot-confirmed: More > Family Rewards shows 🔥 streak, ranked star leaderboard w/ medals + progress bars, badges grid (earned vs locked w/ progress), and a StarBurst confetti celebration on open. Home shows a '{n}-day family streak' chip (home-streak) that opens Rewards."
  - task: "Family Albums screens (list, create modal, detail w/ creator-only add)"
    implemented: true
    working: "NA"
    file: "frontend/app/albums/index.tsx, create.tsx, [id].tsx, frontend/app/(tabs)/more.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "More > Family Albums (no longer soon). Grid of albums (cover+count+creator). FAB (fab-add-album) -> create (album-title-input, save-album-btn) -> opens album detail. Detail shows photo grid; 'Add Photos' (album-add-photos) shows ONLY for the creator (image pick may not work on web preview -> expected). Delete (album-delete) creator-only."
  - task: "Memory Search on Our Family Story screen"
    implemented: true
    working: "NA"
    file: "frontend/app/timeline/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Search bar (memory-search-input) under the header filters memories instantly by title, location, or person name; clear button (memory-search-clear)."

agent_communication_batch7:
    -agent: "main"
    -message: "Batch #7 complete. TEST BACKEND: /api/rewards (leaderboard+streak+badges), /api/home family_streak, albums CRUD incl. creator-only add-photos 403. TEST FRONTEND: (1) More > Family Rewards (already screenshot-verified) + Home 'home-streak' chip opens it; (2) More > Family Albums -> FAB create album -> opens detail -> as creator 'Add Photos' visible (web image pick may fail -> expected); open the seeded 'Goa Getaway' album to see its 3 photos; (3) Our Family Story -> type in memory-search-input (e.g. 'Kerala' or a person name) -> list filters instantly. Use rewardtester@fam.com / secret123 (seeded: leaderboard data, 'Goa Getaway' album w/ 3 photos, 8 memories across places). Push/voice remain native-only."

# ============ Feature Batch #8 (Weekly Winner / Star of the Week + Search Everywhere) ============
backend_batch8:
  - task: "Star of the Week (compute_weekly_stars) — last-7-day star points incl. child chores; surfaced in /api/rewards + /api/highlights/week"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "compute_weekly_stars(fid) tallies last-7-day points per member: post 10 / love 5 / memory 15 / wish 5 / chore 8 (chore_completions in last 7 days -> children earn stars). Returns week_leaderboard (sorted) + star_of_week (top, only if >0). /api/rewards now returns week_leaderboard + star_of_week; /api/highlights/week returns star_of_week. Verified via curl on fresh seed: star_of_week=Raj 125, week_leaderboard len 5 (Raj 125, Aarav 36 incl chores, Anaya 18)."
  - task: "Global search (/api/search?q=) across people, memories, posts, chats"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Case-insensitive regex search scoped to caller's family. members(name/relationship), timeline(title/location, hydrated), posts(caption, w/ author+cover), chats(caller's chats filtered by display_name). Verified via curl: q=Priya -> 1 member + 1 chat (direct); q=family -> 2 memories + 1 post + Family Chat."

frontend_batch8:
  - task: "Global Search screen (/search) + Home header search entry point"
    implemented: true
    working: "NA"
    file: "frontend/app/search/index.tsx, frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Home header search icon (testID home-search) opens /search. Debounced input (global-search-input, clear via global-search-clear) hits /search; renders People (search-member-<id> -> member profile), Memories (search-memory-<id> -> timeline detail), Posts (search-post-<id> -> post detail), Chats (search-chat-<id> -> chat). Empty + no-results states."
  - task: "Star of the Week card on Rewards + Weekly Highlights + Home (Sunday)"
    implemented: true
    working: "NA"
    file: "frontend/app/rewards/index.tsx, frontend/app/highlights/index.tsx, frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Rewards shows a 👑 gold crown 'STAR OF THE WEEK' card (name + weekly stars + avatar) when star_of_week present. Highlights shows a 'STAR OF THE WEEK' card. Home Sunday-highlights card path unchanged. Star only appears when a member earned >0 stars in last 7 days."

agent_communication_batch8:
    -agent: "main"
    -message: "Batch #8 complete (Weekly Winner + Search Everywhere). TEST BACKEND: (1) /api/rewards -> week_leaderboard (sorted desc) + star_of_week (top member, points>0); confirm a CHILD who completed chores appears in weekly points. (2) /api/highlights/week -> star_of_week present. (3) /api/search?q= across members/memories/posts/chats (case-insensitive, scoped to caller family; empty q returns empty lists). TEST FRONTEND: (1) Home header search icon (home-search) -> /search; type 'Priya' -> People + Chats sections render, tap a person -> member profile, tap a chat -> conversation; type a memory word -> Memories section -> tap -> timeline detail; clear button resets. (2) More > Family Rewards -> gold 👑 Star of the Week card + star leaderboard; (3) More > Weekly Highlights -> Star of the Week card + stat cards. Fresh seeded account: winner1786918036@fam.com / secret123 (Raj=Star of Week 125, Aarav child 36 incl chores). Or register fresh + Explore Sharma Family. Push/voice remain native-only (don't fail on web)."

# ============ Feature Batch #9 (Meal Planner + Recipes -> Shopping auto-fill / Google auth verify) ============
backend_batch9:
  - task: "Recipes CRUD (/api/recipes GET/POST/GET{id}/DELETE)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET list (newest first), POST create {title, description, photo_url, ingredients[{name,quantity}], prep_minutes} (any member), GET{id} (w/ author), DELETE (creator or admin -> 403 else; also removes from meal_plans). Verified via curl: 4 seeded recipes."
  - task: "Meal Planner (/api/meals GET?week_start / POST upsert slot / DELETE / to-shopping)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/meals?week_start=<Monday ISO> returns {week_start, meals:[{plan_id,day,slot,recipe_id,recipe:{title,photo_url,ingredient_count}}]}. POST /api/meals {week_start,day(0-6),slot(breakfast|lunch|dinner),recipe_id} upserts (replaces existing slot). DELETE /api/meals/{plan_id}. POST /api/meals/to-shopping {week_start,list_id?} aggregates all ingredients from that week's recipes (dedup by name, quantities joined with ' + '), adds to a shopping list (reuses/creates 'Meal Plan 🍽️' list when no list_id) skipping names already present. Verified via curl: seed plan (4 meals) -> to-shopping added 17 items; 2nd call added 0 (idempotent, same list)."

frontend_batch9:
  - task: "Recipes screens (list, create modal w/ dynamic ingredients+photo, detail)"
    implemented: true
    working: "NA"
    file: "frontend/app/recipes/index.tsx, create.tsx, [id].tsx, frontend/app/(tabs)/more.tsx, frontend/app/_layout.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "More > Recipes (no longer 'soon') -> list (recipe-<id>) + add-recipe-btn -> create modal (recipe-title-input, dynamic ingredient rows ing-name-<i>/ing-qty-<i>, add-ingredient, optional recipe-photo-pick, save-recipe-btn) -> recipe detail (ingredients list, recipe-delete for creator, recipe-plan-btn -> /meals). open-meal-planner FAB on list."
  - task: "Weekly Meal Planner screen (week nav, day/slot grid, recipe picker, add-to-shopping)"
    implemented: true
    working: "NA"
    file: "frontend/app/meals/index.tsx, frontend/app/(tabs)/more.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "More > Meal Planner (no longer 'soon'). Week switcher (week-prev/week-next, defaults to current Mon-Sun). 7 day cards each with Breakfast/Lunch/Dinner slots (slot-<day>-<slotkey>); empty slot -> tap opens recipe picker modal (pick-recipe-<id> / picker-new-recipe); filled slot shows recipe + clear (slot-clear-<day>-<slotkey>). 'meals-to-shopping' button auto-fills the Meal Plan shopping list from the week's recipes then navigates to that list; toast shows count. Screenshot-confirmed the planner grid renders. NOTE: on a HARD web refresh directly onto a data screen, first fetch can race the auth-token bootstrap (pre-existing app-wide behavior on web refresh); in-app navigation is unaffected."

  - task: "Google Sign-In verification (email OAuth via Emergent) — no code change"
    implemented: true
    working: true
    file: "backend/server.py, frontend/src/auth/AuthContext.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Reviewed against current Emergent Google Auth playbook (integration_expert). Implementation matches: web uses window.location.href redirect + hash/query session_id parse on mount; native uses WebBrowser.openAuthSessionAsync + Linking cold/hot handlers registered at mount; guarded by processedSessions Set; backend POST /auth/session exchanges session_id via X-Session-ID header at demobackend.emergentagent.com and upserts by email. App mints its own JWT (unified with email/password) instead of a user_sessions row — valid. Verified backend returns 401 for an invalid session_id. TRUE end-to-end OAuth cannot be automated (requires real Google login); email/password remains the automated path."

agent_communication_batch9:
    -agent: "main"
    -message: "Batch #9 (Meal Planner + Recipes). TEST BACKEND: recipes CRUD (creator-only delete 403), /api/meals GET/POST(upsert replaces same day+slot)/DELETE, /api/meals/to-shopping (aggregates week's recipe ingredients into a 'Meal Plan 🍽️' shopping list, dedup, idempotent on repeat). TEST FRONTEND (use IN-APP navigation, not hard refresh): (1) More > Recipes -> shows 4 seeded recipes -> open one -> ingredients list; add-recipe-btn -> create modal -> add title + a couple ingredient rows -> Save -> lands on detail. (2) More > Meal Planner -> current week shows seeded meals (Mon dinner Rajma Chawal, Tue breakfast Masala Dosa, Wed dinner Paneer Butter Masala, Fri dinner Veg Pulao). Tap an empty slot -> recipe picker -> pick a recipe -> it fills the slot; tap clear (x) removes it; week-prev/next changes the week. (3) Tap 'meals-to-shopping' -> toast 'Added N items…' -> navigates to the Meal Plan shopping list containing the ingredients. Regression: Shopping lists still work. Account: mealdemo@fam.com / secret123 (seeded 4 recipes + a current-week meal plan). Or register fresh + Explore Sharma Family. Google Sign-In: verified vs playbook (no code change); real OAuth can't be automated — do NOT fail on it. Push/voice remain native-only."

# ============ Feature Batch #10 (Phase A: Wish Lists + Gift Planning / Secret Gift Mode + 6-pillar More reorg) ============
backend_batch10:
  - task: "Wish Lists CRUD + visibility rules (/api/wishlists, /wishlists/{owner}, items CRUD)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/wishlists overview (per-member visible counts + shared family count). GET /api/wishlists/{owner} (owner=member_id or 'family') returns items the viewer may see + can_add. POST /api/wishlists/{owner}/items (self or parent/admin for a member; any member for family). GET /wishlists/items/{id}, PATCH, DELETE (owner/creator/parent-admin, else 403). Visibility: family|parents|grandparents|selected enforced in _can_view_wish. Verified via curl: overview counts (Aarav 4, family 3), family items not reservable."
  - task: "Secret Gift Mode: reserve/unreserve/status + private gift-planning notes"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "POST /wishlists/items/{id}/reserve (adult non-owner only; 409 if already reserved by someone else; reveal flag) sets status reserved + reserved_by. hydrate_wish HIDES reservation from the wish OWNER (and children) unless reveal_buyer -> preserves surprise; other adults see 'reserved_by'. unreserve (reserver only). status (reserver only: reserved|purchased|received). GET/POST /wishlists/items/{id}/notes are ADULTS-ONLY and hidden from the owner (403). Verified via curl: reserve->status reserved, note add+list, status purchased, 2nd reserve on already-reserved -> 409, unreserve->wished. Seed: Grandma has secretly reserved Aarav's LEGO."

frontend_batch10:
  - task: "Wish List screens (hub, per-owner list, add/edit modal, item detail w/ Secret Gift Mode + notes)"
    implemented: true
    working: true
    file: "frontend/app/wishlist/index.tsx, [owner].tsx, create.tsx, item/[id].tsx, frontend/src/lib/wishMeta.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Screenshot-verified: hub (Family Wishlist card + per-member cards w/ counts) and Aarav's list (items w/ price, priority stars, occasion/category chips, size/colour, and 'Meera is getting this — hidden from them 🤫' reserved bar for adult viewer). Add via add-wish-btn -> create modal (name/photo/price/store/size/colour/url + priority + occasion + category + visibility incl. 'selected' member multiselect). Item detail (wish-<id> -> /wishlist/item/<id>): product link, and for adult non-owner a Secret Gift Mode card (wish-reserve-btn + wish-reveal-toggle; when reserved by me: status steps wish-status-* + wish-unreserve-btn; private notes wish-note-input/wish-note-send). Needs full interaction retest."
  - task: "Six-pillar More tab reorg + Wishlist on birthday screen"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/more.tsx, frontend/app/birthday/[id].tsx, frontend/app/_layout.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "More tab reorganized into 6 pillars: ❤️ Connect (Send Some Love), 📅 Organize (Shopping/To-Do/Chores/Meal Planner/Recipes), 📸 Remember (Story/Albums/Places/Highlights), 🌳 Preserve (Tree/Capsules), 🎁 Celebrate & Wish (Wish Lists=/wishlist, Family Rewards), 🛡️ Protect (Family Vault + Emergency Center = 'Soon' placeholders for later phases). Birthday screen has birthday-wishlist-link -> that member's wishlist. wishlist/create registered as modal. Screenshot-confirmed hub + Aarav list render."

agent_communication_batch10:
    -agent: "main"
    -message: "Batch #10 = Phase A Wish Lists (items 67-69) + 6-pillar More reorg. TEST BACKEND: wishlists overview + per-owner (visibility), item CRUD (403 for non-owner non-parent), reserve/unreserve/status (409 on double-reserve; only-reserver for status/unreserve), notes (adults-only, owner 403). NOTE: in the demo only Raj (admin) is a real logged-in user; other members have no login, so owner-hiding for a CHILD can't be exercised via login — verify the LOGIC via Raj as an adult non-owner (should SEE 'reserved_by'), and trust hydrate for owner-hiding. TEST FRONTEND (in-app nav, account wishdemo@fam.com / secret123, seeded): More tab now shows 6 pillars. More > 🎁 Celebrate & Wish > Wish Lists -> hub -> open Aarav's Wishlist (4 items; LEGO shows 'Meera is getting this — hidden from them 🤫'). Open an UNRESERVED item (e.g. New Football Shoes) -> Secret Gift Mode card -> tap 'I'm Getting This 🎁' (wish-reserve-btn) -> becomes reserved, status steps appear; add a private gift note (wish-note-input + wish-note-send); tap 'I'm no longer getting this' to release. Add a wish: open My Wishlist (Dad) -> add-wish-btn -> fill name + price + pick priority/occasion/category + Save -> appears. Family Wishlist: open -> items are NOT reservable (shared goals). Birthday screen has a 'See <name>'s Wishlist' link. Push/voice native-only. Do NOT retest unrelated older features."

# ============ Feature Batch #11 (Phase B: Family Vault + Phase C: Emergency Center + Birthday wishlist surfacing) ============
backend_batch11:
  - task: "Family Vault: folders + items (document/insurance) CRUD + visibility + expiries"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET/POST /api/vault/folders (+ per-folder visible count), DELETE folder (parents). GET /api/vault/items (?folder_id&kind), POST (adults only 403 else), GET/PATCH/DELETE /api/vault/items/{id} (creator/owner/parent; 403 else; 403 view if not permitted). Visibility family|parents|grandparents|selected via _can_view_secure (admin sees all). GET /api/vault/expiries?days=N returns items expiring within N days sorted asc with days_until_expiry. Files support image + PDF/document (uploadDocument). Verified via curl: seed = 5 folders, 4 items, 2 expiring (Car 15d, Health 30d). Morning loop also pushes 30-day expiry reminders to parents (native-only)."
  - task: "Emergency Center: contacts, instructions, family plan, medical cards, SOS"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET/POST/PATCH/DELETE /api/emergency/contacts (critical sorted first; name+phone required). GET/POST/PATCH/DELETE /api/emergency/instructions (parents only add/edit/delete). GET/PUT /api/emergency/plan (parents; last_reviewed set on save). GET/PUT /api/emergency/medical/{member_id} (self or parent). POST /api/emergency/sos (best-effort location -> creates alert + posts '🚨 FAMILY SOS' to the family chat + push to family; returns notified+push_ok). GET /api/emergency/sos/active, POST /api/emergency/sos/{id}/resolve. Verified via curl: 10 contacts, 3 instructions, plan present, Aarav medical card (O+/Peanuts), SOS created + posted to family chat (notified=0 since only 1 linked user, push_ok true)."

frontend_batch11:
  - task: "Family Vault screens with PIN/biometric lock"
    implemented: true
    working: true
    file: "frontend/app/vault/index.tsx, folder/[id].tsx, item/[id].tsx, create.tsx, src/components/VaultGate.tsx, src/lib/vaultSession.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Screenshot-verified: More > Protect > Family Vault opens a PIN gate (VaultGate: first-time 4-digit setup+confirm, then enter; biometric via expo-local-authentication where available; vault-key-<d>, vault-biometric-btn). After unlock: dashboard shows ⏰ Upcoming Expiries (color-coded days) + Folders grid; vault-add-btn; vault-lock-btn re-locks. Folder screen lists items; item detail shows insurance fields/covered members/attachments (openable) + edit/delete. Create modal supports document|insurance kind, folder pick, dates, visibility (+selected members), photo + PDF attach. Deep-linked vault screens redirect to /vault when locked. Confirmed screenshot: Insurance/Documents/Home/Vehicles/Travel folders + 2 expiries."
  - task: "Emergency Center screens (hub+SOS, contacts, instructions, plan, medical)"
    implemented: true
    working: true
    file: "frontend/app/emergency/index.tsx, contacts.tsx, contact-edit.tsx, instructions.tsx, instruction-edit.tsx, plan.tsx, medical.tsx, medical/[id].tsx, src/lib/dial.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Screenshot-verified: More > Protect > Emergency Center = hub with big red SOS button (sos-button -> confirm -> best-effort expo-location -> POST /emergency/sos -> alerts family chat; active-sos banner + resolve). Quick Call shows critical contacts w/ big green Call buttons (call-<id> -> tel:). Shortcut grid: Contacts (⭐Critical pinned, add via contact-edit modal, WhatsApp button), What To Do (expandable instruction steps; parents add via instruction-edit), Family Plan (parents edit inline, last-reviewed), Medical Cards (member list -> medcard with blood group/allergies big cards, self/parent edit). SOS location/calling are native-only."
  - task: "Birthday screen surfaces the member's top wishes"
    implemented: true
    working: true
    file: "frontend/app/birthday/[id].tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Birthday screen now fetches /wishlists/{id} and shows the top 3 wishes (by priority) inline under the wishlist link (birthday-wish-<id> -> /wishlist/item/<id>), so relatives instantly see what to gift."

agent_communication_batch11:
    -agent: "main"
    -message: "Batch #11 = Phase B Family Vault (70-72,81-82) + Phase C Emergency Center (73-80,83-84) + birthday wishlist surfacing. Account: protectdemo@fam.com / secret123 (seeded: 5 vault folders, 4 vault items incl 2 expiring insurance policies; 10 emergency contacts, 3 instructions, a family plan, medical cards for Aarav O+/Peanuts & Raj B+). TEST BACKEND: vault folders/items CRUD + visibility (adult-only create 403; permission 403 on view/edit), /vault/expiries?days=90 (2 items). emergency contacts CRUD (critical sort), instructions (parent-only add/edit 403 for others — but demo only-Raj-is-admin so test allowed path), plan GET/PUT, medical GET/PUT, POST /emergency/sos (creates alert + posts to family chat + returns notified/push_ok), sos/active + resolve. TEST FRONTEND (in-app nav): More tab shows 6 pillars; 🛡️ Protect now has Family Vault + Emergency Center (no longer 'Soon'). VAULT: open -> PIN setup (type 1234 then 1234 via vault-key-* to set, then it unlocks) -> Upcoming Expiries + Folders; open a folder -> item -> insurance details; vault-add-btn -> create modal (toggle Document/Insurance, pick folder, expiry YYYY-MM-DD, save); vault-lock-btn re-locks (re-open asks PIN 1234). EMERGENCY: hub SOS button (confirm dialog -> sends; on web location may be blank, that's fine), Quick Call, Contacts (⭐critical first, add-contact-btn -> save; toggle critical), What To Do (expand steps; add-instruction-btn), Family Plan (edit-plan-btn -> save), Medical Cards (open a member -> edit -> save). Biometric unlock, SOS location & tap-to-call are NATIVE-ONLY (don't fail on web). Do NOT retest unrelated older features."

# ============ Feature Batch #12 (Home Redesign → Family Dashboard + manual member status) ============
backend_batch12:
  - task: "Manual member status (PATCH /api/families/members/{id}/status) + seeded demo statuses"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "New MemberStatusIn model + PATCH /api/families/members/{member_id}/status. Self can set own status; a parent/admin can set anyone's (else 403). Fields: status key, status_emoji, status_label, status_note (all clearable with status:null). Seed now sets demo statuses (Raj=work, Priya=home, Aarav=school, Anaya=home, Meera=available). Verified via curl: set travelling/note OK; self-only guard."
  - task: "Extended /api/home aggregation for the Family Dashboard"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/home now also returns: meals_today (today's slot+recipe), tasks (open to-do items across all lists w/ assignee/due/overdue/scope mine|kids|family), kids (per-child chore done/total today), shopping_preview (unchecked items + names), coming_up (future events 30d + upcoming birthdays merged/sorted), vault_expiring (viewer-scoped, <=60d, TITLE+days+kind ONLY — no policy numbers), wishlist_reminder (nearest birthday member's top wishes via hydrate_wish — reservation-safe), latest_post (single hydrated peek), family_chat (pinned + last_message), needs_attention (prioritised list w/ route/tone). Members now carry status fields. Verified via curl on fresh seed: all keys present with expected values."

frontend_batch12:
  - task: "Family Dashboard Home screen (role-aware sections, replaces social feed)"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/index.tsx, frontend/src/lib/statuses.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Rebuilt Home from a FlatList social feed into a role-ordered dashboard (ScrollView). Header shows date + greeting + family name + search (home-search) + chat (home-chat, unread badge) + avatar (home-avatar). Family Status strip: each member card (status-<id>, own = status-mine) shows avatar + status emoji/label; tapping own opens a status editor modal (status-opt-<key>, status-note, status-save, status-clear -> PATCH). Sections render by persona (parent/child/grandparent) and hide when empty: Needs Attention (attn-<key> -> route), Today at a glance, Family Tasks (task-filter-mine/kids/family), Kids & chores (praise-<id> -> send love), My chores (child), Meals, Shopping, Coming Up (comeup-<i>), Family Noticeboard (home-noticeboard -> family chat), Memory of the Day (home-memory), Wish List Reminder (home-wish-<id>), Important Information (Vault expiries), Emergency (home-emergency), Daily Brief, Latest Post peek (home-latest-post), Quick Actions (quick-<key>). Smoke screenshot confirms all 13 sections in DOM after login. Affection overlay + On This Day nudge retained. Removed old stories bar + create-post FAB from Home."

agent_communication_batch12:
    -agent: "main"
    -message: "Batch #12 = Home redesign into a role-aware Family Dashboard + manual member status. Account: dashdemo@fam.com / secret123 (full Sharma demo; members have seeded statuses). TEST BACKEND: (1) PATCH /api/families/members/{id}/status — set your own status (200) with emoji/label/note; setting ANOTHER member's status as a NON parent/admin should 403 (note: demo's only logged-in user is Raj=admin, so admin CAN set others — verify admin path works, and verify self-set works). status:null clears. (2) GET /api/home returns the new keys: meals_today, tasks (with scope + overdue + days_until_due), kids (done/total), shopping_preview, coming_up (events+birthdays sorted by days), vault_expiring (ONLY title/days/kind, NO policy_number), wishlist_reminder (reservation hidden from owner/children), latest_post, family_chat (pinned+last_message), needs_attention (route+tone). TEST FRONTEND (in-app nav, log in first): Home renders the dashboard (NOT a feed); status strip -> tap your own card (status-mine) -> modal -> pick a status (status-opt-work) + optional note -> status-save -> your status updates on the strip; Needs Attention cards navigate (attn-chores -> /chores, attn-shopping -> /shopping, attn-vault -> /vault, birthday -> /birthday/<id>); task filter chips switch lists; Kids & chores show progress bars; Coming Up horizontal cards; Family Noticeboard -> family chat; Memory of the Day -> timeline detail; Wish List Reminder -> wish detail; Emergency Center card -> /emergency; Quick Actions tiles route correctly. NOTE: an unseen affection overlay ('Priya sent you a Hug') appears on first Home load — dismiss it ('Tap to close') before interacting; this is expected. Push/voice/biometric/SOS-location remain native-only. Do NOT retest unrelated older features unless regression-suspected."

# ============ Feature Batch #13 (Noticeboard + Customize Dashboard + Home chore widgets + Evening Recap + Edit Profile) ============
backend_batch13:
  - task: "Family Noticeboard CRUD (/api/notices)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/notices (active only, pinned first then newest, owner hydrated + days_until_expiry). POST /api/notices {title, note?, expiry_date?, priority normal|high, pinned}. PATCH /api/notices/{id} + DELETE /api/notices/{id} restricted to owner OR parent/admin (else 403). Expired notes auto-hidden. Seed adds 2 demo notices. Verified via curl."
  - task: "Dashboard preferences (/api/dashboard/prefs)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET returns {order, hidden, pinned, compact} (defaults empty). PUT upserts per user_id. Verified via curl round-trip."
  - task: "Profile update (PATCH /api/auth/profile) + member.phone + home extensions"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "PATCH /api/auth/profile updates user display name and syncs the linked member's name (email is READ-ONLY, never editable). MemberPatch now accepts phone (edited via PATCH /families/members/{id}). GET /api/home now also returns today_summary {events,chores_done,chores_total,tasks_open,loves_today,posts_today,memories_today}, notices (top 3 active) and kids[].chores [{chore_id,title,stars,done_today}]. Verified via curl."

frontend_batch13:
  - task: "Family Noticeboard screen (/notice) + Home preview"
    implemented: true
    working: "NA"
    file: "frontend/app/notice/index.tsx, frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Noticeboard list screen with FAB (fab-add-notice) -> create modal (notice-title, notice-note, notice-expiry-<days|none>, notice-high, notice-pin-toggle, notice-save). Own notices show pin toggle (notice-pin-<id>) + delete (notice-del-<id>). Home 'Family noticeboard' section shows top notices (home-notice-<id>), empty state (home-notice-empty), and a family-chat peek (home-noticeboard) -> /chat/<id>. 'Open board' header action -> /notice."
  - task: "Customize Dashboard screen (/dashboard/customize)"
    implemented: true
    working: "NA"
    file: "frontend/app/dashboard/customize.tsx, frontend/src/lib/dashboard.ts, frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Opened from Home header tune icon (home-customize). Per-section controls: pin (customize-pin-<key>), hide (customize-hide-<key>), reorder up/down (customize-up-<key>/customize-down-<key>), global Compact toggle (customize-compact), Reset (customize-reset), Save (customize-save -> PUT /dashboard/prefs). Home applies prefs via applyPrefs (hidden removed, pinned floated to top, compact trims previews). Persisted per user."
  - task: "Home chore widgets (tap to complete + StarBurst)"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Kids & Chores (parent) renders each child's chores as tappable chips (home-chore-<chore_id>); child persona 'My chores' renders tappable rows. Tapping toggles complete/uncomplete (POST /chores/{id}/complete|uncomplete), optimistic UI, +stars, StarBurst celebration on completion."
  - task: "Evening Recap section (after 6pm)"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Recap card renders only when local hour >= 18 using home.today_summary; 'Save today's best moment' (recap-save-moment) -> /timeline/create. NOTE: only visible in the evening — testing agent may not see it during daytime; that is expected."
  - task: "Edit Profile screen (/member/edit)"
    implemented: true
    working: "NA"
    file: "frontend/app/member/edit.tsx, frontend/app/member/[id].tsx, frontend/app/(tabs)/more.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Edit Profile modal: change photo (edit-photo, expo-image-picker + uploadMedia), name (edit-name), phone (edit-phone), birthday (edit-birthday); email shown READ-ONLY. Save (edit-save) -> PATCH member + PATCH /auth/profile + refresh auth context. Entry points: own member profile header pencil (member-edit) and More profile card pencil (more-edit-profile)."

agent_communication_batch13:
    -agent: "main"
    -message: "Batch #13 adds 5 features. Account: board@fam.com / secret123 (Sharma demo WITH 2 seeded notices). BACKEND to test: (1) /api/notices GET/POST/PATCH/DELETE — create a note, verify it lists (pinned first), verify a NON-owner non-parent gets 403 on edit/delete (demo's only user Raj is admin, so also verify admin can delete others' notes and owner can delete own), expired notes hidden. (2) /api/dashboard/prefs GET default + PUT round-trip. (3) PATCH /api/auth/profile {name} updates user + member name; email must remain unchanged/read-only. (4) GET /api/home has today_summary, notices, kids[].chores. (5) POST /chores/{id}/complete + /uncomplete still work. FRONTEND to test (log in first; dismiss the first-load affection overlay via 'Tap to close'): (a) Home shows Family Noticeboard with 'School closed' note; tap 'Open board' -> /notice; add a note via FAB (fab-add-notice -> notice-title -> notice-save) and see it appear; delete own note. (b) Home header tune icon (home-customize) -> Customize Home; hide a section (customize-hide-kids), pin one (customize-pin-today), toggle Compact (customize-compact), Save (customize-save); return to Home and confirm the hidden section is gone / pinned floated up / compact applied. (c) Home 'Kids & chores' chore chips (home-chore-<id>) toggle done with a star celebration. (d) Edit Profile: More profile pencil (more-edit-profile) OR own profile pencil (member-edit) -> /member/edit; change name+phone, Save (edit-save); confirm name updates; email field is read-only/locked. (e) Evening Recap only shows after 6pm (skip if daytime). NOTE: photo upload + native pickers can't be fully exercised on web — just confirm the screen loads & text fields save. Do NOT retest unrelated older features."

# ============ Feature Batch #14 (Noticeboard comments/reactions + Notice reminders + Chore streaks + Event email/.ics) ============
backend_batch14:
  - task: "Noticeboard reactions + replies"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/notices/{id} (hydrated with reaction_summary [{emoji,count,mine}], reply_count, replies[] with member cards). POST /api/notices/{id}/react {emoji} toggles a single reaction per member (tap same=off, different=replace). POST /api/notices/{id}/replies {text} appends a reply. List + create now include reaction_summary/reply_count. Verified via curl: react ❤️ (count 1, mine true), reply (count 1, member Raj)."
  - task: "Chore streaks (consecutive all-done days) in /api/home kids[]"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "_chore_streak counts consecutive days (ending today or yesterday) a child completed ALL their chores; _streak_badge -> Rising Star(3)/Star Week(7)/On Fire(14)/Legend(30). kids[] now include streak + streak_badge. Verified via curl (0 for fresh seed as expected)."
  - task: "Notice expiry reminders (Home Needs Attention + morning push)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/home needs_attention now includes notices whose expiry_date == tomorrow (route /notice). run_morning_reminders pushes 'Noticeboard reminder' for notes due tomorrow (idempotent per note/day). Push only delivers on native builds."
  - task: "Event email notification + .ics calendar invite (Emergent Resend)"
    implemented: true
    working: true
    file: "backend/server.py, backend/.env"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "On POST /api/events, invited members (participant_ids + owner) with a linked user email are emailed (best-effort, non-blocking via asyncio.create_task) using Emergent Resend proxy, with a first-party 'Add to your calendar' button linking to GET /api/events/{id}/invite.ics (public, returns text/calendar VCALENDAR METHOD:REQUEST). Email passes the G2/G3 guardrail gate. NOTE: the Resend proxy BLOCKS obviously-fake/undeliverable recipients (returns 422) to protect deliverability — demo users have fake emails so real delivery won't happen in test, but event creation still succeeds and the .ics endpoint returns valid VCALENDAR (curl-verified). Added EMERGENT_EMAIL_KEY + EMAIL_FROM_NAME=FamilyHome to backend/.env."

frontend_batch14:
  - task: "Notice detail screen (/notice/[id]) with reactions + replies"
    implemented: true
    working: "NA"
    file: "frontend/app/notice/[id].tsx, frontend/app/notice/index.tsx, frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Board list rows are now tappable (notice-open-<id>) -> /notice/[id] and show reaction/reply meta + pin/delete footer. Detail screen shows the note, a reaction bar (react-❤️/👍/✅/🎉 toggle), replies list, and a reply input (notice-reply-input + notice-reply-send). Home noticeboard notes (home-notice-<id>) now open the detail. Backend curl-verified; board list + create modal render confirmed via screenshot. Full detail react/reply not screenshot-verified due to the known web deep-link auth-bootstrap race + harness ScrollView limits — needs testing agent via in-app navigation."
  - task: "Chore streak badges on Home"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Kids & chores (parent) shows a 🔥/badge-emoji streak pill next to a child's name when streak>=3; My chores (child) shows a 'N day streak' pill. Driven by kids[].streak/streak_badge from /api/home."

agent_communication_batch14:
    -agent: "main"
    -message: "Batch #14 = 4 features. Account: board@fam.com / secret123. IMPORTANT: navigate IN-APP (log in, then tap through) — do NOT hard-deep-link to /notice or /notice/<id> via a fresh page load, there is a known web auth-bootstrap race that bounces such deep links to Welcome (in-app navigation works fine). BACKEND to test: (1) POST /api/notices then POST /api/notices/{id}/react {emoji:'❤️'} -> reaction_summary shows count 1 mine true; tap same emoji again -> removed; POST /api/notices/{id}/replies {text} -> reply_count increments, GET /api/notices/{id} returns replies[] with member cards. (2) GET /api/home kids[] include streak + streak_badge. (3) POST /api/events with participant_ids -> 200 (event creation MUST succeed even though the Resend proxy returns 422 for the demo's fake emails — email is best-effort/non-blocking); GET /api/events/{id}/invite.ics returns 200 text/calendar starting 'BEGIN:VCALENDAR' with a VEVENT. FRONTEND to test (in-app nav): from Home 'Family noticeboard' tap 'Open board' -> /notice; FAB (fab-add-notice) -> fill notice-title -> notice-save -> note appears; tap the note (notice-open-<id>) -> detail (/notice/[id]); tap react-❤️ (chip highlights + count); type in notice-reply-input + notice-reply-send -> reply appears in the list; delete own note (notice-del-<id>) from the board. Also confirm Home 'Kids & chores' renders without errors (streak pills appear only when a child has a 3+ day all-chores streak, which the fresh demo won't have — so absence is fine). Do NOT retest unrelated older features."

# ============ Feature Batch #15 (Event RSVP + Notice photos) ============
backend_batch15:
  - task: "Event RSVP (POST /api/events/{id}/rsvp) + hydrate_event rsvp data"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "events store rsvps as {member_id: status}. POST /api/events/{id}/rsvp {status: going|maybe|declined} — only INVITED members (participant_ids or owner) may RSVP (else 403); invalid status -> 400. hydrate_event(e, viewer) now returns rsvps[] (member cards+status), rsvp_summary {going,maybe,declined}, my_rsvp. list_events passes the viewer. Verified via curl: RSVP going -> my_rsvp=going, summary going=1."
  - task: "Notice photo attachment (photo_url on notices)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "NoticeIn/NoticePatch accept photo_url; create_notice persists it; hydrate + GET /api/home notices include photo_url. Verified via curl."

frontend_batch15:
  - task: "Event RSVP UI on Calendar event cards"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/calendar.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Each event card shows Going/Maybe/Can't pills (rsvp-<status>-<eventId>) for the current user when invited; active pill fills with its colour; a summary line 'N going · N maybe · N can't make it' appears. SCREENSHOT-VERIFIED: tapping Going fills the pill green and shows '1 going · 0 maybe · 0 can't make it'."
  - task: "Notice photo picker + display"
    implemented: true
    working: "NA"
    file: "frontend/app/notice/index.tsx, frontend/app/notice/[id].tsx, frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Create-note modal has 'Attach a photo' (notice-photo) via expo-image-picker + uploadMedia, with preview + remove (notice-photo-remove). Photo shown on the board card, notice detail (/notice/[id]) and the Home noticeboard preview thumbnail. Native image upload can't be exercised on web; verify the picker button renders and a notice WITH a photo_url (set via API) shows its image on the board/detail/home."

agent_communication_batch15:
    -agent: "main"
    -message: "Batch #15 = Event RSVP + Notice photos. Account: board@fam.com / secret123 (navigate IN-APP; dismiss first-load affection overlay). BACKEND: (1) POST /api/events/{id}/rsvp {status:'going'} by an INVITED member returns rsvp_summary/my_rsvp; a NON-invited member gets 403; invalid status -> 400. (2) POST /api/notices with {photo_url:'https://...'} persists and GET /api/notices returns photo_url. FRONTEND: RSVP already screenshot-verified (Going pill fills, summary updates) — just re-confirm no regression on the Calendar tab. For notice photos, create a note WITH a photo (set photo_url via API is fine) and confirm the image renders on the board list, the note detail, and the Home noticeboard preview thumbnail; also confirm the 'Attach a photo' button (notice-photo) appears in the create modal. Do NOT retest unrelated older features."

# ============ Feature Batch #16 (Recurring Events + Notice "Seen by" + Trusted Emergency Access) ============
backend_batch16:
  - task: "Recurring events (weekly/monthly, count or until date; edit/delete whole series)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "EventIn gains repeat(none|weekly|monthly), repeat_end_date, repeat_count. create_event generates concrete occurrence docs sharing a series_id (weekly=+7d, monthly=_add_months handling short months; cap: count, else 52 if until set, else 12). PATCH applies non-date fields to the whole series (keeps each occurrence's date); DELETE removes the whole series. build_event_ics adds an RRULE (FREQ=WEEKLY|MONTHLY; COUNT or UNTIL) so the single emailed .ics covers the recurrence. hydrate_event returns repeat. Verified via curl: weekly count=4 -> 4 occurrences; monthly count=3 -> Jan31/Feb28/Mar31; delete one -> whole series gone; ICS carries RRULE;UNTIL."
  - task: "Notice 'Seen by' tracking (POST /api/notices/{id}/seen + seen_count/seen_members in hydrate + home)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "notices store seen_by[] member_ids. POST /api/notices/{id}/seen $addToSet (idempotent) the current member. _hydrate_notice returns seen_count, seen(bool for me), seen_members[] cards. GET /api/home notices preview includes seen_count. Verified via curl: seen -> count 1 members [Board Demo]; seen again -> still 1; home preview seen_count 1."
  - task: "Trusted Emergency Access delegates (grant adult view-only access to all children's vault/medical)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "emergency_delegates collection. GET/POST/DELETE /api/emergency/delegates (parents/admin only; POST 400 for a child target, 404 unknown). _secure_viewer attaches _emergency_delegate + _child_member_ids; _can_view_secure grants view (NOT edit) to a delegate for vault items owned-by/covering a child. Used in vault_folders/items/expiries/get_vault_item. Medical GET was already family-wide readable. Verified via curl: grant Priya (201) -> listed; grant child -> 400; revoke -> 200/empty."

frontend_batch16:
  - task: "Recurring events UI in event create + repeat badge on calendar"
    implemented: true
    working: "NA"
    file: "frontend/app/event/create.tsx, frontend/app/(tabs)/calendar.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Create modal: Repeat chips (repeat-none/weekly/monthly). When repeating, a box with mode toggle (repeat-mode-count / repeat-mode-until): count stepper (repeat-count-minus/plus) OR until-date stepper (repeat-until-prev/next). Sends repeat + repeat_count|repeat_end_date. Calendar event card shows a 🔁 Weekly/Monthly badge for series events. Deleting a series event removes the whole series (backend cascade)."
  - task: "Notice 'Seen by' UI (expandable list on detail, count on board)"
    implemented: true
    working: "NA"
    file: "frontend/app/notice/[id].tsx, frontend/app/notice/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Opening a note detail POSTs /seen. Detail shows 'Seen by N' (notice-seen-toggle) that expands to a member list (notice-seen-list). Board card footer shows an eye + count when seen_count>0."
  - task: "Trusted Emergency Access screen (/emergency/access)"
    implemented: true
    working: "NA"
    file: "frontend/app/emergency/access.tsx, frontend/app/emergency/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Emergency hub grid adds 'Trusted Access' (emergency-access). Screen lists adult relatives (children + self excluded) each with a Switch (access-toggle-<id>); ON -> POST delegate, OFF -> DELETE. Non-parents see a read-only message. Intro explains view-only access to children's medical + insurance."

agent_communication_batch16:
    -agent: "main"
    -message: "Batch #16 = Recurring Events + Notice 'Seen by' + Trusted Emergency Access. Account: board@fam.com / secret123 (navigate IN-APP; dismiss first-load affection overlay; the only real logged-in user is Raj/admin). BACKEND to test: (1) POST /api/events with repeat='weekly'&repeat_count=4 -> creates 4 events sharing series_id (GET /events?start=&end= to see them); repeat='monthly'&repeat_count=3 spans short months (Jan31->Feb28->Mar31); repeat_end_date instead of count bounds by date; DELETE one occurrence removes the whole series; GET /events/{id}/invite.ics contains an RRULE line. (2) POST /api/notices/{id}/seen adds caller to seen_by (idempotent); GET /notices/{id} returns seen_count+seen_members+seen(bool); /api/home notices carry seen_count. (3) /api/emergency/delegates GET/POST/DELETE (parents-only; POST a child -> 400; POST unknown -> 404); after granting, a delegate viewer can VIEW (not edit) vault items owned-by/covering a child even if visibility=parents. FRONTEND to test (in-app nav): (a) Calendar FAB -> New Event -> set Repeat=Weekly -> choose 'End after N times' stepper (repeat-count-plus) or 'End on a date' -> Save -> the event appears on multiple weeks with a 🔁 Weekly badge; delete one -> all gone. (b) Open a noticeboard note detail -> a 'Seen by 1' row (notice-seen-toggle) expands to show who viewed; board card shows an eye+count. (c) More > Protect > Emergency Center -> Trusted Access (emergency-access) -> toggle an adult relative ON (access-toggle-<id>) then OFF. Do NOT retest unrelated older features."

# ============ Feature Batch #17 (Home Emergency Pin + Skip Occurrence + Emergency Info shortcut + RSVP Reminders) ============
backend_batch17:
  - task: "Home active_sos + auto Emergency pin in /api/home"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "/api/home now returns active_sos[] (hydrated) and, when an SOS is active, needs_attention[0] is a high-priority 'SOS' card (route /emergency). Frontend floats the Emergency card to the top when active_sos or vault_expiring is non-empty. Verified via curl: trigger SOS -> active_sos len 1, needs_attention[0].key='sos'; resolve -> 0."
  - task: "Skip a single occurrence of a recurring event (DELETE ?scope=single|series)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "DELETE /api/events/{id}?scope=single removes just that occurrence; scope=series (default) removes the whole series. Verified via curl: weekly x4 -> delete one with scope=single -> 3 remain; scope=series -> 0 remain."
  - task: "RSVP reminders (awaiting list in hydrate_event + POST /api/events/{id}/nudge)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "hydrate_event returns awaiting[] (invited members with no RSVP) + awaiting_count. POST /api/events/{id}/nudge (owner or parent/admin only, else 403) posts a gentle reminder into the family chat mentioning the awaiting members + best-effort push to them; returns {nudged, names}, excluding the host. Verified via curl: awaiting_count=3; after owner RSVPs going, nudge -> nudged=2 (Priya, Aarav), family chat last_message='⏰ RSVP reminder'."

frontend_batch17:
  - task: "Home auto-pinned/urgent Emergency card"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "order memo floats 'emergency' to the top when home.active_sos or home.vault_expiring is non-empty (injected even for child persona). EmergencySection shows a red 'Active SOS' variant (member needs help) or 'N documents expiring soon' subtitle; else the normal Emergency Center card. testID home-emergency unchanged."
  - task: "Skip-occurrence delete choice on Calendar"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/calendar.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Deleting a recurring event (repeat!='none') opens a modal: 'Just this one' (del-scope-single -> DELETE ?scope=single) or 'All events in the series' (del-scope-series -> scope=series) or Cancel (del-scope-cancel). Non-recurring events delete immediately as before."
  - task: "RSVP reminder row on event cards"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/calendar.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "For a host (owner or admin/parent), an event with awaiting_count>0 shows '⏳ Waiting on <names>' + a 'Remind' button (rsvp-nudge-<eventId>) that calls /nudge and shows a toast (calendar-toast). "
  - task: "Emergency Info shortcut on member profile"
    implemented: true
    working: "NA"
    file: "frontend/app/member/[id].tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Member profile adds an 'Emergency Info 🚑' button (member-emergency-info) -> /emergency/medical/<member_id> (that member's medical card)."

agent_communication_batch17:
    -agent: "main"
    -message: "Batch #17 = Home Emergency Pin + Skip Occurrence + Emergency Info shortcut + RSVP Reminders. Account: board@fam.com / secret123 (in-app nav; only Raj/admin is logged in). BACKEND: (1) trigger POST /api/emergency/sos -> GET /api/home has active_sos[] + needs_attention[0].key='sos'; resolve -> gone. (2) create recurring event (repeat=weekly,repeat_count=4); DELETE /api/events/{id}?scope=single leaves 3; scope=series removes all. (3) GET /events returns awaiting/awaiting_count; POST /api/events/{id}/nudge (host only, 403 otherwise) returns {nudged,names} and posts '⏰ RSVP reminder' to family chat (excludes host + members who already RSVP'd). FRONTEND (in-app nav, log in first, dismiss affection overlay): (a) After triggering an SOS from Emergency, Home shows the Emergency card floated to top in a red 'Active SOS' state; (b) Calendar: delete a 🔁 recurring event -> modal 'Just this one'(del-scope-single) / 'All events'(del-scope-series); (c) On an event you host with people who haven't replied, a '⏳ Waiting on…' row + 'Remind' (rsvp-nudge-<id>) shows a toast; (d) Member profile has 'Emergency Info 🚑' (member-emergency-info) -> medical card. Do NOT retest unrelated older features."

# ============ Feature Batch #18 (Medical Quick View on Emergency screen) ============
backend_batch18:
  - task: "GET /api/emergency/medical — quick medical list (blood group + allergies)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "New fixed route declared BEFORE /emergency/medical/{member_id}. Returns per-member {member card, blood_group, allergies, has_card}, members with real info sorted first. Verified via curl: Board Demo B+, Aarav O+/Peanuts, others null."
frontend_batch18:
  - task: "Medical at a Glance section on Emergency hub"
    implemented: true
    working: true
    file: "frontend/app/emergency/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "SCREENSHOT-VERIFIED in-app: Emergency screen shows 'MEDICAL AT A GLANCE' with member rows (blood-group badge + ⚠ allergies), tap (medquick-<id>) -> full medical card. Only members with blood_group or allergies shown. Self-tested (curl + screenshot) — small single-screen additive change, no testing agent needed."
agent_communication_batch18:
    -agent: "main"
    -message: "Batch #18 = Medical Quick View. GET /api/emergency/medical curl-verified; Emergency hub 'Medical at a Glance' screenshot-verified in-app (Board Demo B+, Aarav O+ Peanuts). Small additive change, self-tested."

# ============ Feature Batch #19 (App Store / Play Store compliance essentials) ============
backend_batch19:
  - task: "DELETE /api/auth/account — in-app account deletion (Apple 5.1.1(v))"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Organizer (role=admin): purges every collection by family_id + families doc + dashboard_prefs of all family users. Member-only: deletes just their user + linked member + prefs. Auth token invalid afterwards. Verified via curl with THROWAWAY accounts (never the demo family): self-delete -> scope 'self', me=401, email reusable; admin+family+data -> scope 'family', me=401. Demo family board@fam.com untouched."
frontend_batch19:
  - task: "Support & Legal in More + Privacy/Terms/Support/Account screens + version"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/more.tsx, frontend/app/legal/{privacy,terms,support}.tsx, frontend/app/account/index.tsx, frontend/src/components/LegalPage.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "More tab adds 'Support & Legal' section: Help & Support (mailto info@easemyai.com), Account & Data, Privacy Policy, Terms of Use + 'FamilyHome v1.0.0 · by Ease My Ai Pvt Ltd' footer. Account & Data (SCREENSHOT-VERIFIED in-app) shows name/email/version + Danger Zone Delete Account with a type-DELETE confirm modal (organizer sees whole-family warning), then logs out. Publisher Ease My Ai Pvt Ltd, contact info@easemyai.com, governing law India. Self-tested (curl + screenshot)."
agent_communication_batch19:
    -agent: "main"
    -message: "Batch #19 = store-compliance essentials (Privacy Policy, Terms of Use, Help & Support, in-app Account Deletion, app version). Backend delete curl-verified both scopes with isolated throwaway accounts. Account & Data screen screenshot-verified in-app. NOTE for user: stores also need a PUBLIC Privacy Policy URL in the listing console (offer to export a hostable HTML page)."

# ============ Feature Batch #20 (Data Export + Hostable Policy Pages + Medical on SOS) ============
backend_batch20:
  - task: "GET /api/family/export (organizer-only full JSON copy)"
    implemented: true
    working: true
    file: "backend/server.py"
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Admin-only (403 otherwise). Iterates all collections by family_id (31 for demo), strips password_hash from users, returns {app,publisher,exported_at,family,collections}. Curl-verified: 31 collections, no password_hash leaked."
  - task: "Public hostable legal pages GET /api/legal/privacy & /api/legal/terms (no auth, HTML)"
    implemented: true
    working: true
    file: "backend/server.py"
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Self-contained styled HTML (publisher Ease My Ai Pvt Ltd, contact info@easemyai.com). Public (no auth) so they work as store-listing Privacy/Terms URLs. In production: https://our-story-191.emergent.host/api/legal/privacy and /api/legal/terms. Curl-verified HTML output."
  - task: "Medical (blood group + allergies) on SOS alert"
    implemented: true
    working: true
    file: "backend/server.py"
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "trigger_sos snapshots blood_group+allergies; active_sos + home active_sos hydrate them (fallback to current medical card). Curl-verified: sos blood_group B+."
frontend_batch20:
  - task: "Export My Data button on Account & Data"
    implemented: true
    working: true
    file: "frontend/app/account/index.tsx"
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Organizer-only 'YOUR DATA' card -> Export My Data (export-data-btn). Native: writes JSON to cache (expo-file-system File API) + Sharing.shareAsync. Web: Blob download. Toast feedback. expo-sharing installed. Native file share only testable on a real device/build."
  - task: "Medical chips on SOS banner + Home subtitle"
    implemented: true
    working: true
    file: "frontend/app/emergency/index.tsx, frontend/app/(tabs)/index.tsx"
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "SCREENSHOT-VERIFIED: active SOS banner shows a blood-group chip (B+) + allergies chip; Home urgent Emergency subtitle appends '· Blood B+'. Self-tested (curl+screenshot)."
agent_communication_batch20:
    -agent: "main"
    -message: "Batch #20 = Data Export + Hostable Policy Pages + Medical on SOS. All backend curl-verified; SOS banner + medical chips screenshot-verified in-app (B+). Public legal URLs in prod: /api/legal/privacy & /api/legal/terms. Native data-export file share only fully testable on device/build."

# ============ Security Audit + Fixes (iteration_18) ============
security_batch:
  - task: "SEC-001 (HIGH) — /api/register-push now requires auth + binds to caller"
    implemented: true
    working: true
    file: "backend/server.py"
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Added Depends(get_current_user); ignores client body user_id, uses authenticated caller's user_id. Testing agent: no-auth=401 (fixed), authed non-401 (500 only due to placeholder EMERGENT_PUSH_KEY in preview, expected)."
  - task: "SEC-002 (MEDIUM) — /api/files/{path} family-scoped (BOLA fix)"
    implemented: true
    working: true
    file: "backend/server.py"
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "upload stores family_id on media; serve_file rejects cross-family (legacy media backfills owner->family). Testing agent: same-family=200, no-auth=401, cross-family=404, web ?token= path=200."
  - task: "SEC-003 (MEDIUM) — long-lived JWT removed from image URLs on native"
    implemented: true
    working: true
    file: "frontend/src/lib/api.ts, frontend/src/components/ui/SmartImage.tsx"
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "New mediaImageSource(): native uses Authorization request header (token no longer in URL); web keeps ?token= (<img> can't set headers). SmartImage updated. Testing agent: 0 broken imgs across Home/Family/Profile. NOTE: audio (expo-audio) + documents opened via Linking.openURL still use mediaUrl(?token=) by necessity (external openers); acceptable, smaller surface."
  - task: "P3 — POST /api/families/members restricted to admin/parent"
    implemented: true
    working: true
    file: "backend/server.py"
    priority: "low"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Added role check. Testing agent: admin add=200."
security_deferred_notes:
    -agent: "main"
    -message: "Deliberately NOT changed (low risk / would risk breaking preview+prod): CORS allow_origins='*' with bearer (not cookie) auth — P3, low impact; no rate limiting on /auth/login|register — P3 (needs middleware); message react/reply chat-membership scoping — P3 own-family-only. Recommend a future signed-URL / short-lived media-token scheme to also cover web image URLs + documents + audio (SEC-003 residual)."
agent_communication_security:
    -agent: "main"
    -message: "Security audit CONDITIONAL PASS -> fixed SEC-001/002/003 + P3 member-add. Verified by testing agent (iteration_18): 13/13 backend + frontend image regression clean. Deferred P3 CORS/rate-limit/chat-scoping noted."

# ============ Batch #21 (Signed Media Links + Login Rate Limiting + Push Notification option) ============
backend_batch21:
  - task: "Login brute-force rate limiting (MongoDB-backed per-email + per-IP lockout)"
    implemented: true
    working: true
    file: "backend/server.py"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "POST /api/auth/login now throttled: 5 failed attempts/email -> 429 (10-min lock); 30/IP -> 429 (5-min lock); TTL collection auth_throttles (expireAfterSeconds index). Dummy bcrypt hash used for unknown emails (timing). Success clears both keys. Curl-verified: 5x401 then 429 with Retry-After~599; valid login unaffected; recovers after a single wrong attempt+correct."
  - task: "Short-lived media token (signed media links) — removes long-lived JWT from media URLs"
    implemented: true
    working: true
    file: "backend/server.py"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "make_media_token (scope='media', family_id, 7d) returned by GET /api/auth/me. get_current_user REJECTS scope=media (401) so it can't hit the API. serve_file does its own decode: accepts a media token (family from token) OR a full user token (family via user lookup), then family-scopes. Curl-verified: /auth/me returns media_token; media token on /home=401; file fetch via ?token=<media_token>=200; full-token header fetch=200."
  - task: "register-push binds to caller (from Batch security) unaffected by media-token change"
    implemented: true
    working: true
    file: "backend/server.py"
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Unchanged; still requires auth. In preview returns 500 (placeholder EMERGENT_PUSH_KEY) which is expected."
frontend_batch21:
  - task: "Media token wiring (api.ts mediaUrl/mediaImageSource + AuthContext)"
    implemented: true
    working: true
    file: "frontend/src/lib/api.ts, frontend/src/auth/AuthContext.tsx, frontend/src/components/ui/SmartImage.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "AuthContext.applyMe stores media_token via setMediaToken (cleared on logout). mediaUrl (audio/docs) + mediaImageSource(web) use the media token in ?token= (fallback authToken); native images use Authorization header (token never in URL). SCREENSHOT: Home images 10 total / 0 broken (no regression)."
  - task: "Notifications settings screen + More > Preferences > Notifications"
    implemented: true
    working: true
    file: "frontend/app/settings/notifications.tsx, frontend/app/(tabs)/more.tsx, frontend/src/lib/push.ts, frontend/app.json"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "SCREENSHOT-VERIFIED on web: Notifications screen shows status card + 'YOU'LL BE NOTIFIED ABOUT' list; web shows 'Available in the mobile app'. push.ts split: registerForPush (silent, only if already granted — no login prompt), enablePush (contextual request w/ granted/denied/blocked), getPushStatus. Toggle On -> enablePush; blocked -> Open Settings (Linking). app.json android.googleServicesFile added. Real push delivery needs google-services.json + deploy + device build."
agent_communication_batch21:
    -agent: "main"
    -message: "Batch #21. Login: board@fam.com/secret123 (NOTE: 5 wrong logins/email now => 429 for 10 min; use correct creds). BACKEND to verify: (1) login rate limit 429 after 5 wrong (use a THROWAWAY email so you don't lock board), Retry-After header present, valid login still 200, successful login resets; (2) media token: GET /api/auth/me returns media_token; that media_token used as Bearer on /api/home => 401; GET /api/files/{path}?token=<media_token> => 200; normal endpoints still work with the full token. (3) regression: normal login/me/home/events/notices/vault still OK. FRONTEND: More > Preferences > Notifications (more-notifications) opens a screen; on WEB it shows 'Available in the mobile app' (push is native-only). Confirm images/avatars still load everywhere (media-token change). Do NOT retest unrelated older features. Native push delivery can't be tested on web/preview."

# ============ Security Audit #2 + Fixes (re-hardening) ============
security_batch2:
  - task: "SEC-001b — serve_file now enforces Vault per-item visibility (_can_view_secure)"
    implemented: true
    working: true
    file: "backend/server.py"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "serve_file resolves the live user (both media + full tokens carry user_id), family-scopes, and if the path belongs to a vault_items.files[].url it re-applies _can_view_secure via _secure_viewer (delegate-aware). Prevents an in-family member from fetching a parents-only Vault file by direct URL. Curl: admin fetch 200, media-token fetch 200 (no regression). Non-parent-denied path relies on _can_view_secure (already 403-tested on vault metadata)."
  - task: "SEC-002b — login lockout DoS hardening (email+IP key, XFF-aware, no global IP lock)"
    implemented: true
    working: true
    file: "backend/server.py"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "_client_ip now uses left-most X-Forwarded-For (k8s ingress) so distinct clients don't collapse onto a shared peer IP. Lockout keyed on acct:{email}:{ip} only (removed the global per-IP 30-fail lock that could block all sign-ins; removed IP_LOCK/IP_LIMIT). Curl: 5x401->429 from ipA; SAME email from ipB still 401 (not locked) => targeted-DoS defended; board valid login 200; recovers on success."
  - task: "P3 — media URLs never fall back to the long-lived login token"
    implemented: true
    working: true
    file: "frontend/src/lib/api.ts"
    priority: "low"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "mediaUrl + mediaImageSource(web) now use mediaToken || '' (dropped authToken fallback). Native images still use Authorization header (full token, not in URL). media_token is populated on /auth/me at app open before screens render."
agent_communication_security2:
    -agent: "main"
    -message: "Security Audit #2 re-hardening. Verify (BACKEND): (1) Login throttle keyed on email+IP with XFF: send POST /api/auth/login with header X-Forwarded-For: 11.11.11.11 + a FAKE email + wrong pw 5x -> 6th=429 (Retry-After); the SAME fake email with X-Forwarded-For: 22.22.22.22 must be 401 (NOT 429) — proves a victim isn't locked from another network + no global lock; board@fam.com/secret123 valid login stays 200; success clears the lock. (2) serve_file still serves files to the owning family (admin token + media token both 200), no-token=401, cross-family=404 (register a throwaway user + POST /api/families, then DELETE /api/auth/account to clean up). (3) media token still rejected on normal APIs (Bearer media_token on /api/home => 401). REGRESSION (FRONTEND): images/avatars still load on Home/Family/Profile (media-token-only web URLs). Do NOT brute-force board's real email. Do NOT retest unrelated features."

# ============ Batch #22 — Members: Joined/Pending + Admin add/remove + Invite link/WhatsApp ============
batch22:
  - task: "Members joined-vs-pending + viewer role on GET /api/families/me"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "GET /families/me now annotates each member with joined(bool)=has linked_user_id and is_me, and returns viewer_member_id, viewer_role, can_manage(admin/parent). Curl-verified: admin sees can_manage true, joined flags correct."
  - task: "DELETE /api/families/members/{id} — admin/parent removes a member"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Admin/parent only (403 otherwise). Can't remove self (400) or an admin member (403). Joined members are unlinked (users.family_id=None) then member doc deleted; pending members just deleted. Curl: self=400, pending remove=200, count 8->7."
  - task: "Family tab: Joined/Pending badges, Manage mode + remove modal, invite card"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/family.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "SCREENSHOT-VERIFIED (web, testdad): green Joined / amber Pending pills under each member; Manage + Add shown to admins; in Manage mode removable members show a red x -> confirm modal -> DELETE. Invite card shares link+code."
  - task: "Add member success -> Invite via WhatsApp / Share link; deep-link auto-fill code"
    implemented: true
    working: "NA"
    file: "frontend/app/member/add.tsx, frontend/src/lib/invite.ts, frontend/app/join.tsx, frontend/src/auth/AuthContext.tsx, frontend/app/onboarding/create-family.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "After adding a member, a success view offers 'Invite via WhatsApp' (whatsapp:// -> wa.me -> Share fallback) and 'Share invite link'. Link = Linking.createURL('/join',{invite:CODE}); app/join.tsx + AuthContext capture ?invite= into storage; onboarding pre-fills Join mode. Deep-link auto-fill + WhatsApp only fully work on a native build (not web/Expo Go)."
agent_communication_batch22:
    -agent: "main"
    -message: "Batch #22. Use a FRESH account: register tester+<rand>@fam.com/secret123, then tap 'Explore the Sharma Family' (try-demo-btn) to seed a demo family where you are the ADMIN (Raj). Do NOT disturb shared demo accounts. BACKEND to verify: (1) GET /api/families/me returns per-member joined + is_me and top-level can_manage/viewer_role (admin=true). (2) DELETE /api/families/members/{id}: as admin, removing a PENDING member (linked_user_id null) => 200 and member count drops; removing SELF => 400; removing an admin member => 403. (3) Non-admin auth: a member whose role is child/adult must get 403 on DELETE (you can PATCH a member's role to 'adult' won't help since it's not linked; instead just assert the 403 branch by calling DELETE without admin/parent — e.g. there is only one linked admin in a fresh demo, so this branch is covered by code review; do a best-effort). FRONTEND to verify: Family tab shows green 'Joined' vs amber 'Pending' pills; admin sees 'Manage' + '+ Add'; tapping Manage shows red x on removable members; tapping x opens a confirm modal; confirming removes the member and the list refreshes. Add flow: '+ Add' -> fill name -> Add Member -> success screen with 'Invite via WhatsApp' + 'Share invite link' + 'Done'. NOTE: deep-link auto-fill of the code and the WhatsApp launch can't be exercised on web/Expo Go — just confirm the buttons render and don't crash. Do NOT retest unrelated older features."

# ============ Batch #23 — Auto-link invites + Role editing + Resend invite ============
batch23:
  - task: "Auto-link invites: GET /api/families/preview + POST /api/families/join {claim_member_id}"
    implemented: true
    working: "NA"
    file: "backend/server.py, frontend/app/onboarding/create-family.tsx, frontend/app/join.tsx, frontend/src/auth/AuthContext.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "GET /families/preview?code= returns family_name + pending_members (linked_user_id null). join now accepts claim_member_id: links that pending member to the joiner (no duplicate) instead of creating a new one. Onboarding Join is now 2-step: enter code -> Continue (preview) -> pick 'which one is you' from pending profiles or 'I'm a new member' -> Join. Deep-link auto-fills the code and jumps to the claim step. Curl-verified: preview lists 4 pending; claiming Priya -> count stays 5, Priya joined=true & is_me for joiner."
  - task: "Role editing from Family tab (PATCH /api/families/members/{id} role)"
    implemented: true
    working: "NA"
    file: "backend/server.py, frontend/app/(tabs)/family.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "MemberPatch gained role; PATCH now admin/parent-only for role, limited to parent/child/adult, admin role protected, is_child kept in sync. Family tab Manage mode: each non-admin member shows a … badge -> tapping opens an actions modal with a Role segmented control (Parent/Child/Adult). Curl: child->adult 200 (is_child false), invalid role 400, admin target 403, parent caller 200. SCREENSHOT: actions modal renders."
  - task: "Resend invite from member actions modal (pending members)"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/family.tsx"
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "The member actions modal shows a RESEND INVITE section for PENDING members: 'Invite via WhatsApp' + 'Share invite link' (reuses the family invite code via src/lib/invite.ts, web-safe). SCREENSHOT-VERIFIED on web (Priya modal)."
agent_communication_batch23:
    -agent: "main"
    -message: "Batch #23 (follow-ups to Batch #22). Use FRESH accounts. BACKEND: (A) register admin + POST /api/seed/demo -> GET /api/families/invite for the code. (B) register a 2nd user (no family), GET /api/families/preview?code=CODE => 200 with family_name + pending_members; POST /api/families/join {code, claim_member_id: <a pending member id>} => 200; then GET /api/families/me as the joiner: member COUNT is unchanged (no duplicate) and the claimed member now has joined=true & is_me=true. Also join with claim_member_id=null creates a brand-new member (count+1). (C) Role: PATCH /api/families/members/{id} {role:'adult'} as admin => 200 (is_child false); {role:'superadmin'} => 400; changing the admin member's role => 403. FRONTEND: (1) Onboarding Join is 2-step: Join a family -> enter code -> Continue -> a 'Which one is you?' list of pending profiles + 'I'm a new member' -> Join Family. (2) Family tab (admin) -> Manage -> tap a non-admin member's … badge -> actions modal: change Role via Parent/Child/Adult chips (persists after reopening), 'Invite via WhatsApp' + 'Share invite link' appear for PENDING members only, 'Remove from family' -> confirm removes. Curl already verified all backend paths; focus on the onboarding claim UI + role change persistence. Deep-link/WhatsApp launch are native-only (can't run on web). Do NOT retest unrelated features."

# ============ Batch #24 — Accessibility Phase 1 (text size, contrast, buttons, motion) ============
batch24_a11y:
  - task: "Accessibility & Display settings screen + global prefs (ThemeContext)"
    implemented: true
    working: "NA"
    file: "frontend/app/settings/accessibility.tsx, frontend/src/theme/ThemeContext.tsx, frontend/src/theme/tokens.ts, frontend/app/(tabs)/more.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New More > Preferences > Accessibility & Display screen: Text Size (Default 1x / Large 1.2x / Extra Large 1.45x), High Contrast, Larger Buttons, Reduce Motion, Show Text With Icons. Prefs persisted per-key in storage and exposed via useTheme(). SCREENSHOT-VERIFIED: Extra Large scales text app-wide + reflows; High Contrast darkens text/borders."
  - task: "Global text scaling (AppText) + button min-height/a11y labels (Button)"
    implemented: true
    working: "NA"
    file: "frontend/src/components/ui/AppText.tsx, frontend/src/components/ui/Button.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "AppText multiplies size by textScale (system Dynamic Type still applies via default allowFontScaling). Button now min-height 48 (56 in Larger Buttons mode) + accessibilityRole/label/state. Shared components used across the whole app — regression check needed."
  - task: "Reduce Motion on Send Love animation + friendly login error"
    implemented: true
    working: "NA"
    file: "frontend/src/components/AffectionAnimation.tsx, frontend/app/(auth)/login.tsx"
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "AffectionAnimation skips particles + uses a simple fade when Reduce Motion is on. Login shows a friendly message on 401/429 instead of a raw error."
agent_communication_batch24_a11y:
    -agent: "main"
    -message: "Batch #24 Accessibility Phase 1 (FRONTEND ONLY, no backend changes). Login testdad@fam.com/secret123. VERIFY: (1) More > Preferences > Accessibility & Display (testID more-accessibility) opens; Text Size chips text-size-1 / text-size-1.2 / text-size-1.45 change the preview + app-wide text; toggles toggle-contrast, toggle-large-buttons, toggle-reduce-motion, toggle-icon-labels flip. (2) PERSISTENCE: set Extra Large + High Contrast, navigate away (Home) and back — settings remain selected; text stays enlarged on Home/More. (3) High Contrast noticeably darkens text/borders (light) and brightens (dark). (4) Larger Buttons makes primary buttons taller (min-height 56). (5) REGRESSION: Home, Family, Calendar, Chat, Send Love still render and are usable at Default settings AND at Extra Large (check for major overlap/clipping only — minor wrapping is expected/acceptable). (6) Login: entering a wrong password shows the friendly 'We couldn't sign you in...' message (testID login-error), not a raw error. (7) Send Love still completes with Reduce Motion ON (no crash; animation simplified). Do NOT retest backend or unrelated features."

# ============ Batch #25 — A11y Phase 2 + Kids Mode + Grandparent (Simple) Home ============
batch25_a11y2:
  - task: "Grandparent Simple Home (opt-in) + toggle"
    implemented: true
    working: "NA"
    file: "frontend/src/components/home/SimpleHome.tsx, frontend/src/theme/ThemeContext.tsx, frontend/app/settings/accessibility.tsx, frontend/app/(tabs)/index.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New 'Simple Home' toggle in Accessibility (HOME LAYOUT). When ON, Home tab renders a large-button 6-tile grid: Family Calendar, Messages, Send Love, Memories, Birthdays, Emergency. SCREENSHOT-VERIFIED: toggle -> Home shows the grid; each tile navigates. Toggling off restores the full dashboard."
  - task: "Kids Mode home for child-role accounts + hide More tab"
    implemented: true
    working: "NA"
    file: "frontend/src/components/home/KidsHome.tsx, frontend/app/(tabs)/index.tsx, frontend/app/(tabs)/_layout.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "When the logged-in user's member is a child (is_child || role==='child'), Home renders KidsHome: greeting, Today, My Chores (big check toggles via existing chore toggle), Quick Actions (Hug parents / Send Love / Family Chat / My Wishlist). Tab bar hides the 'More' tab for child accounts (viewer_role==='child'). NOT yet screenshot-verified (needs a child account)."
  - task: "A11y Phase 2 screen-reader labels + tab labels"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/index.tsx, frontend/app/(tabs)/_layout.tsx, frontend/app/emergency/index.tsx, frontend/app/chat/[id].tsx, frontend/app/(tabs)/calendar.tsx, frontend/app/vault/index.tsx, frontend/app/chores/index.tsx"
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Added accessibilityRole/label/state to icon-only controls: Home header (search/customize/chat/profile), tab bar buttons (selected state + unread), Emergency (SOS/call/back), Chat (send/mic/attach/back), Calendar (prev/next month, add-event FAB), Vault (back/lock/add), Chores (back/add/toggle checkbox/delete)."
agent_communication_batch25_a11y2:
    -agent: "main"
    -message: "Batch #25 (FRONTEND ONLY; no backend changes). GRANDPARENT SIMPLE HOME: login testdad@fam.com/secret123 -> tab-more -> more-accessibility -> toggle-simple-home ON -> a11y-back -> tab-index: Home shows a 6-tile large-button grid (simple-tile-family/messages/send/memories/birthdays/emergency). Each tile navigates (e.g., simple-tile-family -> calendar). Toggle OFF restores the full dashboard. KIDS MODE (needs a child account — set up via API/UI): (a) login testdad and GET /api/families/invite for the code; (b) register a NEW user kidtest+<rand>@fam.com/secret123; (c) on onboarding Join a family, enter the code -> Continue -> pick a CHILD pending profile (e.g., 'Aarav' or 'Anaya') -> Join. Now that account's member is a child. VERIFY: Home shows KidsHome (Hi <name>, Today, My Chores with big check toggles kids-chore-<id>, Quick Actions kids-send-love/kids-chat/kids-wishlist and kids-hug-<parentId>); the bottom tab bar has NO 'More' tab (tab-more absent) for this child account; toggling a chore updates count and does not crash. A11Y LABELS: spot-check that icon-only controls expose accessibility labels (Home header home-search/home-customize/home-chat/home-avatar; Emergency sos-button/emergency-back/call-<id>; Chat chat-send-btn/chat-mic-btn/chat-image-btn/conv-back; Calendar cal-prev/cal-next/fab-create-event; Vault vault-back/vault-lock-btn/vault-add-btn; Chores chores-back/toggle-add-chore/chore-toggle-<id>/chore-del-<id>). REGRESSION: normal adult (testdad) Home dashboard still renders and is usable with Simple Home OFF. Do NOT retest backend or unrelated features."

# ============ Batch #26 — Security audit remediation (BOLA + invite preview + CORS) ============
batch26_sec:
  - task: "SEC-001 fix: family-scope all shopping & todo item routes (BOLA)"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Added family_id to every shopping_items / todo_items find/update/delete + list-delete cascades. Curl: user in family B toggling family A's item -> 404; A's item survives (A toggle 200). Same-family CRUD unaffected."
  - task: "SEC-002 fix: invite preview hardening"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Invite codes now 10 hex chars (new_invite_code); GET /families/preview drops children's photo_url and is rate-limited per user (20 / 10 min -> 429). Curl-verified: child photo null, 20x200 then 429."
  - task: "CORS hardening: allow_credentials=False (bearer-token auth, no cookies)"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "low"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Removed wildcard-origin + credentials combination; app auths via Authorization header, not cookies."
agent_communication_batch26_sec:
    -agent: "main"
    -message: "Batch #26 security remediation (BACKEND ONLY). Please REGRESSION-test that legitimate SAME-FAMILY flows still work AND cross-family access is blocked. Use testdad@fam.com/secret123 (family A) and a fresh registered user who runs POST /api/seed/demo (family B). VERIFY: (1) Shopping: A creates /api/shopping/lists then an item; A can GET items, toggle (200), delete (200). B CANNOT toggle A's item (404) and B deleting A's item does NOT remove it (item still togglable by A afterward). (2) Todos: same pattern with /api/todos/lists + items — same-family toggle/delete OK, cross-family toggle 404 and no cross-family deletion. (3) Invite/join still works: GET /api/families/invite (200), GET /api/families/preview?code=CODE (200, children have photo_url null), and preview returns 429 after ~20 rapid calls in 10 min. (4) POST /api/families/join with claim_member_id still links a pending profile (no duplicate). (5) Auth sanity: login 200, wrong password 401. Do NOT retest unrelated features or frontend."

# ============ Batch #27 — Responsive layout & alignment pass ============
batch27_responsive:
  - task: "Fixed-width/absolute anti-patterns removed; important titles wrap"
    implemented: true
    working: true
    file: "frontend/src/components/VaultGate.tsx, frontend/src/components/PostCard.tsx, frontend/app/post/[id].tsx, frontend/src/components/AffectionAnimation.tsx, frontend/app/vault/index.tsx, frontend/app/(tabs)/index.tsx, frontend/app/(tabs)/calendar.tsx"
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "VaultGate PIN keypad was fixed width 300 (overflowed 320px) -> now width 100% / maxWidth 340 with 30% keys. PostCard & post/[id] & AffectionAnimation switched from module-level Dimensions.get to useWindowDimensions (resize-safe images/particles). Wrapped important titles to 2 lines (Home needs-attention + Today event, Vault folder/expiry names, Calendar 'waiting on'). Verified: Home has NO horizontal overflow at 320 and 430 (scrollWidth==clientWidth), reflows cleanly."
        -working: true
        -agent: "testing"
        -comment: "iteration_26: FULL multi-width responsive audit PASS. 3 widths (320x640, 390x844, 430x932) x ~18 screens = 54+ measurements, ALL pass (0 horizontal document overflow, 0 ellipsis-clipped important text). Vault PIN keypad fits fully at 320 (3-col grid + backspace). Family Members / Home Quick Actions / Emergency shortcuts / Vault folders grids all fit at 320. Extra Large text (1.45x) audit at 320/390 on Home/Calendar/Family/More: 0 doc overflow, title wraps as expected (acceptable), header icons stay on-row, bottom-tab labels single-line. Informational-only (NOT bugs): home-chat unread badge overshoots its 36px icon by 3px (intended notification badge, inside viewport); Add Event end-time-input DOM reports right=387 but ancestor overflow:hidden clips it and docSW stays 320 (RNW measurement artifact — the field is a flex:1 half-row column, correctly constrained). No fixes required."
agent_communication_batch27_responsive:
    -agent: "main"
    -message: "Batch #27 RESPONSIVE QA (FRONTEND ONLY). Please do a MULTI-WIDTH visual responsive audit. Login testdad@fam.com/secret123. For EACH width in [320x640, 360x740, 390x844, 430x932], visit these screens and report CONCRETE issues: horizontal overflow (document scrollWidth > clientWidth + 2), clipped/overlapping text, important text truncated to '...', buttons with clipped/off-center text, cards extending beyond the viewport, tiny unreadable controls, or big inconsistent blank space. SCREENS: Login, Home (normal), Calendar (tab), an Event card (open one), Add Event (/event/create), Family (tab), a Member profile (tap a member), Chores (/chores), Shopping (/shopping), Wishlist (/wishlist), Chat conversation (open family chat), Send Love (/affection/send), Vault (/vault — note PIN keypad must fit at 320), Emergency (/emergency), Accessibility (/settings/accessibility). ALSO: set Accessibility Text Size = Extra Large and re-check Home, Family, Calendar for overlap/clipping (wrapping is expected/OK). ALSO spot-check the member status strip and any 2-column grids don't cram at 320. Report a per-screen/per-width pass/fail with the specific element. Do NOT change product functionality; this is layout/alignment only. Do NOT test backend."


# ============ Feature Batch #28 (Auth+ / Chat / Notifications) ============
backend:
  - task: "Forgot password via emailed 6-digit code"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "POST /auth/forgot-password (always 200, no email-existence leak, rate-limited per email+IP) emails a 6-digit code (Emergent Resend) stored bcrypt-hashed in password_resets with 15-min expiry + attempts. POST /auth/reset-password verifies code (unexpired, <5 attempts) and sets new password (min 6), returns a login token. Curl: forgot returns ok; reset flow works (agent-tested individual pieces)."
  - task: "PIN login (adult quick-unlock + kid pick-a-name) + set/clear PIN"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "POST /auth/pin (authed, sets pin_hash), DELETE /auth/pin. POST /auth/pin-login accepts {user_id,pin} (quick-unlock) OR {member_id,pin} (kid picks name); strict throttle pin:{subj}:{ip}; wrong PIN 401, right PIN returns token. /auth/me now returns pin_set + family_chat_id. Curl verified: set pin -> pin-login by user_id ok; wrong pin 401."
  - task: "Login accepts email OR username; child credential management"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "POST /auth/login now accepts {email|username, password}. POST /families/members/{member_id}/credentials (parent/admin only; cannot target admin) sets/resets username+password+PIN, creating a provider=child user (no email) linked to the member on first setup. /families/me members now include has_login, has_pin, username. Curl verified: set child creds -> username+password login ok, member_id+PIN login ok, has_pin reflected; add-member role=admin still 400."
  - task: "Notifications Center aggregation"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "GET /notifications returns {items, unread_count, last_read} aggregating last-30d activity from OTHERS (posts, memories, events added, notices, affection to me/family, chores done, family-chat messages) + upcoming birthdays (next 7 days, not counted as unread). POST /notifications/read sets notifications_last_read. GET /notifications/unread returns badge count. Curl verified: items populated, unread count returned."
  - task: "SEC-002 login-throttle client-IP hardening"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    priority: "low"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "_client_ip now counts TRUSTED_PROXY_HOPS (default 1) in from the RIGHT of X-Forwarded-For (attacker controls only left entries). Lock stays keyed on identifier+IP so it never globally blocks sign-in. Login 200/401 still works via curl."

frontend:
  - task: "Forgot-password flow screen"
    implemented: true
    working: "NA"
    file: "frontend/app/(auth)/forgot.tsx, frontend/app/(auth)/login.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Login screen shows 'Forgot password?' -> /(auth)/forgot (request email -> enter 6-digit code + new password -> auto-login). Login field relabeled 'Email or username'. Screenshot confirmed links render."
  - task: "PIN unlock screen + quick-unlock PIN setup"
    implemented: true
    working: "NA"
    file: "frontend/app/(auth)/pin.tsx, frontend/app/account/index.tsx, frontend/src/auth/AuthContext.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Account settings > QUICK SIGN-IN sets/changes/removes a 4-digit PIN (calls /auth/pin). On any login the device caches the account (REMEMBER_KEY) + family roster of members with PINs (ROSTER_KEY). Login screen 'Family member? Sign in with a PIN' -> /(auth)/pin shows saved faces -> 4-digit pad -> pin-login (user_id for adult, member_id for kid). Empty state guides to password login."
  - task: "Admin/parent manage child login & PIN"
    implemented: true
    working: "NA"
    file: "frontend/app/member/credentials.tsx, frontend/app/(tabs)/family.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Family tab member-actions modal shows 'Set up / Reset login & PIN' for non-admin members -> /member/credentials modal (username + 4-digit PIN + optional password). Saves via /families/members/{id}/credentials."
  - task: "Chat simplified to single Family Chat"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/_layout.tsx, frontend/app/(tabs)/chat.tsx, frontend/app/(tabs)/index.tsx, frontend/src/components/home/KidsHome.tsx, frontend/src/components/home/SimpleHome.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Chat tab press now opens the single Family Chat conversation directly (TabBar intercepts tabPress, pushes /chat/{familyChatId}). DM/group list + new-chat entry points removed; (tabs)/chat.tsx is a safety-net redirect. Home 'Message' quick action, KidsHome and SimpleHome chat tiles now open the family chat directly too. Family chat unread badge still shows on the Chat tab."
  - task: "Notifications Center screen + Home bell"
    implemented: true
    working: "NA"
    file: "frontend/app/notifications.tsx, frontend/app/(tabs)/index.tsx"
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Home header bell (replaced redundant chat icon) shows /notifications/unread badge -> /notifications. Screen lists activity (actor avatar + emoji + title/subtitle + time), taps route to the item, marks read on view, pull-to-refresh, empty state."

agent_communication_batch28:
    -agent: "main"
    -message: "Batch #28. Test BOTH backend + frontend. Admin login: protectdemo@fam.com / secret123 (Sharma demo). BACKEND: (1) POST /auth/forgot-password {email} always 200; POST /auth/reset-password {email,code,new_password} with a valid code sets password + returns token (note: real code only arrives by email; for logic test you can verify invalid code -> 400). (2) POST /auth/pin {pin} (authed) sets PIN; /auth/me returns pin_set + family_chat_id; DELETE /auth/pin clears; POST /auth/pin-login {user_id,pin} and {member_id,pin} -> token (wrong PIN 401, throttled). (3) POST /auth/login accepts username too. (4) POST /families/members/{id}/credentials (admin/parent) sets username+password+PIN for a NON-admin member (creates provider=child user first time); reject role=admin target 403; then login with that username/password and pin-login with member_id+PIN. (5) GET /notifications, POST /notifications/read, GET /notifications/unread. FRONTEND: Forgot-password screen from Login; Account > QUICK SIGN-IN set a 4-digit PIN then sign out and unlock via 'Family member? Sign in with a PIN'; Family tab > tap a child member > 'Set up login & PIN' modal; Chat TAB opens the single Family Chat directly (no conversation list, no new-chat button); Home bell opens Notifications Center and shows recent family activity. Do NOT change product functionality beyond what's described."
    -agent: "testing"
    -message: "Batch #28 RESULT: PASS. Backend 14/14 pytest (backend/tests/test_batch28_forgot_pin_child_notif.py; iteration_27): forgot-password always-200 + 400 wrong-code/short-pw; PIN set -> /auth/me pin_set + non-null family_chat_id, pin-login by user_id, wrong/short PIN 401 (not 500), DELETE clears; child creds username-login + member-PIN-login + /families/me has_login/has_pin/username; role guards (add-member admin 400, set-creds admin target 403, non-parent 403); notifications items + unread drops to 0 after read. Frontend 5/5 flows PASS at 390x844 (forgot inline error, PIN setup toast + fh_remembered, child creds save, Chat tab opens single Family Chat with composer & no + button, Home bell -> Activity). FIXED HIGH bug: POST /families/members/{id}/credentials 500 DuplicateKeyError on 2nd child user (email:null vs sparse unique index) -> now omits email field on child-user insert. Main agent re-verified 2x child creds -> 200/200."

# ============ Feature Batch #29 (Chat retention / file share / live location / Storage cleanup / Date pickers + dd-mm-yyyy) ============
backend_batch29:
  - task: "Family chat retention (disappearing messages) — PATCH /chats/{id}/retention + purge on read/send"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "PATCH /api/chats/{id}/retention {days} accepts 1|7|30|90 (else off/null); parents/admin only (403 otherwise). _purge_expired_messages runs on GET /messages and POST /messages, deleting messages (and their media) older than the window + their reactions. Agent smoke-tested; demo retention reset to off."
  - task: "Live/one-time location messages — send + PATCH location + stop-live"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "MessageIn supports type=location|live_location with lat/lng/live_until. PATCH /api/chats/{id}/messages/{mid}/location (sender-only 403 else) updates coords. POST /api/chats/{id}/messages/{mid}/stop-live (sender-only) sets live_until=now. Preview text '📍 Live location' / '📍 Location'."
  - task: "Secure chat file attachments (PDF/PPT/DOC/XLS/etc) via managed storage"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "MessageIn type=file carries media[] + file_name/file_size/file_mime. Files uploaded via /api/upload (kind=document) to Emergent Object Storage, served token-gated by /api/files (family-scoped). No Base64."
  - task: "Storage usage + cleanup — GET /storage/usage, POST /storage/cleanup"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/storage/usage -> {messages, media_messages, media_files} (family-scoped). POST /api/storage/cleanup {scope:'chat_media'|'chat_history', older_than_days} parents/admin only (403 else); chat_media strips media (+deletes objects) keeping messages; chat_history deletes messages+media+reactions. older_than_days=0 = everything."

frontend_batch29:
  - task: "Chat attach sheet (Photo / File / Location) + file & location message bubbles"
    implemented: true
    working: "NA"
    file: "frontend/app/chat/[id].tsx, frontend/src/lib/fileMeta.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Input bar '＋' (chat-attach-btn) opens a sheet: Photo (attach-photo), File (attach-file, expo-document-picker -> uploadDocument -> type=file), Send current location (attach-location), Share live location 15 min (attach-live). File bubbles (file-<id>) show icon/name/size, tap opens via media token URL. Location bubbles (loc-<id>) show a static map + 'Open in Maps'; own active live share shows 'Stop sharing' (stop-live-<id>). Location permission flow: check -> request -> Open Settings if blocked. NATIVE-ONLY: real geolocation + document picker + external file open can't be exercised on web preview — verify the sheet, permission handling, and that non-crashing fallbacks render."
  - task: "Chat settings sheet — Disappearing messages (Off/24h/7d/30d/90d), parents-only"
    implemented: true
    working: "NA"
    file: "frontend/app/chat/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Header '⋮' (chat-options-btn) opens settings sheet with retention chips (retention-opt-0/1/7/30/90). Parents/admin can change (PATCH retention); non-parents see chips disabled + note. When on, a 'Messages disappear after …' banner (retention-bar) shows under the header. Groups also get a 'Manage group' row (settings-manage-group)."
  - task: "Storage & Cleanup screen (device cache clear + family cloud cleanup)"
    implemented: true
    working: "NA"
    file: "frontend/app/settings/storage.tsx, frontend/app/(tabs)/more.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "More > Preferences > Storage & Cleanup. Shows family usage stats (from /storage/usage). Option A 'Free up space on this phone' (storage-clear-cache) clears expo-file-system cache/document dirs — device-only, everyone (web shows unavailable note). Option B 'Clear family chat data' parents-only: chips cleanup-media-<days> and cleanup-history-<days> (90/30/7/0) -> confirm modal (cleanup-confirm/cleanup-cancel) -> POST /storage/cleanup. Non-parents see a lock note."
  - task: "Date pickers (event + birthday) + dd-mm-yyyy display across app"
    implemented: true
    working: "NA"
    file: "frontend/src/components/ui/DateTimeField.tsx, frontend/app/event/create.tsx, frontend/app/member/edit.tsx, frontend/src/lib/time.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New DateField + TimeField (tap-to-pick calendar / time). Event create uses DateField (event-date, repeat-until) + TimeField (start-time-input/end-time-input). Edit Profile birthday now uses DateField (edit-birthday, maxToday). All display DD-MM-YYYY. Date displays converted to dd-mm-yyyy via formatDMY across vault expiries, timeline, member birthday, highlights, capsules, search, timeline/create. Relative labels (Today/2h ago) and month/week range headers kept."

agent_communication_batch29:
    -agent: "main"
    -message: "Batch #29 = chat auto-delete + file share + live location + storage cleanup + date pickers + dd-mm-yyyy. Admin account: storytester@fam.com / secret123 (Sharma demo, family chat has messages). TEST BOTH backend + frontend. BACKEND: (1) PATCH /api/chats/{fid}/retention {days:7} as admin -> 200 {retention_days:7}; setting days:1/30/90 ok; invalid stays off; a non-parent member -> 403 (note: only admin logs in in demo, so verify admin path + that setting persists on GET /chats/{id}). Verify sending a message then a retention purge doesn't error. (2) Send a location message: POST /chats/{id}/messages {type:'location', lat, lng} -> 200; live_location with live_until; PATCH /chats/{id}/messages/{mid}/location {lat,lng} sender-only (403 for a different member); POST .../stop-live sender-only. (3) Send a file message: upload a doc via /api/upload (kind=document) then POST message {type:'file', media, file_name, file_size, file_mime} -> renders. (4) GET /api/storage/usage -> counts; POST /api/storage/cleanup {scope:'chat_media', older_than_days:90} parents-only (non-parent 403); {scope:'chat_history', older_than_days:0} deletes messages. IMPORTANT: do NOT run a destructive older_than_days:0 chat_history cleanup on the shared demo family — test cleanup on a FRESH registered account/family so demo chat isn't wiped. FRONTEND (in-app nav, 390x844): Open Chat (single Family Chat). (a) Tap '＋' (chat-attach-btn) -> sheet shows Photo/File/Location/Live options; tap File opens document picker (web may not complete -> OK); tap Send location -> permission prompt (web geolocation may be blocked -> verify graceful toast, no crash). (b) Tap '⋮' (chat-options-btn) -> settings sheet; as admin tap retention-opt-7 -> banner 'Messages disappear after 7 days' appears; tap retention-opt-0 to turn off. (c) More > Preferences > Storage & Cleanup: usage stats render; 'Clear downloaded files' present (web shows 'works in mobile app'); as admin the family cleanup chips + confirm modal render (DO NOT confirm a destructive Everything cleanup on demo). (d) Event create (Calendar + FAB): Date field opens a calendar picker, Start/End open time pickers, values show DD-MM-YYYY; save an event. (e) Edit Profile (More profile pencil): Birthday opens the calendar picker (no future dates), saves, shows dd-mm-yyyy on member profile. (f) Confirm dates read dd-mm-yyyy in Vault expiries, Our Family Story memory dates, member Birthday. Voice/push/biometric + real geolocation/document-open remain native-only — do NOT fail on web for those; verify UI + permission handling only."

# ============ Feature Batch #30 — TRUSTED HELPERS (Phase 1) ============
backend_batch30:
  - task: "Helper accounts + invite/activate + PIN login (separate principal, RBAC)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "New db.helpers principal, DISTINCT from family members. account_type='helper' JWT with tv (token_version) + jti; get_current_helper validates account_type + family + status active + tv + live session + access window each request. get_current_user now REJECTS helper tokens (401) and vice-versa. Parent(admin/parent)-only: POST/GET/PATCH/DELETE /api/helpers, pause/resume, regenerate-invite, reset-pin, sessions, signout-all, audit, tasks. Helper self: POST /helper/activate (code->set username+PIN), /helper/login (username+PIN, bcrypt, throttled key helper:username:ip), /helper/me, /helper/dashboard, /helper/tasks, /helper/tasks/{id}/start|complete|issue, /helper/upload (proof photos), /helper/signout. Curl-verified: create(invite+direct)/activate/login OK; proof photo required -> complete 400 w/o photo, 200 with; activity shows completions; pause->helper 401 & login 403; resume->200; signout-all->old token 401; remove->login 401; helper token on /api/home->401; parent token on /helper/me->401; duplicate-null username fixed via partial unique index."
  - task: "Home helpers_today (parents) + helper role/permission templates"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/home returns helpers_today[] for parents (active helpers, today task counts, next task). GET /api/helpers/roles returns 11 role templates + 12 permission keys. Role defaults applied via _resolve_perms; tasks perm always true."

frontend_batch30:
  - task: "Helper portal (separate login + accessible dashboard)"
    implemented: true
    working: true
    file: "frontend/app/helper-login.tsx, frontend/app/helper-portal/index.tsx, frontend/src/lib/helperApi.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Welcome > 'I'm a trusted helper' (helper-portal-link) -> /helper-login (sign in OR activate with code). Helper token stored separately (secureStore key helper_token) via helperApi — never mixed with family auth. Dashboard verified live: greeting + role + family, 'Today's Work X/Y', task cards with Start/Mark done/Need help, proof-photo capture (helper-add-proof via /helper/upload), issue reasons, sign out. Root _layout auth guard allows helper-login/helper-portal/helper-join without a family user."
  - task: "Parent helper management (Add Helper wizard + detail/access summary/tasks/sessions)"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/family.tsx, frontend/app/helper/add.tsx, frontend/app/helper/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Family tab shows a 'Trusted Helpers' section (parents/admin only, add-helper-cta) with per-helper status + today task counts (verified live: Sunita Nanny 0/3 Active). Add Helper wizard (/helper/add): name, role grid (role-*), who they help (assign-all/assign-select + member chips), access period (access-permanent/dates/temporary + DateField), working days/hours, per-permission Allow/Deny (perm-*), login mode invite vs direct (login-invite/login-direct) -> success shows invite code. Helper detail (/helper/[id]): access summary (can/cannot), assigned members, sign-in (set-login-btn/regen-invite-btn), tasks list + Assign modal (assign-task-btn: title/instructions/time/schedule/weekly days/category/for-member/proof/important), activity feed, devices + sign out all, pause/resume/remove. Needs UI testing."

agent_communication_batch30:
    -agent: "main"
    -message: "Batch #30 = TRUSTED HELPERS Phase 1 (a separate restricted user type; NEVER a family member). CREDS: parent/admin storytester@fam.com / secret123; demo helper login username 'sunita' PIN '1234' (Nanny, assigned Aarav, 3 daily tasks incl. a pickup that REQUIRES a photo). TEST BOTH backend + frontend. BACKEND already curl-verified by main agent incl. all security boundaries (see backend_batch30). Please regression: (1) parent CRUD /api/helpers (create invite + direct username/pin), activate, login, dashboard, task assign, complete (photo-proof enforcement 400/200), issue, activity; (2) SECURITY: helper token must 401 on ANY family route (/api/home, /api/families/me, /api/chats/*, /api/vault/*); family token must 401 on /helper/*; a helper must NEVER read another family's data; only parent/admin can manage helpers (non-parent 403 — note only admin logs in demo, reason via code); pause->403 login & 401 requests, remove->instant revoke, signout-all invalidates old token. (3) child-level scoping: helper assigned only Aarav must not implicitly access Anaya (assigned_member_ids). FRONTEND (in-app nav, 390x844): PARENT: Family tab -> Trusted Helpers -> +Add -> fill wizard (role, assign, permissions Allow/Deny, invite mode) -> success invite code; open helper detail -> Assign task modal -> verify task appears; pause/resume; set username&PIN; New invite code; verify access summary can/cannot lists. HELPER: Welcome -> 'I'm a trusted helper' -> login sunita/1234 -> dashboard shows 3 tasks -> Start a task, Mark done (the pickup needs a photo -> verify it blocks done until a photo is added on native; on web the picker may not complete -> just verify the proof requirement UI + that a non-proof task completes), Need help -> pick reason -> send. Sign out returns to helper login. NOTE: helper proof photo upload + native image picker are native-limited on web — verify UI/permission handling, don't fail web. Do NOT run destructive family cleanup. Restart nothing."

# ============ Feature Batch #31 — TRUSTED HELPERS Phase 2 (Chat / Handover / Pickup-Drop) ============
backend_batch31:
  - task: "Private parent<->helper chat (isolated from Family Chat)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "New db.helper_messages. Parent: GET/POST /api/helpers/{id}/chat (get_current_user + parent/admin manager; read-marks helper msgs). Helper: GET/POST /api/helper/chat gated by require_helper_permission('chat'). Messages carry sender parent|helper. Fully separate from db.messages/db.chats — helper can NEVER see Family Chat. Unread surfaced: list_helpers/get_helper add unread_chat (helper->parent unread); helper/dashboard adds unread_chat (parent->helper) + can_chat. Curl-verified full round-trip (parent send -> helper read+reply -> parent read, unread cleared)."
  - task: "Handover notes (daily log; parent notes + helper end-of-day replies)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "New db.helper_handovers (per note: by parent|helper, date, author, text). Parent GET/POST /api/helpers/{id}/handover; helper GET/POST /api/helper/handover (all active helpers, no special perm). helper/dashboard returns handover_today (# parent notes today). Curl-verified: parent note visible to helper; helper end-of-day note added."
  - task: "Pickup & Drop live status flow (Start Trip -> Picked Up -> Reached)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "HelperTaskIn/Patch gained pickup_from/pickup_to. POST /api/helper/tasks/{id}/trip {stage: en_route|picked_up|reached} stores trip.{started_at,picked_up_at,reached_at,status} in helper_task_completions; 'reached' also sets completed_at (marks done). Each stage fires _notify_parents_helper (route/emoji). Curl-verified all 3 stages 200."
  - task: "Helper events in family Notifications Center (parents/admins only)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "_notify_parents_helper now also writes db.helper_events. _gather_notifications(viewer_role) includes helper events (type 'helper') ONLY for admin/parent viewers, route /helper/{id}. Curl-verified: parent /api/notifications shows 5 helper items (chat msg, handover note, 3 trip stages)."

frontend_batch31:
  - task: "Parent helper chat + handover screens + trip status on detail"
    implemented: true
    working: "NA"
    file: "frontend/app/helper/chat.tsx, frontend/app/helper/handover.tsx, frontend/app/helper/[id].tsx, frontend/src/components/HelperChatView.tsx, frontend/src/components/HelperHandoverView.tsx, frontend/app/(tabs)/family.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Helper detail (/helper/[id]) has Chat (helper-chat-btn, unread badge) + Handover (helper-handover-btn) quick actions. Chat screen (/helper/chat?id=&name=) polls every 4s, right/left bubbles, disabled state when chat perm off. Handover screen (/helper/handover?id=&name=) date-grouped notes + composer. Task Assign modal shows Pick up from/Drop to inputs when category=pickup (task-from/task-to); pickup task rows show route + live trip badge (from activity completions). Family tab helper card shows unread-chat badge (helper-unread-<id>)."
  - task: "Helper portal chat + handover + pickup trip buttons"
    implemented: true
    working: "NA"
    file: "frontend/app/helper-portal/index.tsx, frontend/app/helper-portal/chat.tsx, frontend/app/helper-portal/handover.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Portal shows Chat (portal-chat-btn, only if can_chat, unread badge) + Handover (portal-handover-btn, dot when parent note today) nav under Today's Work. Chat screen polls; Handover screen composer 'End-of-day note'. Pickup tasks (category=pickup) show route + a trip stepper: Start Trip (trip-start-<id>) -> Child Picked Up (trip-pickup-<id>) -> Reached Home (trip-reached-<id>); reached completes the task. Non-pickup tasks keep Start/Mark done/Need help. Smoke-verified portal renders with Chat/Handover + pickup route."

agent_communication_batch31:
    -agent: "main"
    -message: "Batch #31 = TRUSTED HELPERS Phase 2. CREDS: parent/admin storytester@fam.com / secret123 (helper_id help_c77a0a30120545bb); demo helper login username 'sunita' PIN '1234' (Nanny, assigned Aarav; has a pickup task 'Pick up Aarav from school' Delhi Public School -> Home; today's completions cleared so trip flow is fresh; 2 seeded chat msgs + 2 handover notes exist). TEST BOTH backend + frontend. BACKEND (curl-verified by main agent, please regression + SECURITY): (1) PRIVATE CHAT isolation — helper /helper/chat must ONLY return helper<->parent messages, NEVER Family Chat (db.messages); a helper WITHOUT chat permission must get 403 on /helper/chat (create a helper with chat denied to verify); family token must 401 on /helper/*; helper token must 401 on parent /helpers/{id}/chat. (2) HANDOVER — parent POST note -> helper GET sees it; helper POST end-of-day -> parent GET sees it; scoped to that helper+family only (cross-family 404). (3) TRIP — helper POST /helper/tasks/{id}/trip stages en_route/picked_up/reached (bad stage 400); 'reached' marks task done; each fires a parent notification. (4) NOTIFICATIONS — parent GET /api/notifications includes type 'helper' items; a CHILD/non-parent viewer must NOT see helper events. (5) lifecycle: paused/removed helper -> chat/handover/trip endpoints blocked (401/403). FRONTEND (in-app nav, 390x844): HELPER (login sunita/1234): portal shows Chat + Handover buttons; open Chat -> see parent msg -> send a reply; open Handover -> see family note -> add end-of-day note; the pickup task shows Start Trip -> tap -> Child Picked Up -> tap -> Reached Home (task then shows done). PARENT (storytester): Family tab -> Trusted Helpers -> open Sunita -> Chat (see helper reply, send a message) + Handover (see helper note, add a note) + Tasks show pickup route + trip badge; Notifications bell shows helper activity. Web geolocation/native pickers not required here (Phase 2 pickup is task-status only, no live GPS). Do NOT run destructive cleanup."

# ============ Feature Batch #32 — TRUSTED HELPERS Phase 3 (Care Team / Live Pickup Map / Medical / Ratings) ============
backend_batch32:
  - task: "Care Team group chat (parents + all active helpers)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "New db.care_team_messages (family-scoped group, read_by[] per-reader). Parent GET/POST /api/care-team/chat (+ roster of active helpers + me/my_type) and GET /api/care-team/unread (parent/admin). Helper GET/POST /api/helper/care-team gated by require_helper_permission('chat'). Isolated from Family Chat AND from 1:1 helper chat. Helper post fires _notify_parents_helper(👥, route /care-team). Curl-verified round trip + roster + unread clear."
  - task: "Live pickup location during active trip"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "POST /api/helper/tasks/{id}/location {lat,lng} updates trip.lat/lng/loc_updated_at on today's completion; returns 400 if no active trip (must Start Trip first) — curl-verified 400 before trip, 200 after en_route. Parent reads coords via /helpers/{id}/activity trip object."
  - task: "Medical sharing (view-only, assigned members, permission-gated)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/helper/medical gated by require_helper_permission('medical') (Nanny default has NO medical -> 403 verified). Returns ONLY assigned members (assigned_all -> all). Exposes blood_group, allergies, doctor, hospital, emergency_contact ONLY. LEAK CHECK curl-verified: medication/conditions/insurance_provider/policy_reference NOT present in response. Demo: granted Sunita medical perm; she sees only Aarav (her assigned child)."
  - task: "Helper daily ratings (👍/👎 + note)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "db.helper_ratings unique (helper_id,date). Parent POST /api/helpers/{id}/rating {rating up|down, note} (upsert per day; 400 for bad rating) + GET /api/helpers/{id}/ratings (history + up/total + today). helper/dashboard adds rated_up_today. Curl-verified."

frontend_batch32:
  - task: "Care Team chat screens (parent + helper) + Family tab entry"
    implemented: true
    working: "NA"
    file: "frontend/src/components/CareTeamChatView.tsx, frontend/app/care-team.tsx, frontend/app/helper-portal/care-team.tsx, frontend/app/(tabs)/family.tsx, frontend/app/helper-portal/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Group chat view (bubbles L/R by sender identity, sender name+role on others, poll 4s). Parent: Family tab shows Care Team Chat card (care-team-cta, care-team-unread badge) when >=1 active helper. Helper portal: Care Team button (portal-careteam-btn, unread badge) when can_chat. testIDs careteam-send/careteam-input/ctmsg-*."
  - task: "Live pickup map (helper share + parent map view)"
    implemented: true
    working: "NA"
    file: "frontend/app/helper-portal/index.tsx, frontend/app/helper/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Helper portal pickup task shows 'Share live location' toggle (trip-live-<id>) while trip en_route/picked_up; uses expo-location getForeground/request + watchPositionAsync (native) POST /helper/tasks/{id}/location; web posts one-time. Stops on Reached Home. Parent /helper/[id] pickup row shows a static OSM map (trip-map-<id>) + 'Live · updated Xm ago' + tap opens Maps, when trip has coords. NOTE: actual GPS movement needs a real device build; web preview only shows a single point."
  - task: "Helper medical screen (portal)"
    implemented: true
    working: "NA"
    file: "frontend/app/helper-portal/medical.tsx, frontend/app/helper-portal/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Portal Medical button (portal-medical-btn) shown only when can_view_medical. Screen lists assigned kids' cards (medcard-<id>) with blood group pill, allergies, doctor, hospital, emergency contact + tap-to-call (medcall-<id>). Emergency-only banner. No sensitive fields shown."
  - task: "Helper ratings UI (parent detail + helper praise banner)"
    implemented: true
    working: "NA"
    file: "frontend/app/helper/[id].tsx, frontend/app/helper-portal/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Parent /helper/[id] 'How was today?' section: 👍 (rate-up) / 👎 (rate-down) + optional note (rate-note) + history (rate-hist-*). Helper portal shows praise banner (portal-praise) when rated_up_today. Smoke-verified: portal shows all 4 nav buttons + praise banner + Start Trip."

agent_communication_batch32:
    -agent: "main"
    -message: "Batch #32 = TRUSTED HELPERS Phase 3. Builds on #30/#31 (both passed). CREDS: parent/admin storytester@fam.com / secret123 (family fam_c6ac3995c5a0430a, helper_id help_c77a0a30120545bb). Demo helper: username 'sunita' PIN '1234' — NOW granted 'medical' permission + assigned child Aarav (has a seeded medical card O+/Peanuts/Dr.Mehta/Apollo). Sunita has a daily pickup task 'Pick up Aarav from school' (Delhi Public School -> Home); today's completions were reset so the trip flow is fresh. TEST BOTH backend+frontend. BACKEND regression + SECURITY: (1) CARE TEAM isolation — /api/care-team/chat and /helper/care-team share ONLY care_team_messages, never Family Chat (db.messages) nor 1:1 helper chat (db.helper_messages); helper WITHOUT chat perm -> 403 on /helper/care-team; family token -> 401 on /helper/*; helper token -> 401 on /api/care-team/*. (2) LIVE LOCATION — POST /api/helper/tasks/{id}/location returns 400 before Start Trip, 200 after; coords land in the trip completion and parent sees them via /helpers/{id}/activity. (3) MEDICAL — /helper/medical requires 'medical' perm (403 without); returns ONLY assigned members; response MUST NOT contain medication/conditions/insurance_provider/policy_reference (privacy!). Create a 2nd helper assigned to a DIFFERENT member to confirm scoping (they must NOT see Aarav). (4) RATINGS — parent POST/GET /api/helpers/{id}/rating(s); bad rating value -> 400; one-per-day upsert; dashboard rated_up_today. (5) lifecycle: paused/removed helper blocked on all Phase 3 helper endpoints. FRONTEND (in-app nav, 390x844): HELPER (sunita/1234): portal shows Chat + Care Team + Handover + Medical buttons + a 'family appreciated your work' praise banner; open Care Team -> send msg; open Medical -> see Aarav's card (blood group/allergies/doctor), confirm NO medication/insurance shown; pickup task -> Start Trip -> 'Share live location' toggle appears (web will ask geolocation permission; a single point is OK — full GPS needs device build). PARENT (storytester): Family tab -> Trusted Helpers -> Care Team Chat card (send a msg, see helper's msg) + open Sunita -> 'How was today?' 👍/👎 + note (rate-up/rate-down/rate-note) saves + history; if a live trip is active, pickup row shows a map. Web geolocation may be denied in the harness — that's fine, just confirm the toggle/button appears and no crash. Do NOT run destructive cleanup."

# ============ Feature Batch #33 — TRUSTED HELPERS Phase 4 (Care Team Photos / Trip ETA Alerts / Shift Reminders) ============
backend_batch33:
  - task: "FIX: create_helper_task now persists pickup_from/pickup_to (+ dest_lat/dest_lng)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Latent Phase-2 bug: create_helper_task built the task dict WITHOUT pickup_from/pickup_to (only PATCH persisted them). Now create persists pickup_from, pickup_to, dest_lat, dest_lng. HelperTaskIn/Patch gained dest_lat/dest_lng."
  - task: "Trip ETA alerts (notify parents near drop-off)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "POST /api/helper/tasks/{id}/location now returns eta_min and, when the pickup task has dest_lat/dest_lng and the live point is within ETA_ALERT_M (2000m) during en_route/picked_up, fires a ONE-TIME parent notification '📍 <helper> is about N min from <dest>'. Guarded by trip.eta_alerted so it never double-fires. _haversine_m added; import math added. Curl-verified: far point no alert, near point 1 alert, repeat near NO 2nd alert."
  - task: "Shift reminders (helper dashboard, reuses working hours)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "_shift_status(h) reuses access.start_time/end_time/days (UTC, like _within_hours). helper/dashboard returns shift={start_time,end_time,today,on_duty,minutes_until,reminder(0<=mins<=60)}. Curl-verified reminder True with minutes_until 30 when start set 30 min ahead."
  - task: "Care Team photo messages (backend already supported)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "CareTeamMsgIn already had photo_url; parent /api/care-team/chat and helper /helper/care-team accept and return photo_url. Uploads via existing /upload (parent) and /helper/upload (helper). No backend change beyond confirming acceptance."

frontend_batch33:
  - task: "Care Team photos (camera/gallery attach + photo bubbles)"
    implemented: true
    working: "NA"
    file: "frontend/src/components/CareTeamChatView.tsx, frontend/app/care-team.tsx, frontend/app/helper-portal/care-team.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "CareTeamChatView gained a '+' attach button (careteam-attach) -> sheet with Take photo (careteam-camera) / Gallery (careteam-gallery); camera + media-library permission handling (check->request->Settings). Photo messages render as SmartImage bubbles (ctphoto-*), tap opens full URL. Parent uploads via uploadMedia, helper via helperUpload, then POST {photo_url}. Smoke-verified attach button present on both sides."
  - task: "Trip ETA drop-off point (parent sets home via GPS)"
    implemented: true
    working: "NA"
    file: "frontend/app/helper/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "On each pickup task the parent sees a button (dropoff-<task_id>): 'Set drop-off point (for arrival alerts)' -> captures parent GPS (expo-location perm flow) -> PATCH /helper-tasks/{id} {dest_lat,dest_lng}; once set shows 'Arrival alerts on · tap to update'. When the driver later nears it, the parent gets the 📍 ETA notification in the bell. (Web geolocation may be denied in the harness — confirm button + no crash.)"
  - task: "Shift reminder banner (helper portal)"
    implemented: true
    working: "NA"
    file: "frontend/app/helper-portal/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Portal shows a shift banner (portal-shift) from dashboard.shift: ⏰ 'Your shift starts at HH:MM — about N min to go' when reminder; 🟢 'You're on shift until HH:MM' when on_duty; 🗓️ 'Today's shift: HH:MM–HH:MM' otherwise. Smoke-verified banner + praise + 4 nav buttons render."

agent_communication_batch33:
    -agent: "main"
    -message: "Batch #33 = TRUSTED HELPERS Phase 4. Builds on #30-#32 (all passed). CREDS: parent storytester@fam.com / secret123 (family fam_c6ac3995c5a0430a, helper_id help_c77a0a30120545bb). Demo helper: username 'sunita' PIN '1234' — has a pickup task 'Pick up Aarav from school' with dest_lat/dest_lng SET (28.6,77.2) and working hours set ~40 min ahead so the shift reminder shows. TEST BOTH. BACKEND regression: (1) create_helper_task now persists pickup_from/pickup_to AND dest_lat/dest_lng (previously pickup fields were dropped on create!). (2) ETA: POST /api/helper/tasks/{id}/location returns eta_min; when task has dest coords + live point within 2000m during an active trip, fires EXACTLY ONE parent notification (emoji 📍) — a far point must NOT alert, a 2nd near point must NOT re-alert (trip.eta_alerted). Still 400 before Start Trip. (3) Shift: /helper/dashboard.shift has reminder true only when 0<=minutes_until<=60 before start_time (UTC). (4) Care Team photos: parent POST /api/care-team/chat {photo_url} and helper POST /helper/care-team {photo_url} store+return photo_url; still isolated from Family Chat. (5) SECURITY regression: helper WITHOUT chat perm still 403 on /helper/care-team; cross-token 401 still holds; medical still leak-free. FRONTEND (mobile 390x844): HELPER (sunita/1234): portal shows a shift reminder banner (portal-shift) + praise + Care Team button; open Care Team -> tap '+' (careteam-attach) -> see Take photo/Gallery options (careteam-camera/careteam-gallery); on web the picker/geolocation may be blocked — just confirm the sheet appears and no crash; pickup task -> Start Trip -> 'Share live location' (trip-live-*). PARENT (storytester): open Sunita -> each pickup task shows a drop-off button (dropoff-<task_id>) that says 'Arrival alerts on' (dest already set) — tapping re-captures location (web may deny, that's fine); Care Team Chat card on Family tab opens the group chat with a '+' attach button too. Do NOT run destructive cleanup — keep demo helper Sunita, her pickup task dest coords, working hours, ratings, care-team messages."

# ============ Feature Batch #34 — TRUSTED HELPERS Phase 5 (Drop-off Photo / Shift Check-In / Care Team Voice Notes) ============
backend_batch34:
  - task: "Scoped helper media token (helpers can view care-team/1:1/own media only)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "NEW: make_helper_media_token (6h, account_type helper_media). Returned by helper login, /helper/me, /helper/dashboard. serve_file now branches: helper/helper_media tokens -> _serve_file_for_helper which allows ONLY files that are (a) the helper's own uploads (owner_id==helper_id), (b) referenced by a care_team_messages photo_url/audio_url in the helper's family, or (c) referenced by this helper's helper_messages. Everything else (Family Chat, Vault, other members' media) -> 404. Curl-verified: helper fetches own care-team audio via ?token=media_token -> 200; unrelated path -> 404."
  - task: "Care Team voice notes + photos (audio_url/audio_dur passthrough)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "CareTeamMsgIn gained audio_url/audio_dur; care_msg_public returns them; both send endpoints accept audio (require text|photo|audio). Helper notification preview says '🎤 Voice message'. Still isolated from Family Chat."
  - task: "Drop-off arrival photo on trip 'reached'"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "HelperTripIn gained proof_url; on stage=reached it stores trip.proof_url and the parent notification becomes 📸 'Arrival photo attached'. Curl-verified: proof_url shows in /helpers/{id}/activity trip; 📸 notif fires."
  - task: "Shift check-in / check-out"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "NEW db.helper_checkins (unique helper_id+date). POST /helper/checkin (idempotent; first fires 🟢 parent notif), POST /helper/checkout (400 if not checked in; fires 👋). dashboard.checkin={checked_in_at,checked_out_at}. Parent list_helpers + get_helper now include checked_in_at/checked_out_at. Curl-verified incl. idempotency and parent visibility."

frontend_batch34:
  - task: "Helper media token wiring (photos/voice load on helper side)"
    implemented: true
    working: "NA"
    file: "frontend/src/lib/api.ts, frontend/src/lib/helperApi.ts, frontend/app/helper-login.tsx, frontend/app/helper-portal/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "helper-login + portal dashboard set the app mediaToken to the helper media_token. mediaImageSource native branch now falls back to ?token=mediaToken when no family authToken, so SmartImage + VoiceMessage load helper media on web AND native. helperUpload now takes kind ('image'|'audio')."
  - task: "Care Team voice notes UI (record + playback)"
    implemented: true
    working: "NA"
    file: "frontend/src/components/CareTeamChatView.tsx, frontend/app/care-team.tsx, frontend/app/helper-portal/care-team.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "CareTeamChatView: mic button (careteam-mic) when input empty -> recording bar (careteam-rec-cancel / careteam-rec-send) using expo-audio useAudioRecorder + mic permission flow; sends via onSendAudio (uploads m4a then POST audio_url+audio_dur). Voice bubbles render with existing VoiceMessage (ctvoice-*). Photo bubbles (ctphoto-*) also render now that helper media loads. Smoke-verified mic + attach present. NATIVE-ONLY: real mic recording needs a device build; web MediaRecorder may vary."
  - task: "Shift check-in UI (helper) + on-duty badge (parent)"
    implemented: true
    working: "NA"
    file: "frontend/app/helper-portal/index.tsx, frontend/app/helper/[id].tsx, frontend/app/(tabs)/family.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Portal: big 'I've arrived — start my shift' button (portal-checkin) -> becomes '🟢 On duty since HH:MM · Check out' (portal-onduty/portal-checkout) -> '✅ Shift ended' (portal-checkedout). Parent: helper detail identity shows '🟢 On duty since HH:MM' (helper-onduty); Family tab helper card shows '🟢 On duty'. Smoke-verified on-duty state renders."
  - task: "Drop-off photo prompt (helper) + arrival proof (parent)"
    implemented: true
    working: "NA"
    file: "frontend/app/helper-portal/index.tsx, frontend/app/helper/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Helper portal: tapping 'Reached Home' (trip-reached-*) now calls reachHome() which opens the camera (permission flow) to snap an arrival photo, uploads it, then POSTs stage=reached with proof_url (proceeds even if camera canceled). Parent helper/[id] pickup row shows the arrival photo thumbnail (arrival-proof-*). NATIVE-ONLY camera; web may block — confirm no crash."

agent_communication_batch34:
    -agent: "main"
    -message: "Batch #34 = TRUSTED HELPERS Phase 5. Builds on #30-#33 (all passed). CREDS: parent storytester@fam.com / secret123 (family fam_c6ac3995c5a0430a, helper_id help_c77a0a30120545bb). Demo helper: username 'sunita' PIN '1234' (has chat+medical perms, a pickup task 'Pick up Aarav from school' with dest set, working hours set ~ so shift shows; may already be checked-in today). TEST BOTH. BACKEND regression + SECURITY (MOST IMPORTANT — new media access): (1) HELPER MEDIA SCOPING — helper login/dashboard return media_token. GET /api/files/{path}?token={media_token} must 200 for a file the helper uploaded OR a care_team/1:1 message references, and 404 for ANY other family file (e.g., a Family Chat photo path or a random path). A family (parent) media token must STILL work for family files and must NOT be broadenable by helpers. (2) VOICE/PHOTO — parent & helper POST /api/care-team & /helper/care-team with audio_url+audio_dur (and photo_url) store+return them; text|photo|audio all accepted; empty -> 400; still isolated from Family Chat. (3) DROP-OFF PROOF — POST /helper/tasks/{id}/trip stage=reached with proof_url stores trip.proof_url, marks done, fires 📸 parent notif; parent sees proof_url in /helpers/{id}/activity. (4) CHECK-IN — POST /helper/checkin idempotent (2nd call no new notif, same checked_in_at), fires 🟢; POST /helper/checkout 400 if not checked in else fires 👋; /helper/dashboard.checkin + parent /helpers & /helpers/{id} checked_in_at/checked_out_at. (5) prior security still holds: no-chat helper 403 on care-team, cross-token 401, medical leak-free, paused/removed blocked. FRONTEND (mobile 390x844): HELPER (sunita/1234): portal shows shift banner + check-in state (I've arrived OR On duty since) + Care Team; open Care Team -> when input empty a mic button (careteam-mic) shows; tapping records (careteam-rec-send/careteam-rec-cancel) — on web mic may be blocked, just confirm the recording bar appears/cancels and no crash; existing photo/voice bubbles render (ctphoto-*/ctvoice-*); pickup task Start Trip->Picked Up->Reached Home (trip-reached-*) opens camera (web may block — confirm it still marks reached and no crash). PARENT (storytester): Family tab helper card may show '🟢 On duty'; open Sunita -> identity shows on-duty; completed pickup shows an arrival photo thumbnail if present. Web can't record mic / open camera / move GPS — for those confirm the UI appears and the app doesn't crash; the network round-trips are the key checks. Do NOT run destructive cleanup; keep Sunita + her data."

# ============ Feature Batch #35 (Remove Love-This-Week / Calendar revamp / Home done-tracking / Helper alerts) ============
backend_batch35:
  - task: "Home done-tracking: tasks_done_today + who marked done (tasks & chores)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "POST /todos/items/{id}/toggle now records done_by_member_id + done_at when marking done (cleared on un-toggle). POST /chores/{id}/complete records completed_by_member_id (the acting user). GET /api/home now returns tasks_done_today[] (title, assignee, scope, done_by member card, done_at) AND each kids[].chores[] carries done_by. Fixed a latent shadowing bug: helpers_today loop reassigned `tasks` (now htasks) so /home tasks stayed the family task list. Curl-verified: toggle a todo -> tasks_done_today shows done_by Raj; complete a chore -> done_by Raj; uncomplete clears."
  - task: "Helper in-portal notifications feed (GET/POST /helper/notifications) + dashboard notif_unread"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "NEW GET /helper/notifications aggregates a helper-facing feed: parent 1:1 chat msgs (chat perm), Care Team msgs from others (chat perm), parent handover notes, and family ratings/praise — sorted newest first. Unread computed vs helper doc field helper_notifs_read_at. POST /helper/notifications/read stamps read time. /helper/dashboard now returns notif_unread. Isolated: no Family Chat data. Curl-verified: sunita -> 18 items, unread 18 -> read -> 0."

frontend_batch35:
  - task: "Remove Love This Week from Family tab"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/family.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Removed the 'Love This Week' affection timeline section + its /affection/timeline fetch, state, AFFECTION_MAP import and unused styles. Send Some Love card remains. Lint clean."
  - task: "Calendar revamp (Cubbily-style: gradient header, member color filter, event pills in cells)"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/calendar.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Redesigned month view: coral gradient hero (year + month + prev/Today/next), horizontal member avatar filter row (cal-member-<id>, tap to toggle; empty = all) that filters the grid by participant/owner, month grid with per-day event PILLS (colored, left-accent, truncated title, +N more) instead of dots, today/weekend/selected highlighting, and a selected-day agenda below with a count badge. All existing agenda logic kept: RSVP (rsvp-*), recurring badge, delete-scope modal (del-scope-*), nudge (rsvp-nudge-*), FAB (fab-create-event). Screenshot-confirmed: hero + members + pills + agenda render."
  - task: "Home: completed tasks + who marked done"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Family tasks section shows a '<n> done · <n> to do' summary and a 'COMPLETED TODAY' subsection (strikethrough title + done_by avatar+name, home-task-done-<id>). Kids & chores chips (home-chore-<id>) now show a mini avatar of who marked each done chore; optimistic toggle sets done_by to current user. Screenshot-confirmed: 'Make Bed' done chip shows Raj avatar + StarBurst."
  - task: "Helper portal alerts feed screen + header bell badge"
    implemented: true
    working: "NA"
    file: "frontend/app/helper-portal/index.tsx, frontend/app/helper-portal/notifications.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New /helper-portal/notifications screen (helper-notif-<i> rows, unread highlight + dot, tap routes to chat/care-team/handover). Helper portal header bell (helper-notif-btn) with unread badge (helper-notif-badge) from dashboard.notif_unread; opening the screen marks all read. NATIVE mic/camera unchanged."

agent_communication_batch35:
    -agent: "main"
    -message: "Batch #35 = 4 user asks. CREDS parent storytester@fam.com/secret123; helper sunita/1234. TEST BACKEND: (1) /api/home returns tasks_done_today[] with done_by, and kids[].chores[].done_by; toggling a todo records done_by/done_at and it appears in tasks_done_today; completing a chore records completed_by_member_id; uncomplete clears. (2) /helper/notifications returns aggregated items + unread; /helper/notifications/read zeroes unread; dashboard.notif_unread present; a no-chat helper still gets the feed (handover/ratings) but no chat/care-team items; feed never contains Family Chat data. TEST FRONTEND: (a) Family tab NO LONGER shows 'Love This Week'. (b) Calendar tab: gradient header, member avatars filter the grid (tap cal-member-<id>), event pills in day cells, tap a day -> agenda; RSVP + delete + FAB still work. (c) Home Family tasks shows 'n done · n to do' + a COMPLETED TODAY list with who ticked it; Kids & chores done chips show the completer's mini-avatar. (d) Helper portal (sunita/1234): header bell (helper-notif-btn) with unread badge -> opens Alerts feed; items show; badge clears after viewing. Native mic/camera/GPS remain device-only. Do NOT run destructive cleanup; keep Sunita + demo data."

# ============ Feature Batch #36 (Helper Alert Taps / Calendar Week&Day views / Home Task Nudge) ============
backend_batch36:
  - task: "Task Nudge: POST /todos/items/{item_id}/nudge"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "New endpoint: parent/admin (or task owner) sends a gentle reminder for an OPEN task. Posts a '⏰ Reminder from <me>: @<assignee>, please finish \"<title>\"' message to the family chat and pushes the assignee's linked user (non-blocking). 404 if task missing, 400 if already done, 403 if a non-parent tries to nudge someone else's task. Returns {nudged, name}. Curl-verified: {\"nudged\":1,\"name\":\"Priya\"}."
  - task: "Helper notification focus routing (message_id + ?focus= route)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "_helper_notifications now includes message_id and encodes route=/helper-portal/care-team?focus=<id> (and /helper-portal/chat?focus=<id>) so tapping an alert jumps to the exact message. Curl-verified routes contain ?focus=ctm_..."

frontend_batch36:
  - task: "Helper Alert Taps -> jump to exact Care Team message"
    implemented: true
    working: "NA"
    file: "frontend/src/components/CareTeamChatView.tsx, frontend/app/helper-portal/care-team.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "helper-portal/care-team reads ?focus route param and passes highlightId to CareTeamChatView. The view measures each message y (onLayout), scrolls to the target on mount, and briefly flashes the bubble (warning tint ~2.6s), then re-enables auto-scroll-to-end. Parent care-team.tsx unaffected (highlightId optional)."
  - task: "Calendar Month/Week/Day views"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/calendar.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Added a segmented Month | Week | Day switch (cal-view-month/week/day) in the hero. Month = existing grid + agenda. Week = scannable 7-day list (week-day-<ds> rows: weekday+date circle with today highlight, time+title event chips, 'No events' when empty; tapping a day opens Day view). Day = single-day agenda. Hero prev/Today/next arrows are view-aware (month/week/day stepping) and the hero label/subtitle adapt. Screenshot-confirmed all three views render (16–22 Aug week list, Wed 19 Aug day)."
  - task: "Home Task Nudge (Remind button)"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Family tasks rows now show a 'Remind' pill (task-nudge-<id>) for parents on tasks that have an assignee; tapping calls /todos/items/{id}/nudge and shows a bottom toast '⏰ Reminder sent to <name>'. Screenshot-confirmed: 3 Remind buttons + toast 'Reminder sent to Priya'."

agent_communication_batch36:
    -agent: "main"
    -message: "Batch #36 = 3 user-selected follow-ups. CREDS parent storytester@fam.com/secret123, helper sunita/1234. TEST BACKEND: (1) POST /todos/items/{id}/nudge — parent nudging an assigned OPEN task returns {nudged:1,name}, posts a reminder to family chat, pushes assignee (non-blocking); 400 if already done; 404 if missing; 403 if a NON-parent (e.g. a child member) nudges someone else's task. (2) /helper/notifications care_team/chat items carry message_id and route ends with ?focus=<message_id>. TEST FRONTEND: (a) Calendar Month/Week/Day switch (cal-view-*): Week shows 7-day list (week-day-<ds>), tapping a day opens Day view; prev/next arrows step by month/week/day respectively; Today resets. Existing agenda RSVP/delete/FAB still work in Month & Day. (b) Home Family tasks: parent sees Remind (task-nudge-<id>) on assigned tasks -> toast on tap. (c) Helper portal (sunita/1234) -> bell -> Alerts feed -> tap a Care Team alert -> opens Care Team and scrolls to + briefly highlights that exact message (helper media token loads the media). Do NOT run destructive cleanup; keep Sunita + demo data. Native mic/camera/GPS remain device-only."

# ============ Feature Batch #37 (Helper profile fields / Overdue Reminders / Week Heatmap / Helper Reply Chip) ============
backend_batch37:
  - task: "Helper profile fields: address + id_card_url (admin/parent only, edit-restricted)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "HelperIn/HelperPatch gained address + id_card_url (phone+photo_url already existed). create_helper/patch_helper persist them; helper_public exposes address (harmless) but NOT id_card_url. Parent-only endpoints (POST /helpers, GET /helpers/{id}, PATCH /helpers/{id}) return id_card_url; helper-facing /helper/me and /helper/login do NOT. Curl-verified: patch sets address+id_card_url; /helper/me has NO id_card_url key. SECURITY: id_card is owned by the parent uploader; a helper media token 404s it (not own/care-team/helper-msg)."
  - task: "Overdue Reminders: POST /todos/nudge-overdue"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Parent/admin only (403 otherwise). Finds all OPEN tasks with due_date < today, groups by assignee, posts ONE '⏰ Reminder ...' family-chat message per assignee (listing up to 4 titles + '+N more') and pushes each assignee (non-blocking). Returns {nudged: <people>, tasks: <total overdue>, names: [...]}. Curl-verified: with 1 overdue -> {nudged:1,tasks:1,names:['Priya']}; with none -> {nudged:0,tasks:0}."

frontend_batch37:
  - task: "Helper profile & documents in Add + Edit (photo/phone/address/ID card)"
    implemented: true
    working: true
    file: "frontend/src/components/HelperProfileFields.tsx, frontend/app/helper/add.tsx, frontend/app/helper/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "New reusable HelperProfileFields (photo avatar w/ camera+gallery picker + permission flow, phone, address, private ID-card image upload via uploadMedia). Add-helper form (helper/add.tsx) includes it under 'Profile & contact' and sends photo_url/phone/address/id_card_url. Helper detail (helper/[id].tsx) shows a 'Contact & documents' card (phone/address/ID thumbnail) with an Edit link (helper-edit-profile) opening a modal (profile-save) that PATCHes. Identity header shows the photo when set. Screenshot-confirmed: contact card + edit modal render (phone/address/ID upload). Editing is parent-only (helper portal has no such screen)."
  - task: "Home Overdue Reminders banner (Remind all)"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Family tasks section shows a red '<n> tasks overdue · Remind all' banner (task-nudge-overdue) for parents when overdueCount>0; tap calls /todos/nudge-overdue and shows a bottom toast '⏰ Reminded <names>'."
  - task: "Calendar Week Heatmap"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/calendar.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Week view rows are now tinted by event count (coral alpha ramp 0..4+), show the count under the date, and busy days (>=4) get a '🔥 Busy day · N events' caption + accent border. Uses the member-filtered byDate so filtering re-shades."
  - task: "Helper Reply Chip: one-tap 'On it 👍' on Care Team alerts"
    implemented: true
    working: true
    file: "frontend/app/helper-portal/notifications.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Care Team alert rows in the helper Alerts feed have an 'On it 👍' chip (helper-reply-<i>) that POSTs to /helper/care-team without navigating (stopPropagation); shows 'Sent' + a bottom flash. Non-care-team rows have no chip."

agent_communication_batch37:
    -agent: "main"
    -message: "Batch #37 = 4 user asks. CREDS parent storytester@fam.com/secret123, helper sunita/1234 (help_c77a0a30120545bb; demo now has phone +91 98765 43210 + a Bengaluru address, no ID card). TEST BACKEND: (1) PATCH /helpers/{id} with address+id_card_url persists & GET /helpers/{id} returns them; /helper/me (helper token) must NOT contain id_card_url; a helper media token must 404 the id_card file. (2) POST /todos/nudge-overdue as parent -> {nudged,tasks,names}, posts per-assignee family-chat msgs; 403 for a non-parent. TEST FRONTEND: (a) Add Helper form has Profile & contact (photo/phone/address/ID upload) and creates a helper with them; Helper detail 'Contact & documents' shows them with an Edit modal (helper-edit-profile -> profile-save) that saves; editing is parent-only. (b) Home parent sees a 'Remind all overdue' banner (task-nudge-overdue) when tasks are overdue -> toast. (c) Calendar Week view rows are shaded by busyness (heatmap) with 🔥 on packed days. (d) Helper portal (sunita/1234) -> bell -> Alerts -> a Care Team row shows 'On it 👍' (helper-reply-<i>); tapping posts to Care Team + shows 'Sent' without navigating away. Do NOT run destructive cleanup; keep Sunita + demo data. Native camera/gallery/mic remain device-only (web picker may be limited)."

# ============ Feature Batch #38 (Medical fields revamp / Login redesign / Reset-email deliverability) ============
backend_batch38:
  - task: "Medical card: doctor_phone + structured insurance (4 types), detail-gated"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "MedicalCardIn gained doctor_phone + insurance: List[InsuranceEntryIn] (type/provider/policy_number/phone). _MEDICAL_DETAIL_FIELDS now includes doctor_phone + insurance so they are stripped for viewers without medical-detail permission (helper Care-Team medical view already selects only allergies/blood_group/doctor/emergency_contact so no leak). blood_group + allergies remain family-visible strings. Curl-verified: PUT saves doctor_phone + insurance list; GET (admin) returns them."
  - task: "Reset-password email deliverability (managed Resend)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "No code change needed — send_email matches the managed-Resend playbook and the proxy returns 202 + id (verified a live send to happytoconnect@gmail.com -> 202, id e75231a7...). Issue is spam/inbox delivery, not a bug. Added a 'check Spam/Junk' hint on the forgot verify screen. User was testing in PRODUCTION (can't be reached from preview); code path is identical."

frontend_batch38:
  - task: "Medical/Emergency editor: blood-group dropdown, allergy chips + Other, doctor name+phone, insurance types"
    implemented: true
    working: true
    file: "frontend/app/emergency/medical/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Edit mode: 8 blood-group selector chips (bg-<grp>), COMMON_ALLERGIES multi-select pills (allergy-<name>) + custom 'Other' input (allergy-custom-input/allergy-add) with removable custom tags, Doctor name (medcard-doctor) + phone (medcard-doctor_phone), 4 insurance cards Health/Critical/Term/Vehicle (ins-<type>-provider/policy/phone), plus medication/conditions/hospital/emergency_contact text fields. View mode: blood/allergy big cards (allergies as tags), Doctor row with tap-to-call (call-doctor), Insurance list with per-entry call, other fields. Edit restricted to self or admin/parent (canEdit)."
  - task: "Login redesign: PIN-first, visible trusted-helper button, simplified login, spam hint"
    implemented: true
    working: true
    file: "frontend/app/(auth)/pin.tsx, welcome.tsx, login.tsx, forgot.tsx, _layout.tsx, src/auth/AuthContext.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "AuthContext computes hasQuickSignin (from REMEMBER_KEY pin_set + ROSTER_KEY members) at bootstrap; root gate now sends logged-out returning families to /(auth)/pin first (else welcome). PIN 'Who's this?' picker gained an always-visible bottom action area: 'Sign in with email & password' (pin-email-login) + prominent 'I'm a trusted helper' (pin-helper-login); back at picker goes to welcome. welcome.tsx: trusted-helper is now a clearly visible outlined button (screenshot-confirmed). login.tsx simplified (or-divider before Google/Apple, PIN moved to a light link login-pin-btn, back respects hasQuickSignin). forgot.tsx shows a 'check Spam/Junk' note on the verify step."

agent_communication_batch38:
    -agent: "main"
    -message: "Batch #38 = medical revamp + login redesign + reset-email note. CREDS parent storytester@fam.com/secret123 (parent member mem_e8380cf812624082 now has demo medical: O+, allergies Peanuts/Dust/Kiwi, Dr. Mehta +91 90000 11111, Health+Vehicle insurance). Helper sunita/1234. LOGIN NOTE: fresh web browser has NO saved profiles so the gate opens /(auth)/welcome; 'I already have an account' -> login.tsx; login-pin-btn -> pin picker. On a device with saved PINs the app opens the PIN picker first. TEST BACKEND: PUT /emergency/medical/{member_id} accepts doctor_phone + insurance[]; GET returns them for admin; a viewer WITHOUT medical-detail permission must NOT see doctor_phone/insurance/medication/conditions (blood_group+allergies OK); helper Care-Team medical view still only exposes allergies/blood_group/doctor/emergency_contact (no doctor_phone/insurance leak). TEST FRONTEND: (a) Medical editor (open a member -> Medical info -> edit): blood-group chips, allergy pills + custom Other, doctor name+phone, 4 insurance type cards; Save persists; view mode shows tap-to-call doctor + insurance list. (b) Login: welcome shows a clear 'I'm a trusted helper' button; login page simplified with a 'Family member? Sign in with a PIN' link -> PIN picker which shows 'Sign in with email & password' + 'I'm a trusted helper' buttons. (c) forgot password verify step shows a Spam/Junk hint. Do NOT run destructive cleanup; keep Sunita + demo data. Native camera/mic remain device-only."

# ============ UX Polish Batch #39 — Calendar Task view + polish ============
backend_batch39:
  - task: "GET /api/tasks/upcoming — powers Calendar Task view"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New family-scoped endpoint returns all OPEN to-dos across every list sorted by due_date (nulls last) with assignee member-card, priority, days_until_due, overdue flag, scope (mine/kids/family), and can_manage. Reuses _member_card + _days_until. Curl-verified with storytester@fam.com (returns Family Tasks + Vacation Packing items)."

frontend_batch39:
  - task: "Calendar Task view (4th view) + month-cell readability"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/calendar.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Added a 4th segment 'Tasks' (cal-view-task) to the Month/Week/Day switch. Task view fetches /tasks/upcoming and groups open to-dos into Overdue / Due today / This week / Later / No date with a colored group header + count. Each row (cal-task-<id>) shows a toggle circle (cal-task-check-<id> -> POST /todos/items/{id}/toggle, optimistic remove), title, High-priority flag tag, due date (red if overdue), list name, and assignee avatar. Member filter row filters tasks by assignee. Empty state 'All caught up!'. FAB routes to /todos in Task view. Hero shows 'Tasks' + open count, hides prev/next arrows. Month-cell event pill font bumped 8->9 for readability. Screenshot-verified Task view renders (grouped, priority tags, avatars, toggles)."

agent_communication_batch39:
    -agent: "main"
    -message: "UX Batch #39 (start of app-wide polish pass) = added the missing Calendar Task view. CREDS parent storytester@fam.com/secret123. TEST BACKEND: GET /api/tasks/upcoming (auth required; 401 without token) returns {tasks:[...], can_manage:bool}; each task has item_id/title/priority/due_date/days_until_due/overdue/assignee/scope/list_name; family-scoped (no cross-family leak). Toggling via POST /todos/items/{id}/toggle marks done. TEST FRONTEND: Calendar tab -> tap 'Tasks' segment (cal-view-task) -> grouped open to-dos render; tapping a task's circle (cal-task-check-<id>) removes it (marked done); member filter row filters by assignee; switching back to Month/Week/Day still works (no regression). Do NOT run destructive cleanup; keep Sunita + demo data."
