# PairOn — Feature Backlog & Tech Debt
> Items to implement when ready. Tell the AI which one to start.

---

## 🔴 High Priority (do before public launch)

### TURN-1 — Your own TURN server credentials
- Go to https://dashboard.metered.ca/signup → free account → get API key
- Add `TURN_API_KEY` to backend `.env`
- Update `CallContext.tsx` ICE servers to use your key
- **Why urgent**: Current hardcoded key hits monthly cap → all calls silently break

### RATE-1 — Rate limiting on API
- Add `express-rate-limit` to auth routes (login, signup)
- Throttle socket events (matchmaking spam, message flooding)
- **Why urgent**: Security — brute force & abuse protection before launch

### ENV-1 — Environment variable validation at startup
- Use `zod` or `envalid` to validate all required env vars on backend boot
- If any missing → crash with a clear error message instead of silent failure
- Keys to validate: `JWT_SECRET`, `MONGODB_URI`, `TURN_API_KEY`, etc.

### ERR-1 — React Error Boundaries
- Wrap Monaco editor in an Error Boundary
- Wrap terminal panel in an Error Boundary
- Show friendly "Something crashed — Reload" UI instead of blank white screen

### MEM-1 — WebContainer cleanup on session end
- Call `webcontainerRef.current?.teardown()` when the user leaves the collaboration session
- Prevents memory leak over time

---

## 🟡 Medium Priority (next meaningful features)

### NOTIF-1 — Persistent notification system
- Bell icon in top nav with unread badge count
- Notification dropdown showing: friend requests, collab invites, missed calls
- Real-time via socket push
- Mark as read / clear all
- Notifications should work on any page (dashboard, IDE, etc.)

### SHARE-1 — Share link to session
- Generate a link like `pairon.app/join/[sessionId]`
- Anyone with the link can request to join the session
- Host sees a join request → accept/decline
- Bypasses the friend system, lowest friction collaboration entry

### SESSION-END-1 — Prompt to download project at session end
- When session timer expires OR both users leave → show wrap-up screen
- "Your session has ended — download your project before it's gone"
- Show: time coded, files created, download ZIP button, GitHub push button
- Optional: rate your partner

### MATCH-CTX-1 — Show project idea before entering session (stranger match)
- After matching, show a 3-second "You're being matched to build: [Project Idea]" screen
- Both users see it simultaneously before entering the IDE
- Gives shared context — currently strangers are surprised by the project idea

### SOLO-UI-1 — Clear solo mode UI when partner leaves
- When partner force-leaves, show a clear "Your partner left — you're now in solo mode" banner
- Options: Continue solo / Leave session
- Currently the state is unclear to the user

---

## 🟢 Lower Priority (nice to have)

### MOBILE-BANNER-1 — Mobile IDE banner
- Detect mobile screen size
- Show a non-blocking banner: "PairOn's code editor works best on desktop. Some features may be limited on mobile."
- Do NOT block access — just warn

### PWA-1 — Make PairOn installable (PWA)
- Add `manifest.json` with app name, icons, theme color
- Add basic service worker
- Users can "Add to Home Screen" for native app feel

### SEO-1 — Landing page SEO
- Add proper title tags and meta descriptions on every page
- Target keywords: "pair programming platform", "collaborative coding", "real-time code editor"
- Add Open Graph tags for link previews

### STRANGER-SAFETY-1 — Report session button
- Add "Report" button in collaboration session
- Captures: session ID, reporter ID, reason
- Sends to backend for review
- Protect against inappropriate code pasting / terminal abuse

### SAVED-PROJ-1 — Verify saved projects actually work end-to-end
- Test: save project during session → go to dashboard → open saved project → code is there
- Fix whatever is broken in the load/resume flow

### SESSION-TIMER-OUT-1 — Session countdown visible outside session
- Session timer (Sprint 3hr, etc.) is in the session but not on dashboard
- Show time remaining on session card in dashboard

### CREDITS-STATS-1 — Stats page (future)
- Total hours coded
- Sessions completed
- Streak
- Put in a "Credits" or "Profile" page, not dashboard

---

## 📝 Notes
- CodeMirror swap (for better mobile editor): medium effort, doesn't break real-time sync. Do if mobile usage grows.
- GitHub push: already exists IN session. Gap is after session ends — covered by SESSION-END-1.
- User profiles (avatar, bio, ratings): not a priority now.
- Gamification (XP, badges, streaks): future feature.
