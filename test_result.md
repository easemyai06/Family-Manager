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
