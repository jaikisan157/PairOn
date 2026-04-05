# Comprehensive Notification & Event Handling Matrix

To ensure a flawless experience, we handle real-time events based on **where the receiving user is (Route)** and **their connection status**. This document explicitly covers every edge case: offline crashes, explicit logouts, friend request acceptances, and multi-tab synchronization.

---

## 1. The 3 User States
For any interaction caused by **User A**, **User B (the receiver)** operates in one of three states:
1. **State 1 (Focused):** User B is actively on the exact page where the event happens (e.g., inside the specific session, or in the specific DM chat window).
2. **State 2 (Backgrounded / Elsewhere):** User B is online but on a different page (e.g., Dashboard, looking at settings, or in a different DM).
3. **State 3 (Offline / Logged Out):** User B has closed the browser, lost internet, or explicitly clicked "Log Out."

---

## 2. Collaboration Session Scenarios

### 2.1 User A navigates away from the Session (Dashboard, DMs, etc.)
* **User A:** Remains logically in the session. A floating "Return to Session" button appears on their screen. If they try to join a *new* session, they are blocked: *"You already have an active session. Please finish it or leave it first."*
* **User B (All States):** **Nothing happens.** User B is not bothered. User A is allowed to multi-task silently.

### 2.2 User A closes the browser, app crashes, or loses internet
* **User B (All States):** **Nothing happens.** User B simply continues working solo. We assume User A might come back.
* **User A (When they return/reopen browser):** User A logs in and gets a prominent banner: *"You have an ongoing collaborative session. [Rejoin] [End Session]"*. If the timer expired while they were gone: *"Your previous session finished while you were offline."*

### 2.3 User A explicitly clicks "Leave Session"
* **User B (State 1 - Focused):** Sees a Toast/Modal: *"User A has permanently left the session. You are now working Solo."* (The session timer continues uninterrupted).
* **User B (State 2 - Backgrounded):** A Toast popup appears: *"User A explicitly left your active session."*
* **User B (State 3 - Offline):** Next login: Bell notification *"User A left your shared session."*

### 2.4 User explicitly clicks "Log Out" (from the Navbar)
* **What happens behind the scenes:** This acts as a forced explicit "Leave Session" for any active sessions they are in.
* **User B:** Receives the *"User A has permanently left the session"* notification instantly.

### 2.5 Timer Expires (Time's Up)
* **User B (State 1 - Focused):** "Time's UP!" modal overlay appears. No toasts needed.
* **User B (State 2 - Backgrounded):** A sticky Toast appears: *"Time's Up for your session with User A! Action required."* Clicking it routes them to the session to Save/Overtime.
* **User B (State 3 - Offline):** Backend pauses the session. If no input is received after 5 minutes, auto-saves the project. Next login: *"Session with User A automatically saved due to time expiration."*

---

## 3. Direct Messages (DMs) Scenarios

### 3.1 User A Sends a Message
* **User B (State 1 - Focused in chat):** Message injects into chat. A "Read Receipt" is instantly sent back to User A. No bell increments.
* **User B (State 2 - Backgrounded):** Subtle Toast pop-up with message preview. Bell icon gets a red dot. Incoming "pop" sound plays.
* **User B (State 3 - Offline):** Stored in DB as unread. No immediate action. 

### 3.2 Typing Indicators
* **User A typing...**
* **User B (State 1 - Focused):** Sees "User A is typing..." animation.
* **User B (State 2 & 3):** Discarded. Never show typing indicators as global toasts or DB notifications.

---

## 4. Friend Request Scenarios

### 4.1 User A Sends Request to User B
* **User B (State 1/2 - Online):** Toast: *"User A sent you a friend request."* Bell unread count increments.
* **User B (State 3 - Offline):** Stored in DB. Bell dropdown populated upon login.

### 4.2 User B Accepts the Request
* **User A (State 1/2 - Online):** Toast: *"User B accepted your friend request!"*
* **User A (State 3 - Offline):** Database bell notification waiting for them.

---

## 5. Collaboration Proposals / Invites

### 5.1 User A Invites User B
* **User B (State 1/2 - Online, NOT in session):** Persistent Toast/Dialog: *"User A is inviting you to code! [Accept] [Decline]"*. Ringing sound plays.
* **User B (State 1/2 - Online, ALREADY IN session):** System auto-declines. User A gets instant Toast: *"User B is currently busy in an active session."*
* **User B (State 3 - Offline):** User A gets instant Toast: *"User B is offline. Invite sent in case they log in shortly."* Invite has a 5-minute TTL.

### 5.2 User B Accepts the Invite
* **User B:** Screen transitions to the matching/loading screen, then drops into the IDE.
* **User A (State 1/2 - Online):** System intercepts the acceptance and violently routing User A into the new session as well seamlessly.
* **User A (State 3 - Offline):** (E.g. they sent invite and closed laptop). User B gets: *"User A has gone offline since sending this invite. Cannot connect."*

---

## 6. System Lifecycle Scenarios

### 6.1 "Catching Up" (User logs in after being offline)
When a user logs in, the `Auth` success hook triggers a fetch of all unread notifications.
* **Behavior:** Do NOT fire 50 toasts for every missed message. Instead, bundle them.
* **UI Result:** Bell icon shows a badge (e.g. `9+`). The dropdown contains sorted items:
   - "3 new messages from User A"
   - "User C accepted your friend request"
   - "Your session with User D was auto-saved"

### 6.2 Strict Single-Session Enforcement (Opening a New Tab or Device)
*The platform enforces that an account can only be active in one tab/device at a time.*
* **Event Trigger:** User B opens PairOn in a new tab or logs in on a new device.
* **Backend Action:** The backend detects a new socket/token connection for the same `user_id`. It immediately emits a specialized `force_terminate` event to the *old* socket, and terminates its connection.
* **What happens to the OLD Tab/Device:** The UI is immediately frozen. A blocking, non-dismissible modal appears: *"Session Terminated: You have opened PairOn in another tab or logged in from another device."* All local timers are frozen here.
* **What happens to User A (if collaborating with User B):** 

---

## 7. Notification Bell UI & Data Lifecycle
*To ensure the UI doesn't become cluttered, we must strictly define what goes into the Bell versus other UI elements, and how notifications are cleared.*

### 7.1 What Goes into the Bell vs. Message Icon
* **Message Icon (Chat Bubble):** Only Direct Messages (DMs) go here. The unread count here specifically reflects unread chat messages.
* **Notification Bell (The Bell):** Everything else goes here. 
    * *Friend Requests received & accepted.*
    * *Missed Collaboration Invites (that haven't expired).*
    * *System Alerts (e.g., "Your session timed out and was saved", "User A permanently left your session").*

### 7.2 Interactions inside the Bell Dropdown
* **Clicking an Item:** Marks that specific notification as `is_read = true` in the database, removes the highlighted background, and **navigates the user** to the relevant page (e.g., clicking a friend request routes to the `/friends` page; clicking a saved session routes to the `/dashboard`).
* **"Mark All as Read":** A crucial button at the top of the dropdown that executes a bulk update to `is_read = true` for the user, instantly dropping the badge count to 0.
* **Actionable Notifications:** For Friend Requests and Invites, the dropdown should include inline `[Accept]` and `[Decline]` buttons so the user doesn't even have to leave their current page.

### 7.3 Data Cleanup (The Time-to-Live)
* **Expired Invites:** If User A sends a Collab Invite, it goes to the Bell. If 5 minutes pass, a background worker or frontend check should auto-remove or grey out the invite so User B cannot accept a stale session.
* **Routine Purge:** To prevent the database from bloating, notifications that are marked as `is_read` should be securely auto-deleted after 30 days.
