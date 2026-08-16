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
