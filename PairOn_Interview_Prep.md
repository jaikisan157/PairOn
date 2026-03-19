# PairOn — Complete SDE Intern Interview Question Bank
*Senior Engineer Perspective | 10 YOE | Every possible angle covered*

> Read this end-to-end at least twice before your interview. For every answer, always explain your **reasoning** — not just the answer.

---

# PART 1 — PROJECT UNDERSTANDING

## Q1. Explain PairOn in under 60 seconds to a non-technical person.
> PairOn is like Google Docs for code. Two developers are matched together, and they get a shared code editor in their browser where both can type, run their code, chat, and push everything to GitHub — all without installing anything.

## Q2. Explain PairOn to a senior engineer.
> PairOn is a browser-native collaborative IDE built on WebContainers (StackBlitz API) for in-browser Node.js execution. It uses Socket.IO for real-time bidirectional event broadcast between matched sessions, Monaco Editor for the code surface, XTerm.js for terminal rendering, and a custom file-tree sync layer that reconciles WebContainer FS state with React state via polling + fs.watch events.

## Q3. What was your motivation behind building this project specifically?
Good answer: Pair programming is proven to produce higher quality code. Tools like Zoom screen share are passive — only one person types. PairOn gives both users an active coding environment with their own cursor and terminal.

## Q4. What is the biggest technical achievement in PairOn?
Answer should focus on: The real-time bidirectional sync — keeping two completely independent Monaco editor instances perfectly in sync without either user's cursor being disrupted, while also syncing the underlying WebContainer filesystem.

## Q5. What would you remove from PairOn if you had to cut scope by 50%?
Shows product prioritization. Good answer: Remove the credit/reputation system and kanban board — keep the core: matching, real-time IDE sync, terminal sharing. Those are the differentiators.

## Q6. Who competes with PairOn and how are you different?
| Competitor | Difference |
|---|---|
| Replit Multiplayer | No structured matchmaking; Replit requires accounts and projects to pre-exist |
| CodeSandbox | No matchmaking, no terminal sharing for free |
| Tuple/CoScreen | Desktop app, no browser execution, paid |
| Leetcode | No collaboration at all |

---

# PART 2 — SYSTEM DESIGN

## Q7. Design the matchmaking system from scratch.
Expected approach:
1. User submits request: `{ language, experience_level, topic, availability_window }`
2. Store in a `waiting_pool` table with `expires_at` (e.g., 5 min timeout)
3. On new request: query `waiting_pool` for compatible users, score them (weighted similarity)
4. If match found: create session, notify both users via socket, remove from pool
5. If no match: stay in pool until someone compatible joins or timeout
6. Edge cases: user disconnects while waiting → remove from pool on `socket.disconnect`

## Q8. How would you scale PairOn to 100,000 concurrent users?
- **WebContainer:** Scales for free — runs in user's browser, zero server CPU per user
- **Socket.IO:** Replace in-memory adapter with Redis Pub/Sub adapter (`socket.io-redis`) so multiple backend instances can share rooms
- **Load balancer:** Use sticky sessions (consistent hash by `sessionId`) so the same user always hits the same server
- **Database:** Read replicas for profile/session queries; connection pooling (PgBouncer)
- **CDN:** Vercel already CDN-distributes the frontend bundle
- **Rate limiting:** Move from in-memory to Redis-backed rate limiting

## Q9. How would you add video calling to PairOn without server cost?
- Use **WebRTC** (peer-to-peer) — video/audio streams go directly between browsers
- Backend only needed for **ICE/STUN/TURN signaling** (exchanging IP candidates)
- Socket.IO already present → use it as the signaling channel
- Free STUN servers: Google (`stun:stun.l.google.com:19302`)
- TURN server needed only for users behind symmetric NAT (paid, e.g., Twilio TURN)

## Q10. If PairOn stored code in a database instead of WebContainers, what would change?
- Would need a database column per file (or a files table with `session_id, path, content`)
- Lose instant execution — would need a server-side sandbox (Docker) for running code
- Gain: persistence across sessions, history/versioning
- The current tradeoff: WebContainers are ephemeral but free and instant

## Q11. How would you implement "session recording and playback"?
- On every `code:file-change` event, append to a `timeline` array: `{ timestamp, path, content, userId }`
- Store timeline in DB at session end
- For playback: replay events at original intervals using `setTimeout` chains
- Bonus: scrub bar using the timestamps as percentages

## Q12. How would you add offline support to PairOn?
- Use a Service Worker to cache the app shell
- Store pending file changes in IndexedDB while offline
- On reconnect: diff local changes vs server state, apply with conflict resolution (last-write-wins or manual merge)
- This is essentially what CRDTs solve (Yjs, Automerge)

---

# PART 3 — REAL-TIME & SOCKETS (DEEP DIVE)

## Q13. Explain the WebSocket handshake process.
1. Client sends HTTP `GET` with headers: `Connection: Upgrade`, `Upgrade: websocket`, `Sec-WebSocket-Key: <random base64>`
2. Server responds `101 Switching Protocols` with `Sec-WebSocket-Accept: <SHA1 of key + magic string>`
3. Connection upgrades from HTTP to WebSocket (persistent, full-duplex TCP channel)
4. Socket.IO uses WebSocket as transport, with HTTP long-polling as fallback

## Q14. What is the difference between Socket.IO rooms and namespaces?
| | Rooms | Namespaces |
|---|---|---|
| Purpose | Dynamic grouping within a namespace | Static logical separation |
| Created by | `socket.join('room-name')` | `io.of('/namespace')` |
| Use in PairOn | `session:{sessionId}` rooms for isolating session events | Default namespace `/` used |
| Overhead | Lightweight (just a Set of socket IDs) | Separate event namespace, slight overhead |

## Q15. What happens when a Socket.IO client disconnects unexpectedly (tab closed, internet lost)?
- Server heartbeat (ping-pong) detects dead connection after timeout (~20-25s by default)
- `socket.on('disconnect', reason)` fires on the server
- PairOn should: notify partner via `partner:disconnected`, start a reconnection grace period timer
- Client: Socket.IO has built-in reconnection with exponential backoff

## Q16. What is the difference between `socket.emit`, `socket.broadcast.emit`, `io.emit`, and `socket.to('room').emit`?
| Method | Recipients |
|---|---|
| `socket.emit('event', data)` | Only the current socket (self) |
| `socket.broadcast.emit('event', data)` | All connected sockets EXCEPT current |
| `io.emit('event', data)` | ALL connected sockets including current |
| `socket.to('session:123').emit(...)` | All sockets in room `session:123` EXCEPT current |
| `io.to('session:123').emit(...)` | ALL sockets in room `session:123` including current |

## Q17. What is Socket.IO acknowledgement and when would you use it in PairOn?
```javascript
// Sender
socket.emit('code:file-change', data, (ack) => {
  console.log('Partner received:', ack); 
});

// Receiver  
socket.on('code:file-change', (data, callback) => {
  applyChange(data);
  callback({ status: 'ok' }); // acknowledgement
});
```
Use case in PairOn: Confirming file push received — if no ack within 5s, retry.

## Q18. How did you debug the "feedback loop" bug and what tools did you use?
- Added `console.log` in every socket event handler to trace the execution path
- Noticed `ide:state-snapshot` was being triggered every ~1 second
- Traced backwards: snapshot → `ide:partner-rejoined` → `ide:state-update` → autosave → typed → autosave
- Used browser Network tab → WS frames to see the actual socket messages in real time
- Fixed by removing the `partner-rejoined` emit from `state-update`

## Q19. What is the `senderId` pattern and why not use Socket.IO's built-in `socket.to()` which already excludes the sender?
`socket.to('room').emit()` excludes the sender at the **server level** — the sender never receives it. But the `senderId` check is a **client-level** guard for a different reason: when the sender themselves also has the same `socket.on` listener registered (e.g., for applying file changes), we want them to skip processing events they already applied locally. It's defensive programming.

## Q20. Explain the `suppressSyncRef` pattern in the Monaco editor listeners.
```javascript
// When we apply incoming changes from partner, we set this flag
suppressSyncRef.current = true;
model.pushEditOperations([], [{ range, text: content }], () => null);
suppressSyncRef.current = false;
// ↑ This prevents onDidChangeModelContent from re-emitting the change back to partner (echo loop)
```

---

# PART 4 — REACT DEEP DIVE

## Q21. What is the virtual DOM and how does React use it?
- React maintains a lightweight JavaScript representation of the real DOM in memory (the "virtual DOM")
- On state change, React creates a new virtual DOM tree and **diffs** it against the previous one (reconciliation)
- Only the actual DOM nodes that changed get updated (minimal DOM mutations = better performance)
- In PairOn: when `files` state changes, React re-renders only the file tree nodes that changed

## Q22. What is reconciliation and what is the key prop for?
- Reconciliation: React's algorithm to determine what changed between renders
- By default, React uses component position in the tree to identify elements
- `key` prop: gives React a stable identity for list items
- Without `key` in file tree `renderTree()`: React might reuse wrong DOM nodes when files are added/deleted → visual glitch
- With `key={file.path}`: React correctly identifies each file entry

## Q23. Explain `useEffect` — when does it run and what is the cleanup function?
```javascript
useEffect(() => {
  // runs AFTER render (like componentDidMount + componentDidUpdate)
  const socket = getSocket();
  socket.on('code:file-change', handler);
  
  return () => {
    // cleanup runs BEFORE next effect OR on unmount (like componentWillUnmount)
    socket.off('code:file-change', handler);
  };
}, [dependency]); // re-runs when dependency changes
```
In PairOn: Socket listeners are registered in `useEffect` with cleanup to avoid duplicate handlers on re-renders.

## Q24. What is `useCallback` and why is deleteFile wrapped in it?
- Without `useCallback`: `deleteFile` is a new function reference on every render
- Child components receiving `deleteFile` as a prop would re-render even if nothing changed
- `useCallback([sessionId, activeFile, autosave, addToast])` memoizes the function — only recreated when dependencies change
- Also required for functions used in `useEffect` dependency arrays (avoids infinite loops)

## Q25. What is `useMemo` and where could it be applied in CollabIDE?
```javascript
// Example: computing the file tree structure is expensive on large projects
const tree = useMemo(() => buildTree(files, folders), [files, folders]);
// Without useMemo: buildTree runs on EVERY render even if files/folders didn't change
```
In PairOn: The file tree rendering (`renderTree`) could be memoized. The list of open tabs, filtered files for quick-open, etc.

## Q26. What is `React.memo` and when would you use it in PairOn?
```javascript
const FileTreeItem = React.memo(({ path, isActive, onClick }) => {
  return <div onClick={onClick}>{path}</div>;
});
// Without memo: FileTreeItem re-renders whenever the parent CollabIDE re-renders
// With memo: only re-renders when path, isActive, or onClick changes
```
Good candidates in PairOn: Individual file tree items, tab bar items, terminal components.

## Q27. Explain the difference between controlled and uncontrolled components. Which does PairOn's chat input use?
- **Controlled:** Value stored in React state, `onChange` updates it → `<Input value={newMessage} onChange={e => setNewMessage(e.target.value)} />`
- **Uncontrolled:** Value stored in DOM, accessed via `ref` → `<input ref={inputRef} />`
- PairOn's chat input is **controlled** (value from `newMessage` state) — allows real-time character counting, @ai detection, controlled submission

## Q28. What are React Error Boundaries and does PairOn use them?
- Error Boundaries catch JavaScript errors in child component trees during rendering
- Must be class components (cannot be functional with hooks currently)
- Without them: one crashed component crashes the entire app
- PairOn should wrap `CollabIDE` in an Error Boundary — if WebContainer fails, show a friendly "IDE failed to load" message instead of a blank screen

## Q29. What is Context API and when would you use it over prop drilling in PairOn?
- Context: share data without passing props through every level
- In PairOn: `user`, `sessionId`, `addToast` are passed as props or accessed locally
- Better design: wrap in `SessionContext` so any deeply nested component can access `sessionId` without being passed it through 5 levels

## Q30. What is lazy loading in React and how would you apply it to PairOn?
```javascript
const CollabIDE = React.lazy(() => import('./components/CollabIDE'));
// CollabIDE's large Monaco bundle is only downloaded when user enters a session
// Shows a fallback while downloading:
<Suspense fallback={<LoadingScreen />}>
  <CollabIDE ... />
</Suspense>
```
Monaco Editor is ~2MB of JS — lazy loading it dramatically improves initial page load time.

---

# PART 5 — TYPESCRIPT DEEP DIVE

## Q31. What is the difference between `interface` and `type` in TypeScript?
```typescript
interface User { id: string; name: string; }
type User = { id: string; name: string; };

// Interface: extendable (declaration merging), better for OOP/classes
// Type: more powerful (unions, intersections, computed types)

type FileState = Record<string, string>; // can't do this with interface
interface ExtendedUser extends User { role: string; } // easy with interface
```

## Q32. Explain generics with an example from PairOn.
```typescript
// Generic function
function getOrDefault<T>(map: Map<string, T>, key: string, fallback: T): T {
  return map.get(key) ?? fallback;
}

// Used with Monaco models:
const model = getOrDefault<monaco.editor.ITextModel>(modelsRef.current, path, null!);

// Generic constraints
function emitEvent<T extends { sessionId: string }>(socket: Socket, event: string, data: T) {
  socket.emit(event, data);
}
```

## Q33. What are union types and when are they useful?
```typescript
type ViewMode = 'chat' | 'code'; // only these two values allowed
type PartnerStatus = 'online' | 'away' | 'offline';
type ToastType = 'success' | 'error' | 'info' | 'warning';

// Guards
function handleView(view: ViewMode) {
  if (view === 'code') { /* ... */ }
  // TypeScript knows only 'chat' is left here
}
```

## Q34. What are TypeScript utility types? Name 5 and show usage.
```typescript
type User = { id: string; name: string; email: string; password: string; };

Partial<User>           // { id?: string; name?: string; ... } — all optional
Required<User>          // all fields required (opposite of Partial)
Pick<User, 'id'|'name'> // { id: string; name: string; } — just these fields
Omit<User, 'password'>  // removes 'password' from type
Record<string, string>  // { [key: string]: string } — used for files state
Readonly<User>          // all fields immutable
ReturnType<typeof fn>   // extracts the return type of a function
```

## Q35. What is type narrowing?
```typescript
function processContent(content: string | null) {
  if (content === null) return ''; // TypeScript narrows: content is null here
  return content.toUpperCase();    // TypeScript knows: content is string here
}

// instanceof narrowing
if (error instanceof Error) {
  console.log(error.message); // TS knows it has .message
}
```

---

# PART 6 — NODE.JS & BACKEND INTERNALS

## Q36. Explain the Node.js event loop.
Node.js is single-threaded but handles concurrency via the event loop:
1. **Call Stack:** Executes synchronous code
2. **Node APIs:** Offloads async work (file I/O, network) to libuv (C++ thread pool)
3. **Callback Queue / Microtask Queue:** When async work completes, callback is queued
4. **Event Loop:** Continuously picks callbacks from queue and pushes to call stack when stack is empty

Priority order: `process.nextTick` → Promises → `setImmediate` → `setTimeout/setInterval`

Why relevant to PairOn: Socket.IO event handlers are async — understanding the event loop explains why multiple socket events don't block each other.

## Q37. What is middleware in Express and how does the chain work?
```javascript
app.use((req, res, next) => {
  console.log('Request received');
  next(); // pass to next middleware
});

app.use(authMiddleware); // validates JWT
app.use('/api', router); // route handlers
```
- Middleware is a function `(req, res, next) => void`
- `next()` passes to the next middleware; `next(error)` skips to error handler
- Execution is linear — order matters
- In PairOn: CORS → rate limiting → JSON body parser → auth → route handlers

## Q38. How does `async/await` work under the hood?
```javascript
async function fetchUser(id) {
  const user = await db.findById(id); // pauses here, continues when Promise resolves
  return user;
}
// Equivalent to:
function fetchUser(id) {
  return db.findById(id).then(user => user);
}
```
`async` functions always return a Promise. `await` pauses execution of the async function (not the entire thread) and resumes when the Promise settles. Node.js continues running other code while waiting.

## Q39. What is the difference between `Promise.all`, `Promise.allSettled`, `Promise.race`, and `Promise.any`?
```javascript
// Push 5 files to GitHub simultaneously:
await Promise.all(files.map(f => pushFile(f)));
// If ANY fails → entire Promise.all rejects

await Promise.allSettled(files.map(f => pushFile(f)));
// Wait for ALL, get results array with {status: 'fulfilled'|'rejected', value/reason}

await Promise.race([pushFile(f), timeout(5000)]);
// Resolves/rejects with WHICHEVER settles first (used for timeouts)

await Promise.any([server1.push(f), server2.push(f)]);
// Resolves with FIRST success; only rejects if ALL fail
```

## Q40. What is the `trust proxy` setting and why did PairOn need it?
On Render (a cloud host), all traffic goes through a load balancer/reverse proxy. The actual client IP is in `X-Forwarded-For` header. Express by default doesn't trust this header (anyone could fake it). `app.set('trust proxy', 1)` tells Express to trust the first proxy hop, enabling `req.ip` to return the real client IP correctly — required for `express-rate-limit` to work per-user.

## Q41. How would you implement rate limiting without a library?
```javascript
const requests = new Map(); // ip → { count, windowStart }
app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const window = 60_000; // 1 minute
  const limit = 100;
  
  if (!requests.has(ip) || now - requests.get(ip).windowStart > window) {
    requests.set(ip, { count: 1, windowStart: now });
    return next();
  }
  const record = requests.get(ip);
  if (record.count >= limit) return res.status(429).json({ error: 'Too many requests' });
  record.count++;
  next();
});
```
Production issue with this: In-memory, not shared across server instances → use Redis instead.

## Q42. How does bcrypt work and why is it better than MD5/SHA for passwords?
- bcrypt is a **slow** adaptive hashing function — slowness is intentional (makes brute-force expensive)
- Includes a **salt** (random bytes appended before hashing) — prevents rainbow table attacks
- Has a **cost factor** (work factor) — increase it as hardware gets faster to stay computationally expensive
- MD5/SHA: fast cryptographic hashes — `10^9` attempts/second on modern GPU
- bcrypt with cost 12: ~250ms per hash — makes brute force practically infeasible

## Q43. What is SQL injection and how do you prevent it?
```javascript
// VULNERABLE:
db.query(`SELECT * FROM users WHERE email = '${req.body.email}'`);
// Attacker sends: ' OR '1'='1 → dumps all users

// SAFE: Parameterized queries
db.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
// Or use an ORM like Prisma/TypeORM that handles this automatically
```

---

# PART 7 — DATA STRUCTURES & ALGORITHMS (via PairOn context)

## Q44. What data structure is the `files` state and what is its time complexity for common operations?
```typescript
const [files, setFiles] = useState<Record<string, string>>({});
// This is a Hash Map (JavaScript object / plain old dict)
// Access: O(1) — files['src/App.tsx']
// Insert: O(1) — files['new.ts'] = ''
// Delete: O(1) — delete files['old.ts']
// Keys iteration: O(n) — Object.keys(files)
```

## Q45. How is the file tree rendered and what data structure represents it?
- Flat `files` object is transformed into a nested tree structure
- Input: `{ 'src/App.tsx': '...', 'src/index.css': '...', 'index.html': '...' }`
- Output: `{ name: 'root', children: [{ name: 'src', children: [...] }, { name: 'index.html' }] }`
- Algorithm: split each path by `/`, traverse/create nodes as needed — O(n * d) where d = max directory depth
- Render using recursive tree traversal (DFS)

## Q46. Explain the matching algorithm's time complexity.
```
For each new user request:
  - Query waiting_pool: O(pool_size) scan or O(log n) with indexes
  - Score each candidate: O(k) where k = number of matching criteria
  - Find top match: O(pool_size) or O(log n) with a heap
Total: O(pool_size * k) per matching request
```
With Redis sorted set (ZADD score userId): O(log n) insertion, O(log n + m) range query.

## Q47. How does debouncing work algorithmically?
```javascript
function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);           // cancel previous scheduled call
    timer = setTimeout(() => {
      fn.apply(this, args);        // schedule new call
      timer = null;
    }, delay);
  };
}
// Only executes fn if no calls for `delay` ms → O(1) per call, O(1) space
```

## Q48. What is the time complexity of `syncFsToTree`?
```
readDir('.') traverses the file tree:
  - O(n) where n = total number of files
  
Diff computation:
  - Loop over fsFiles: O(n)
  - Loop over filesRef.current: O(m) where m = old file count
  
Total: O(n + m) ≈ O(n) for typical projects
Space: O(n) for the fsFiles object
```

---

# PART 8 — GIT & GITHUB INTERNALS

## Q49. Explain Git's object model — what are blobs, trees, and commits?
```
Blob:   stores file content (just the bytes, no filename)
Tree:   stores directory structure (filename → blob SHA mappings)
Commit: points to a tree + parent commit SHA + author + message
Tag:    named pointer to a commit
```
When you `git push` in PairOn:
1. Create blob for each file content (GitHub creates SHA for each)
2. Create a tree pointing to all blobs
3. Create a commit pointing to the tree + parent commit
4. Update branch ref (`refs/heads/main`) to point to new commit SHA

## Q50. What is the difference between `git merge` and `git rebase`?
| | Merge | Rebase |
|---|---|---|
| History | Preserves history with merge commit | Rewrites history (linear) |
| Commits | Creates a "merge commit" | Replays commits on top of base |
| Safety | Safe on shared branches | Never rebase shared/public branches |
| Use case | Feature → main | Keep feature branch up to date |

## Q51. What does `git push -u origin main` do step by step?
1. `git push` — uploads local commits to remote
2. `origin` — the remote repository (your GitHub repo)
3. `main` — the local branch to push
4. `-u` (--set-upstream) — sets `origin/main` as the tracking branch so future `git push` with no args works

## Q52. Why does PairOn's GitHub push use the Trees API instead of individual file uploads for existing repos?
- Individual `PUT /contents/{path}` requires one API request per file + getting each file's current SHA first
- For 10 files: 10 GET requests (current SHAs) + 10 PUT requests = 20 API calls
- Trees API: 1 POST to create blobs + 1 POST to create tree + 1 POST to create commit + 1 PATCH to update ref = 4 API calls regardless of file count
- GitHub API rate limit: 5000 requests/hour per authenticated user → Trees API stays within limits even for large projects

## Q53. What is a "headless" or "orphan" commit and why does PairOn's initial push need special handling?
- New empty repos have no commits → no root commit SHA to use as `parent`
- The Trees API requires a parent commit SHA
- For empty repos: must use `PUT /contents/{path}` (Contents API) to create the first file, which initializes git's object database
- After the first commit exists, subsequent pushes can use the efficient Trees API

---

# PART 9 — NETWORKING & HTTP

## Q54. What is the difference between HTTP/1.1, HTTP/2, and WebSockets?
| Protocol | Connections | Multiplexing | Direction | Use case |
|---|---|---|---|---|
| HTTP/1.1 | One request per connection | No | One-way (request/response) | REST APIs |
| HTTP/2 | Reuses connections | Yes (multiple streams) | One-way | Faster REST, reduced latency |
| WebSocket | Persistent single connection | N/A | Full-duplex (both directions) | Real-time (PairOn) |

## Q55. Explain CORS — what is it, why does it exist, and how did you configure it for PairOn?
- **Same-Origin Policy:** Browser blocks JavaScript from making requests to a different origin (protocol + domain + port)
- **CORS:** Server can opt-in to allow cross-origin requests via response headers
- PairOn: Frontend on `pair-on.vercel.app`, Backend on `pairon-backend.render.com` → different origins
```javascript
app.use(cors({
  origin: ['https://pair-on.vercel.app', 'http://localhost:5173'],
  credentials: true, // allow cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
```

## Q56. What is the difference between authentication and authorization?
- **Authentication:** Verifying WHO you are → "Is this JWT valid? Are these credentials correct?"
- **Authorization:** Verifying WHAT you can do → "Can this user access this session? Is this user allowed to delete this file?"
- PairOn: Auth middleware verifies JWT → route handlers check if user has permission (e.g., is this user part of this session?)

## Q57. What is an SSL certificate and why does HTTPS matter?
- SSL/TLS encrypts data in transit → prevents man-in-the-middle attacks
- Without HTTPS: someone on the same WiFi could read your JWT token → full account compromise
- Vercel and Render both automatically provision TLS certificates (via Let's Encrypt)
- WebSockets over HTTPS = `wss://` (TLS-encrypted WebSocket)

## Q58. What HTTP status codes are relevant to PairOn?
| Code | Meaning | PairOn usage |
|---|---|---|
| 200 | OK | Successful API response |
| 201 | Created | New user/session created |
| 400 | Bad Request | Missing required fields |
| 401 | Unauthorized | Invalid/missing JWT |
| 403 | Forbidden | Valid JWT but no permission (GitHub scope) |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Username already taken |
| 422 | Unprocessable | GitHub repo already exists |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Unhandled exception |
| 101 | Switching Protocols | WebSocket upgrade |

---

# PART 10 — WEBCONTAINER SPECIFICS

## Q59. What is WebAssembly (WASM) and how does WebContainers use it?
- WASM: binary instruction format that runs at near-native speed in the browser
- WebContainers run Node.js compiled to WASM → actual Node.js in the browser with real `npm`, `node`, file system
-  Not a Node.js simulation — it IS Node.js running through a browser-optimized runtime
- Limitation: browser security sandbox restricts certain syscalls (raw TCP, UNIX domain sockets)

## Q60. What are the WebContainer API's main methods and how are they used in PairOn?
```javascript
const wc = await WebContainer.boot();

// File system
await wc.fs.readdir('.', { withFileTypes: true });
await wc.fs.readFile('src/App.tsx', 'utf-8');
await wc.fs.writeFile('src/App.tsx', content);
await wc.fs.mkdir('src', { recursive: true });
await wc.fs.rm('src', { recursive: true });
wc.fs.watch('/', { recursive: true }, (event, filename) => {});

// Shell execution
const shellProcess = await wc.spawn('jsh'); // starts interactive shell
const process = await wc.spawn('npm', ['install']); // runs command
await process.exit; // wait for completion

// Mount files
await wc.mount({ 'package.json': { file: { contents: '...' } } });

// Server URL (for preview)
wc.on('server-ready', (port, url) => setPreviewUrl(url));
```

## Q61. How does the Preview feature work in CollabIDE?
1. User runs `npm run dev` (Vite dev server) in terminal
2. WebContainer captures the server's port via `wc.on('server-ready', (port, url) => ...)`
3. The URL is a special `webcontainer.io` URL that proxies to the local dev server
4. PairOn embeds it in an `<iframe>` in the Preview panel
5. The URL is also shared with the partner via `ide:state-update` so both see the same preview

---

# PART 11 — TESTING

## Q62. What types of tests would you write for PairOn and how?
**Unit tests** (Jest + React Testing Library):
```javascript
test('deleteFile emits correct socket events', () => {
  const mockSocket = { emit: jest.fn() };
  jest.spyOn(socketService, 'getSocket').mockReturnValue(mockSocket);
  // ... render CollabIDE, trigger delete, assert emit was called with right args
});
```

**Integration tests** (Supertest):
```javascript
test('POST /api/auth/login returns JWT', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'test@test.com', password: 'pass' });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeDefined();
});
```

**E2E tests** (Playwright/Cypress):
```javascript
test('two users can see each other typing', async ({ browser }) => {
  const userA = await browser.newContext();
  const userB = await browser.newContext();
  // ... login both, join same session, A types, assert B sees it
});
```

## Q63. How do you test Socket.IO event handling?
```javascript
// Use socket.io-client in tests
const serverSocket = io('http://localhost:3000');
const clientSocket = io('http://localhost:3000');

test('file-change is relayed to session partner', (done) => {
  clientSocket.emit('join-session', { sessionId: 'test-123' });
  serverSocket.on('code:file-change', (data) => {
    expect(data.path).toBe('src/App.tsx');
    done();
  });
  clientSocket.emit('code:file-change', { sessionId: 'test-123', path: 'src/App.tsx', content: '...' });
});
```

## Q64. What is Test-Driven Development (TDD)?
- Write the test FIRST (it fails — "red")
- Write the minimum code to make the test pass ("green")
- Refactor the code while keeping tests green ("refactor")
- Benefit: forces clear spec before implementation, creates regression suite automatically
- PairOn was not built with TDD — honest answer: it was built feature-first, tests would be added retroactively

---

# PART 12 — OPERATING SYSTEM BASICS

## Q65. What is a process vs a thread? How does this relate to PairOn?
- **Process:** Independent execution unit with its own memory space
- **Thread:** Lightweight execution unit sharing memory with parent process
- Node.js: Single-threaded (one main thread) but uses a thread pool (libuv) for I/O operations
- WebContainers: The `jsh` shell is a process inside the WebContainer runtime
- `wc.spawn('npm', ['install'])` starts a new process — WC manages its lifecycle

## Q66. What is memory management and garbage collection in JavaScript?
- JS uses automatic garbage collection (mark-and-sweep algorithm)
- Objects are GC'd when there are no more references to them
- **Memory leak in PairOn:** If Monaco editor models are created but never disposed, they accumulate → `model.dispose()` is called in cleanup effects
- **Event listener leaks:** Adding socket listeners without removing them in cleanup → each `useEffect` returns a cleanup function that calls `socket.off(event, handler)`

---

# PART 13 — BEHAVIORAL & SITUATIONAL

## Q67. Tell me about a time you had to make a difficult technical decision.
**Sample answer (STAR format):**
- **Situation:** Needed to implement collaborative editing. Two options: (1) Send full file content on every keystroke (simple), (2) Implement Operational Transforms/CRDTs (correct but complex)
- **Task:** Choose the right tradeoff for an MVP under time constraints
- **Action:** Chose option 1 with cursor-preserving `pushEditOperations` instead of `setValue`. Added file locking to prevent simultaneous edits
- **Result:** Shipped working collaboration quickly. Added limitation to roadmap (no true simultaneous editing). Would use Yjs as next iteration

## Q68. How did you handle testing your real-time features alone?
- Opened two browser windows (incognito + normal) to simulate two users
- Used two separate GitHub accounts to test OAuth flows
- Wrote a simple Node.js script to simulate a socket partner for load testing
- Used browser Network tab WS frames to monitor actual socket messages

## Q69. What is the biggest mistake you made during this project and what did you learn?
**Good answer:** 
Putting everything in one 2500-line `CollabIDE.tsx` component. It became very difficult to debug because any state change could potentially affect every feature. Should have split into smaller focused components: `FileExplorer`, `EditorPane`, `TerminalPane`, `CollaborationLayer`. Lesson: separate concerns early, even when working alone.

## Q70. How do you handle merge conflicts in Git?
1. `git fetch` to get latest remote changes
2. `git merge origin/main` or `git rebase origin/main`
3. Conflicts shown as: `<<<<<<< HEAD`, your code, `=======`, their code, `>>>>>>> origin/main`
4. Resolve manually (or use `git mergetool`)
5. `git add .` and `git commit` to complete merge
In PairOn: Both users push to the same repo — if both modified same file between pushes, the second push needs to fetch first and merge/rebase.

## Q71. Describe your approach when you encounter a bug you can't immediately understand.
1. **Reproduce** it reliably — understand exact conditions that trigger it
2. **Isolate** — narrow down which component/function is responsible (binary search: comment out half the code)
3. **Form a hypothesis** — "I think X happens because Y"
4. **Test hypothesis** — add logs, breakpoints, or write a minimal reproduction
5. **Fix** — make the smallest change that addresses root cause (not symptoms)
6. **Verify** — ensure fix works + doesn't break other things
7. **Document** — comment WHY the fix was necessary (not just what it does)

## Q72. How do you prioritize features when you have limited time?
Framework: **Impact vs Effort matrix**
- **High impact, low effort** → Do immediately (e.g., `clearWorkspace` socket emit — 10 lines, fixes major bug)
- **High impact, high effort** → Plan carefully (e.g., CRDT collaborative editing)
- **Low impact, low effort** → Do when you have spare cycles (e.g., UI polish)
- **Low impact, high effort** → Don't do (e.g., Python support in WebContainers — impossible anyway)

## Q73. What would you do if your partner in a pair programming session kept writing code you disagreed with?
- Raise it as a question, not a critique: "I'm curious why you chose X — have you considered Y?"
- Be specific: "This approach has O(n²) complexity here — could we use a Map instead?"
- If no consensus: propose trying both approaches and measuring
- Document the disagreement and move on — perfect is the enemy of done

---

# PART 14 — ADVANCED/SENIOR-FACING QUESTIONS

## Q74. What is a CRDT and how would it improve PairOn's collaborative editing?
- **CRDT (Conflict-free Replicated Data Type):** Data structure designed for distributed systems where any two users can make concurrent edits and merge them deterministically (no conflicts possible)
- Examples: Yjs (used by TipTap, Codemirror 6, ProseMirror), Automerge, Diamond Types
- With Yjs + Monaco binding: both users can type simultaneously, even on the same line, and their edits are merged correctly without one overwriting the other
- Current PairOn: uses file locking (one editor at a time) to avoid this complexity

## Q75. What is Operational Transform (OT) and how does Google Docs use it?
- OT: when User A and User B both make edits concurrently, transform B's edit to account for A's edit before applying, and vice versa
- Example: A inserts "X" at position 5, B inserts "Y" at position 7. A's edit is applied first → B's position shifts to 8 (because A's insert moved everything right)
- Google Docs uses OT with a central server that canonicalizes edit order
- Yjs/CRDTs are a newer alternative that work without central authority (peer-to-peer friendly)

## Q76. How would you implement resumable uploads for the GitHub push?
- GitHub's API has a 100MB limit per file
- For large files: use GitHub's List Repository Content API + chunked upload
- Track `pushed` count — if token expires mid-push, resume from last successful file
- Store progress in localStorage: `{ repoName, pushedFiles: ['src/App.tsx', ...] }`
- On retry: skip already-pushed files

## Q77. What is a race condition and can one occur in PairOn?
- Race condition: outcome depends on timing of concurrent operations
- PairOn example: Both users simultaneously open the same file for editing before locking propagates → both get "unlocked" state → both emit changes → last-write-wins, one user's changes lost
- Current mitigation: file locking system
- Better solution: OT or CRDT (mathematically immune to race conditions)

---

# PART 15 — QUICK-FIRE ROUND 2

| Question | Answer |
|---|---|
| What does `async/await` compile to in ES5? | Generator functions + Promise chains |
| What is `NaN === NaN`? | `false` — use `Number.isNaN()` |
| What is `typeof null`? | `"object"` — historical JavaScript bug |
| What is event delegation? | Single listener on parent instead of many listeners on children |
| What is the `event.target` vs `event.currentTarget`? | `target`: element that triggered event; `currentTarget`: element with the listener |
| What is `localStorage` vs `sessionStorage`? | localStorage: persists after tab closes; sessionStorage: cleared on tab close |
| What is XSS? | Cross-site scripting — injecting malicious scripts via user input |
| What is CSRF? | Cross-site request forgery — tricking user's browser to make unauthorized requests |
| What is a CDN? | Content Delivery Network — caches static assets at edge locations globally |
| What does `encodeURIComponent` do? | Encodes special chars for safe URL transmission (used in GitHub push for file content) |
| What is `btoa()` and `atob()`? | btoa: string → base64; atob: base64 → string (used for GitHub file content encoding) |
| What is idempotency? | Operation can be applied multiple times with same result (GET/PUT are idempotent; POST is not) |
| What is `Promise.resolve()` vs `new Promise()`? | `Promise.resolve(val)` creates already-resolved promise; `new Promise()` allows async resolution |
| What is optional chaining `?.`? | Short-circuits to `undefined` if left side is null/undefined instead of throwing |
| What is nullish coalescing `??`? | Returns right side only if left is null/undefined (unlike `||` which triggers on any falsy) |

---

# PART 16 — CODE REVIEW SCENARIOS

## Q78. Review this code and identify problems:
```javascript
socket.on('code:file-change', async (data) => {
  const files = await db.getFiles(data.sessionId);
  if (files[data.path] !== data.content) {
    db.saveFile(data.sessionId, data.path, data.content);
    socket.to(`session:${data.sessionId}`).emit('code:file-change', data);
  }
});
```
**Problems:**
1. Async database call on EVERY keystroke → massive DB load, high latency
2. Race condition: two simultaneous changes may both read old state, both save, one overwrites
3. Missing `await` on `db.saveFile` → unhandled promise rejection
4. Should not involve DB for every keystroke — relay directly, save periodically
5. Missing error handling around entire handler

## Q79. What's wrong with this React code?
```javascript
function FileList({ files }) {
  const socket = getSocket();
  
  useEffect(() => {
    socket.on('code:file-create', (data) => {
      setFiles(prev => ({ ...prev, [data.path]: data.content }));
    });
  }, []);
  
  return files.map(f => <FileItem file={f} />);
}
```
**Problems:**
1. No cleanup → socket listener accumulates on every render cycle if effect re-runs
2. Missing `key` prop on mapped `FileItem` → React reconciliation issues
3. `socket` used inside effect but not in dependency array → stale closure if socket changes
4. `files` prop used as state but also calling `setFiles` — `files` should come from the same state

---

# SUMMARY — STAR STORIES TO PREPARE

Prepare 2-minute STAR (Situation, Task, Action, Result) stories for:
1. **Most challenging bug** → feedback loop / folder delete sync bug
2. **Technical decision under uncertainty** → WebContainers vs server sandbox
3. **Working under time pressure** → shipping MVP with known limitations
4. **Learning a new technology quickly** → WebContainer API, Monaco Editor internals
5. **Feature you're most proud of** → real-time file sync staying alive across tab switches

---

*Total questions in this guide: ~80+ covering all interview dimensions. Continue below for 10 additional critical sections.*

---

# PART 17 — CODE WALKTHROUGH (The Questions Most People Fail)

> Interviewers will say: *"Open your project. Walk me through the code."*
> Most candidates panic. These are the exact walkthroughs you need to practice out loud.

---

## Q80. Walk me through your folder structure.

```
PairOn/
├── app/                         ← React frontend (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   └── CollabIDE.tsx    ← THE core component (~2500 lines)
│   │   │                          Owns: WebContainer, Monaco, socket listeners,
│   │   │                          file state, terminal, github push
│   │   ├── pages/
│   │   │   ├── CollaborationPage.tsx  ← Wraps CollabIDE + Chat + Kanban
│   │   │   ├── DashboardPage.tsx      ← Matching/session entry
│   │   │   └── LoginPage.tsx          ← GitHub OAuth + email login
│   │   ├── lib/
│   │   │   ├── api.ts            ← All REST API calls (axios wrappers)
│   │   │   └── socketService.ts  ← Socket.IO singleton (getSocket/initSocket)
│   │   └── main.tsx              ← React app entry point
│   └── index.html
│
├── backend/
│   └── src/
│       ├── server.ts             ← Express setup, Socket.IO attach, CORS, rate limit
│       ├── routes/
│       │   ├── auth.ts           ← /api/auth/* (login, register, GitHub OAuth)
│       │   └── credits.ts        ← /api/credits/* (credit transactions)
│       └── services/
│           └── socket.ts         ← ALL socket event handlers (~1200 lines)
│               └── Handles: file sync, terminal relay, session state, matching
```

---

## Q81. Walk me through what happens when a user types in the Monaco editor.

Trace this exactly — step by step:

```
1. User types 'a' in Monaco editor
   → Monaco fires: model.onDidChangeModelContent(event)

2. CollabIDE's listener checks:
   if (suppressSyncRef.current) return;  ← Skip if WE applied this change (avoid echo)
   if (isLockedByPartner(activeFile)) return;  ← Skip if file is locked

3. New content read:
   const content = model.getValue();
   filesRef.current[activeFile] = content;  ← Update ref immediately (sync)

4. Socket event emitted:
   socket.emit('code:file-change', {
     sessionId, path: activeFile, content, senderId: socket.id
   });

5. WebContainer FS updated:
   webcontainerRef.current.fs.writeFile(activeFile, content);

6. Autosave debounce timer reset:
   clearTimeout(autosaveTimerRef.current);
   autosaveTimerRef.current = setTimeout(() => {
     socket.emit('ide:state-update', { sessionId, files, folders });
   }, 1000);

7. setFiles(prev => ({ ...prev, [activeFile]: content }));
   → React re-renders file tree (no visible change for content edits)
```

**On User B's side:**
```
8. Backend receives 'code:file-change' → socket.to('session:X').emit(...)

9. User B's handleFileChange fires:
   if (data.senderId === socket.id) return;  ← Skip own events

10. suppressSyncRef.current = true;  ← Prevent echo
    model.pushEditOperations([], [{ range: fullRange, text: data.content }], () => null);
    suppressSyncRef.current = false;

11. webcontainerRef.current.fs.writeFile(data.path, data.content);
    filesRef.current[data.path] = data.content;
```

---

## Q82. Where exactly is the socket initialized? Walk me through socketService.ts.

```typescript
// lib/socketService.ts — Singleton pattern
let socket: Socket | null = null;

export const initSocket = (token: string): Socket => {
  if (socket?.connected) return socket;  // Reuse if already connected
  
  socket = io(BACKEND_URL, {
    auth: { token },           // JWT sent on handshake for auth
    transports: ['websocket'], // Force WebSocket (skip polling fallback)
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });
  return socket;
};

export const getSocket = (): Socket | null => socket;
export const disconnectSocket = () => { socket?.disconnect(); socket = null; };
```

Why singleton? Socket.IO connections are stateful and expensive. You never want two active connections to the same backend from one user.

---

## Q83. Show me how a file DELETE travels from User A clicking delete → User B's sidebar.

```
USER A CLICKS DELETE ICON ON 'src/App.tsx'
         ↓
deleteFile('src/App.tsx') is called

STEP 1 — Snapshot (synchronous):
const snapshot = {};
Object.entries(filesRef.current).forEach(([p, c]) => {
  if (p === 'src' || p.startsWith('src/')) snapshot[p] = c;
});
// snapshot = { 'src/App.tsx': '...', 'src/index.css': '...' }

STEP 2 — Update local state:
filesRef.current = {/* without src files */};
setFiles(() => nextFiles);
setOpenTabs(prev => prev.filter(t => !t.startsWith('src/')));
Monaco models.dispose();

STEP 3 — WebContainer FS:
wc.fs.rm('src', { recursive: true });

STEP 4 — Socket emit (one per file):
socket.emit('code:file-delete', { sessionId, path: 'src/App.tsx', senderId: socket.id });
socket.emit('code:file-delete', { sessionId, path: 'src/index.css', senderId: socket.id });

BACKEND (socket.ts):
socket.on('code:file-delete', (data) => {
  socket.to(`session:${data.sessionId}`).emit('code:file-delete', data);
});

USER B — handleFileDelete fires (twice, once per file):
if (data.senderId === socket.id) return;  // ← Not our own event
setFiles(prev => { delete next[data.path]; return next; }); // React rerender
modelsRef.current.get(data.path)?.dispose();
setOpenTabs(prev => prev.filter(t => t !== data.path));
wc.fs.rm(data.path, { recursive: true });

RESULT: User B's sidebar loses 'src/App.tsx' and 'src/index.css' entries ✅
```

---

## Q84. Where is the JWT validated on the backend? Show the middleware.

```typescript
// middleware/auth.ts
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = decoded;  // attach user to request
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Routes that need auth:
router.get('/api/sessions', authMiddleware, getSessionsHandler);
router.post('/api/push-github', authMiddleware, pushHandler);
```

For Socket.IO:
```typescript
// socket.ts — auth on connection
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    socket.data.user = decoded;
    next();
  } catch {
    next(new Error('Authentication error'));
  }
});
```

---

## Q85. Walk me through what happens when a user clicks "Push to GitHub".

```
1. User fills modal: repoName="my-project", commitMsg="Initial commit", clicks Push

2. pushToGitHub() called:
   - reads current files from filesRef.current (not stale state)
   - fetches user's GitHub token from profile/localStorage

3. Check if repo exists:
   GET https://api.github.com/repos/{owner}/{repoName}
   → 404: repo doesn't exist → create it
   → 200: repo exists → check if it has commits

4a. EMPTY REPO (first push):
   For each file → PUT /repos/{owner}/{repoName}/contents/{path}
   body: { message: commitMsg, content: btoa(fileContent) }
   GitHub initializes git database + creates first commit

4b. EXISTING REPO with commits (re-push):
   POST /repos/{owner}/{repoName}/git/trees  → create tree with all files
   POST /repos/{owner}/{repoName}/git/commits → create commit (parent = latest SHA)
   PATCH /repos/{owner}/{repoName}/git/refs/heads/main → update branch pointer

5. Success: addToast('Pushed to GitHub ✅')
   Failure: modal closes, addToast shows error (always visible)

6. Invite collaborator (optional):
   PUT /repos/{owner}/{repo}/collaborators/{partnerUsername}
   → GitHub sends email invite to partner
```

---

# PART 18 — DATABASE DESIGN (DEEP)

## Q86. Design the complete database schema for PairOn.

```sql
-- Users
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255),              -- NULL for OAuth-only users
  github_id   VARCHAR(100) UNIQUE,
  github_token TEXT,                       -- encrypted at rest
  avatar_url  TEXT,
  reputation  INTEGER DEFAULT 0,
  credits     INTEGER DEFAULT 10,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (a collaboration between two users)
CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id     UUID REFERENCES users(id),
  user2_id     UUID REFERENCES users(id),
  project_title VARCHAR(200),
  project_idea  JSONB,                     -- { title, description, stack, difficulty }
  status       VARCHAR(20) DEFAULT 'active',  -- active | completed | abandoned
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  github_repo  TEXT                        -- URL if pushed
);

-- Messages in a session
CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  sender_id  UUID REFERENCES users(id),
  content    TEXT NOT NULL,
  type       VARCHAR(20) DEFAULT 'text',   -- text | system | ai
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Waiting pool for matchmaking
CREATE TABLE waiting_pool (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) UNIQUE,
  language       VARCHAR(50),
  experience_lvl INTEGER,                  -- 1-5
  topic          VARCHAR(100),
  socket_id      VARCHAR(100),
  expires_at     TIMESTAMPTZ,              -- auto-cleanup after 5 min
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Credit transactions (audit trail)
CREATE TABLE credit_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  amount      INTEGER,                     -- positive=earned, negative=spent
  reason      VARCHAR(100),               -- 'session_completed', 'session_started', etc.
  session_id  UUID REFERENCES sessions(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

## Q87. What indexes would you add and why?

```sql
-- Most frequent query: find sessions for a user
CREATE INDEX idx_sessions_user1 ON sessions(user1_id);
CREATE INDEX idx_sessions_user2 ON sessions(user2_id);
-- Composite: get active sessions for user
CREATE INDEX idx_sessions_status ON sessions(status, started_at DESC);

-- Messages: always queried by session, ordered by time
CREATE INDEX idx_messages_session_time ON messages(session_id, created_at);

-- Matchmaking: find compatible users fast
CREATE INDEX idx_pool_language ON waiting_pool(language, experience_lvl);
CREATE INDEX idx_pool_expires ON waiting_pool(expires_at);  -- for cleanup job

-- User lookup: most common auth query
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_github ON users(github_id) WHERE github_id IS NOT NULL;

-- Credit history: ordered by time per user
CREATE INDEX idx_credits_user_time ON credit_transactions(user_id, created_at DESC);
```

**Why indexes matter:** Without `idx_messages_session_time`, loading 1000 messages for a session requires full table scan O(n). With the index: O(log n + result count).

## Q88. SQL vs NoSQL — which would you use for PairOn and why?

| Requirement | SQL (PostgreSQL) | NoSQL (MongoDB) |
|---|---|---|
| Structured users/sessions | ✅ Perfect fit | Overkill flexibility |
| Complex JOIN queries | ✅ Native | Requires multiple queries |
| ACID transactions (credits) | ✅ Essential | ⚠️ Eventually consistent |
| Messages (append-only) | ✅ Works fine | ✅ Slightly more natural |
| File state (ephemeral) | ❌ Don't store in DB | ❌ Don't store in DB |
| Schema evolution | ⚠️ Migrations needed | ✅ Flexible |

**Decision: PostgreSQL** — because credit transactions MUST be atomic (ACID). You can't lose a credit deduction. NoSQL's eventual consistency is dangerous for financial data.

## Q89. How do you handle session file state efficiently?

Files are NOT stored in the DB on every keystroke (that would be thousands of writes/minute). Instead:
- **In-memory (Redis):** Session's current file state stored in Redis with TTL (e.g., 24 hours): `SET session:{id}:files {json}` on autosave
- **DB snapshot:** On session END, final file state written to `sessions.final_snapshot JSONB` column
- **Recovery:** If server restarts, users reconnect → request state from partner via socket → partner pushes from memory

---

# PART 19 — SECURITY (DEEP DIVE)

## Q90. How does JWT authentication work end-to-end in PairOn?

```
1. USER LOGS IN:
   POST /api/auth/login { email, password }
   → bcrypt.compare(password, hash)
   → jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '30d' })
   → Response: { token: "eyJhbG..." }

2. CLIENT STORES IT:
   localStorage.setItem('token', token)
   axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

3. EVERY API REQUEST:
   GET /api/sessions
   Headers: { Authorization: "Bearer eyJhbG..." }
   → authMiddleware: jwt.verify(token, JWT_SECRET)
   → Attaches decoded payload to req.user
   → Handler uses req.user.userId for DB queries

4. SOCKET CONNECTION:
   io(BACKEND_URL, { auth: { token } })
   → io.use() middleware: jwt.verify(socket.handshake.auth.token)
   → socket.data.user = decoded user

5. TOKEN EXPIRY:
   jwt.verify throws 'jwt expired' → 401 response
   Client intercepts 401 → redirect to login
```

**JWT Security notes:**
- Payload is base64-encoded, NOT encrypted — never store sensitive data
- Signature prevents tampering (would need JWT_SECRET to forge)
- No server-side session storage needed → stateless, scales horizontally
- Risk: if token is stolen, valid until expiry → mitigate with short expiry + refresh tokens

## Q91. How do you secure Socket.IO connections against unauthorized access?

```typescript
// 1. Auth on connect (token verified before any events can fire):
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('AUTH_REQUIRED'));
  try {
    socket.data.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { next(new Error('INVALID_TOKEN')); }
});

// 2. Session membership check on every sensitive event:
socket.on('code:file-change', (data) => {
  const userId = socket.data.user.userId;
  const session = activeSessions.get(data.sessionId);
  // Verify this user is actually in this session
  if (session?.user1Id !== userId && session?.user2Id !== userId) {
    return socket.emit('error', { message: 'Not authorized for this session' });
  }
  socket.to(`session:${data.sessionId}`).emit('code:file-change', data);
});

// 3. Rate limiting on socket events (prevent spam):
const eventCounts = new Map();
socket.use(([event, ...args], next) => {
  const key = `${socket.id}:${event}`;
  const count = (eventCounts.get(key) || 0) + 1;
  eventCounts.set(key, count);
  if (count > 100) return next(new Error('Rate limit exceeded'));  // 100 events/min
  next();
});
```

## Q92. What is CSRF and does PairOn need CSRF protection?

**CSRF (Cross-Site Request Forgery):** Malicious site tricks browser into making authenticated requests to your API.

**PairOn's situation:**
- Uses `Authorization: Bearer <token>` header (NOT cookies)
- CSRF only affects cookie-based auth (browser auto-sends cookies)
- **Bearer tokens are safe from CSRF** — malicious sites can't read localStorage from a different origin
- If PairOn switched to httpOnly cookies: would need CSRF tokens or SameSite cookie attribute

---

# PART 20 — PERFORMANCE BOTTLENECKS

## Q93. What is the biggest performance bottleneck in PairOn right now?

**Honest answer (shows real understanding):**

1. **Monaco Editor initial load (~2MB):**
   - Not lazy loaded → first session load feels heavy
   - Fix: `React.lazy(() => import('./CollabIDE'))` + Suspense

2. **CollabIDE is one giant component (2500 lines):**
   - Any state change (typing in editor = 10+ state updates/second) triggers reconciliation of the ENTIRE component tree
   - Fix: Split into `FileExplorer`, `EditorPane`, `TerminalPane` with `React.memo`

3. **`syncFsToTree` reads all files every 3 seconds:**
   - For a project with node_modules accidentally included: catastrophic
   - Mitigation: exclude node_modules, limit scan depth

4. **`setFiles` on every keystroke causes a new object allocation:**
   - `{ ...prev, [path]: content }` → new object every character
   - Fix: throttle to max 10 updates/second with `requestAnimationFrame`

5. **Render (free tier) cold starts:**
   - Backend sleeps after 15 min inactivity → first request takes 30+ seconds
   - Fix: upgrade to paid tier or add a "ping server" cron job every 10 min

## Q94. Why is Monaco heavyweight and how did you handle it?

- Monaco's full bundle: ~2MB (includes language grammars, workers, themes)
- It spawns Web Workers for TypeScript language server, JSON, CSS, HTML validation
- These workers run in separate threads (don't block UI)
- **PairOn's approach:**
  - Load Monaco JS only when user enters a session (lazy load via Vite dynamic import)
  - Dispose models when files are deleted → prevents memory accumulation
  - Only create models for files that are OPENED (not all files at once)

## Q95. What happens if 100 users join the same session? (Trick question)

PairOn is designed for exactly **2 users per session**. The `session:{id}` Socket.IO room has exactly 2 sockets. No fan-out problem exists because:
- `socket.to('session:X')` emits to at most 1 other socket
- WebContainer runs locally in each user's browser — no server compute scales with users

BUT if the question means 100 sessions concurrent:
- 200 active WebSocket connections (2 per session)
- Each connection: ~50KB memory → 200 connections = ~10MB (trivial)
- File change events: ~100 events/sec (10 events/sec per session × 10 active sessions typing)
- Bottleneck: Render free tier (0.1 CPU) → might queue events → latency spikes
- Fix: paid Render instance or scale horizontally with Redis adapter

---

# PART 21 — FAILURE SCENARIOS & RECOVERY

## Q96. What happens if the WebContainer crashes mid-session?

**Current state (no recovery):**
- User sees blank terminal, editor stops responding
- Partner notices nothing (their WC is unaffected)

**Proper recovery:**
```typescript
// Detect WC death
webcontainerRef.current.on('error', async (err) => {
  console.error('WebContainer crashed:', err);
  addToast('IDE crashed — attempting restart...', 'error');
  
  // Save current files from React state (still in memory)
  const savedFiles = filesRef.current;
  
  // Re-boot
  webcontainerRef.current = await WebContainer.boot();
  await webcontainerRef.current.mount(filesToMountFormat(savedFiles));
  
  addToast('IDE restarted ✅', 'success');
});
```

## Q97. What happens if a user's socket disconnects mid-edit?

**Timeline:**
- User A disconnects (laptop sleeps, network drops)
- Socket.IO heartbeat misses 3 pings (~20-30 seconds)
- Server fires `socket.on('disconnect', 'transport close')`
- Server should:
  1. Emit `partner:disconnected` to User B with a countdown timer
  2. Store session state in Redis for 5 minutes (grace period)
  3. If User A reconnects w/in grace period: emit `ide:request-state` → User B pushes latest state
  4. User A's UI shows "Reconnecting..." overlay, buffers any edits made offline
  5. After grace period expires: session marked abandoned, both users redirected to dashboard

**What PairOn currently does:** Step 1 + 2, but offline-edit buffering is not yet implemented.

## Q98. What happens if the GitHub push fails halfway through?

**Scenario:** Pushing 20 files, contents API accepts first 10, then token expires on file 11.

**Current behavior:** Error toast shows, user sees partial push (10 files in GitHub, 10 missing). Re-push tries to initialize a new repo (conflict).

**Proper fix:**
```typescript
// Track progress
const pushedPaths: string[] = [];
try {
  for (const file of files) {
    await pushFile(file);
    pushedPaths.push(file.path);
    setPushProgress(pushedPaths.length / files.length * 100);
  }
} catch (err) {
  // Store progress for resume
  localStorage.setItem(`push_progress_${repoName}`, JSON.stringify(pushedPaths));
  addToast(`Push failed at ${pushedPaths.length}/${files.length} files. Resume available.`, 'error');
}

// Resume on next attempt
const previouslySynced = JSON.parse(localStorage.getItem(`push_progress_${repoName}`) || '[]');
const filesToPush = files.filter(f => !previouslySynced.includes(f.path));
```

## Q99. How do you ensure no file edits are lost if the user closes the tab?

```typescript
// Browser beforeunload event — saves to localStorage as emergency backup
window.addEventListener('beforeunload', (e) => {
  if (Object.keys(filesRef.current).length > 0) {
    localStorage.setItem(
      `emergency_backup_${sessionId}`,
      JSON.stringify({ files: filesRef.current, timestamp: Date.now() })
    );
  }
  // Only show "are you sure?" dialog if session is active
  if (sessionActive) {
    e.preventDefault();
    e.returnValue = ''; // Chrome requires returnValue to be set
  }
});

// On mount, check for emergency backup
useEffect(() => {
  const backup = localStorage.getItem(`emergency_backup_${sessionId}`);
  if (backup) {
    const { files, timestamp } = JSON.parse(backup);
    const age = Date.now() - timestamp;
    if (age < 30 * 60 * 1000) { // Less than 30 minutes old
      if (confirm('Found unsaved work from a previous session. Restore it?')) {
        setFiles(files);
      }
    }
    localStorage.removeItem(`emergency_backup_${sessionId}`);
  }
}, [sessionId]);
```

---

# PART 22 — METRICS & MONITORING

## Q100. How would you monitor PairOn in production?

**Error tracking (Sentry):**
```typescript
import * as Sentry from '@sentry/node';
Sentry.init({ dsn: process.env.SENTRY_DSN });

// Catch unhandled errors
socket.on('code:file-change', (data) => {
  try { handleFileChange(data); }
  catch (err) {
    Sentry.captureException(err, { extra: { sessionId: data.sessionId } });
  }
});
```

**Custom metrics (log to stdout → aggregate in Datadog/Grafana):**
```typescript
// Track key business metrics
const metrics = {
  activeSessions: new Gauge('pairon_active_sessions'),
  socketConnections: new Gauge('pairon_socket_connections'),
  fileChangeLatency: new Histogram('pairon_file_change_ms'), // A→B relay time
  githubPushSuccess: new Counter('pairon_github_push_total', ['status']),
  matchmakingDuration: new Histogram('pairon_match_wait_seconds'),
};

// Alert thresholds:
// - active sessions > 500 → scale up
// - file change latency p99 > 500ms → backend issue
// - github push error rate > 5% → token/API issue
// - socket connection errors > 100/min → deployment issue
```

**What metrics to track:**
| Metric | Why |
|---|---|
| Active sessions count | Business health |
| Socket connection success rate | Infrastructure health |
| File-change relay latency (A→B ms) | Core feature quality |
| WebContainer boot time | UX quality |
| GitHub push success/fail rate | Feature reliability |
| Auth failure rate | Security indicator |
| Matchmaking wait time (avg, p95) | Product quality |
| Credits consumed per day | Business metric |

---

# PART 23 — TRADEOFFS & ALTERNATIVES

## Q101. Why WebContainers and not Docker containers on the server?

| | WebContainers | Docker (server-side) |
|---|---|---|
| **Cost** | Free (runs in browser) | ~$0.02/hr per container |
| **Cold start** | ~3 seconds (WASM init) | ~5-30 seconds (image pull + boot) |
| **Security** | Browser sandbox (free) | Container isolation (you maintain) |
| **Languages** | Node.js/JS only | Any language |
| **Scale** | Scales with browser count | Requires orchestration (K8s) |
| **Control** | Limited (StackBlitz API) | Full (your infra) |
| **Vendor lock** | Yes (StackBlitz) | No |

**Decision:** WebContainers for MVP. For Python/Java support, add a separate server-side sandbox layer.

## Q102. Why Socket.IO and not plain WebSockets or WebRTC data channels?

| | Socket.IO | Plain WebSocket | WebRTC Data Channel |
|---|---|---|---|
| Fallback | Auto HTTP polling | WebSocket only | P2P, no server needed |
| Reconnection | Built-in + backoff | Manual | Built-in |
| Rooms/Broadcast | Built-in | Manual | N/A (P2P) |
| Binary support | Yes | Yes | Yes |
| Relay server needed | Yes | Yes | No (P2P) |
| NAT traversal | N/A | N/A | Needs TURN server |
| Learning curve | Low | Medium | High |

**Decision:** Socket.IO for server-relayed events (file sync, auth'd events). WebRTC for future video (P2P, server-free).

## Q103. Why polling every 3 seconds AND fs.watch — why not just one?

| | fs.watch only | Polling only | Both (current) |
|---|---|---|---|
| Responsiveness | ~600ms (fast) | Up to 3 seconds | ~600ms (usually) |
| Reliability | ❌ Sometimes misses bulk shell ops | ✅ Always catches all changes | ✅ Best of both |
| CPU usage | Near-zero (event-driven) | Low (3s interval) | Low (mostly event-driven) |
| Complexity | Simple | Simple | Slightly more code |

**Decision:** fs.watch for fast response (600ms) + polling as fallback (3s) for shell operations that fs.watch misses. Belt AND suspenders.

---

# PART 24 — BEHAVIORAL (REAL ANSWERS, NOT SAFE ONES)

## Q104. What actually went wrong during development that you didn't expect?

**Real answer (not generic):**

*"I expected the hardest part to be the WebContainer integration. But the hardest was actually React state management. I discovered that `const [files, setFiles] = useState({})` inside a closure doesn't give you the latest state — it gives you the value at the time the closure was created. I spent 2 days debugging why GitHub push was pushing empty files, before realizing the `pushToGitHub` useCallback had stale state. The fix — using `filesRef.current` instead — was 3 characters, but finding it took 2 days."*

## Q105. Describe a moment where you realized your initial architecture was wrong.

*"I initially had all socket listeners registered globally in the app's root component, thinking it would be simpler. But as the feature set grew, I realized the socket events for file sync needed access to Monaco models and the WebContainer ref — which only existed inside CollabIDE. I had to refactor ALL listeners into CollabIDE, which required threading session state down through props. That refactor taught me: put event listeners where the data they need lives, not where it's convenient."*

## Q106. If a senior engineer reviewed your code, what would they criticize?

Honest answer (interviewers LOVE this):

1. **No tests** — zero automated test coverage. Any refactor could break something silently.
2. **God component** — `CollabIDE.tsx` at 2500 lines is a nightmare to maintain. Should be 8-10 smaller files.
3. **No error boundaries** — one crash in the IDE = blank white screen for the user.
4. **GitHub token in frontend memory** — technically it's fetched and stored in component state, visible in React DevTools. Should be proxied through backend.
5. **No retry logic** — if a socket event delivery fails, it's lost forever.
6. **`console.log` statements left in prod** — should use a proper logger (pino) that's disabled in production builds.

---

# PART 25 — RESUME TALKING POINTS (Impact-First Language)

> In your resume and interview, lead with IMPACT, not implementation.

## Replace generic bullets with these:

| ❌ Weak (what you did) | ✅ Strong (impact + how) |
|---|---|
| "Built real-time file sync using Socket.IO" | "Engineered bidirectional file sync between Monaco editors with <100ms P95 latency, preserving cursor position using Monaco's `pushEditOperations` instead of `setValue`" |
| "Fixed a bug in the editor" | "Identified and resolved a feedback loop bug that caused the editor to reset every second — traced via WebSocket frame inspection to an incorrect `ide:state-update` → `ide:partner-rejoined` chain" |
| "Added GitHub push feature" | "Implemented GitHub push using Trees API for O(1) batch commits (vs O(n) individual uploads), reducing API calls from 40+ to 4 for a 10-file project" |
| "Used WebContainers" | "Leveraged WebContainer API for zero-cost browser-native Node.js execution, eliminating server-side sandbox costs entirely" |
| "Built matchmaking system" | "Designed weighted scoring matchmaking algorithm that considers language, experience level and topic — O(n) per match with PostgreSQL indexed queries" |
| "Fixed file deletion bug" | "Diagnosed and patched folder deletion sync failure — root cause: React state updater closures are async (snapshot was empty at emit time); fixed by reading from `filesRef.current` synchronously before `setFiles`" |
| "Kept IDE alive across tab switches" | "Prevented WebContainer re-boot on tab navigation by replacing conditional rendering with CSS `hidden` toggling — eliminated 15-second re-boot delays and missed sync events" |

---

# PART 26 — LIVE CODING PREP (DSA Patterns)

> These are patterns commonly tested for full-stack intern roles. All solvable by understanding the concepts already in PairOn.

## Pattern 1: Debounce (you built this)

```javascript
// Q: Implement debounce from scratch
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}
```

## Pattern 2: Deep object diff (what syncFsToTree does)

```javascript
// Q: Find keys added, removed, changed between two objects
function diffObjects(prev, next) {
  const added = [], removed = [], changed = [];
  for (const key in next) {
    if (!(key in prev)) added.push(key);
    else if (prev[key] !== next[key]) changed.push(key);
  }
  for (const key in prev) {
    if (!(key in next)) removed.push(key);
  }
  return { added, removed, changed };
}
// Time: O(n+m) Space: O(n+m)
```

## Pattern 3: Flatten paths → tree (what renderTree does)

```javascript
// Q: Convert flat path list to nested tree
// Input: ['src/App.tsx', 'src/index.css', 'index.html']
// Output: { src: { 'App.tsx': null, 'index.css': null }, 'index.html': null }
function buildTree(paths) {
  const root = {};
  for (const path of paths) {
    const parts = path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = null; // leaf
  }
  return root;
}
// Time: O(n * d) where d = max depth
```

## Pattern 4: Throttle (vs debounce)

```javascript
function throttle(fn, ms) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}
// Use throttle for: scroll handlers, resize events, progress bars
// Use debounce for: search input, autosave, socket emit on keypress
```

## Pattern 5: Event Emitter (what Socket.IO is)

```javascript
// Q: Implement a basic EventEmitter
class EventEmitter {
  constructor() { this.listeners = {}; }
  
  on(event, fn) {
    (this.listeners[event] = this.listeners[event] || []).push(fn);
    return this; // chaining
  }
  
  off(event, fn) {
    this.listeners[event] = (this.listeners[event] || []).filter(l => l !== fn);
  }
  
  emit(event, ...args) {
    (this.listeners[event] || []).forEach(fn => fn(...args));
  }
  
  once(event, fn) {
    const wrapper = (...args) => { fn(...args); this.off(event, wrapper); };
    this.on(event, wrapper);
  }
}
```

## Pattern 6: LRU Cache (common medium question)

```javascript
// Q: Design a cache with max capacity that evicts Least Recently Used
class LRUCache {
  constructor(capacity) {
    this.cap = capacity;
    this.map = new Map(); // preserves insertion order in JS
  }
  
  get(key) {
    if (!this.map.has(key)) return -1;
    const val = this.map.get(key);
    this.map.delete(key);   // remove + re-insert = move to end (most recent)
    this.map.set(key, val);
    return val;
  }
  
  put(key, val) {
    this.map.delete(key);
    if (this.map.size >= this.cap) {
      this.map.delete(this.map.keys().next().value); // delete first (oldest)
    }
    this.map.set(key, val);
  }
}
// Relevant to PairOn: Monaco model cache — keep last N open files in memory, evict oldest
```

---

# FINAL CHECKLIST — Day Before Interview

- [ ] Can you explain PairOn in 60 seconds without stumbling?
- [ ] Can you draw the architecture on a whiteboard from memory?
- [ ] Can you walk through the editor-sync flow without looking at code?
- [ ] Have you practiced STAR answers out loud (not just read them)?
- [ ] Do you know your actual metrics? (file count, line count, event count)
- [ ] Have you read the code you'll be shown on screen one more time?
- [ ] Can you implement debounce, diff, and EventEmitter from scratch?
- [ ] Do you know 3 things you'd do differently? (shows maturity)
- [ ] Can you explain one bug story without reading from notes?
- [ ] Have you prepared 2-3 questions to ask them at the end?

---

*Total: 120+ questions, 26 sections. This document covers every angle a technical interviewer can approach for this project.*

*Prioritized study order: Part 17 (Code walkthrough) → Part 3 (Real-time) → Part 4 (React) → Part 18 (DB) → Part 21 (Failures) → Part 26 (Live Coding)*
