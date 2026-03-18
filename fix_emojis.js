const fs = require('fs');
const path = require('path');

// These are Windows-1252 chars incorrectly re-encoded as UTF-8
// Mapping: (garbled Unicode string) → correct char
// Em-dash: UTF-8 bytes E2 80 94, read as W1252 gives â(E2) €(80→0x20AC) "(94→0x201D)
const fixes = [
  ['\u00E2\u20AC\u201D', '\u2014'],  // â€" → — (em dash)
  ['\u00E2\u20AC\u2122', '\u2019'],  // â€™ → ' (right single quote, W1252 0x99=™)
  ['\u00E2\u20AC\u02DC', '\u2018'],  // â€˜ → ' (left single quote, W1252 0x98=˜)
  ['\u00E2\u20AC\u0153', '\u201C'],  // â€œ → " (left double quote, W1252 0x9C=œ)
  ['\u00E2\u20AC\u009D', '\u201D'],  // â€  → " (right double quote, W1252 0x9D=•)  
  ['\u00E2\u20AC\u00A6', '\u2026'],  // â€¦ → … (ellipsis)
  // Single-char garbled sequences
  ['\u00E2\u009C\u0085', '\u2705'],  // ✅ (E2 9C 85)
  ['\u00E2\u009C\u008C', '\u274C'],  // ❌
  ['\u00E2\u009C\u008F', '\u270F'],  // ✏
  ['\u00EF\u00B8\u008F', '\uFE0F'],  // ️ variation selector (often after ✏)
  ['\u00E2\u009A\u00A1', '\u26A1'],  // ⚡
  ['\u00E2\u0098\u0085', '\u2605'],  // ★
  ['\u00E2\u0086\u0090', '\u2190'],  // ←
  ['\u00E2\u0086\u0092', '\u2192'],  // →
  ['\u00E2\u009C\u0094', '\u2714'],  // ✔
  ['\u00E2\u008F\u00B0', '\u23F0'],  // ⏰ (alarm clock)  
  ['\u00E2\u008F\u00B3', '\u23F3'],  // ⏳ (hourglass)
  // 4-byte emoji: F0 9F ... → ðŸ... pattern
  // These become U+00F0, U+009F, then two more bytes in W1252
  ['\u00F0\u009F\u008F\u0086', '\uD83C\uDFC6'],  // 🏆
  ['\u00F0\u009F\u0094\u00A8', '\uD83D\uDD28'],  // 🔨
  ['\u00F0\u009F\u008E\u00AF', '\uD83C\uDFAF'],  // 🎯
  ['\u00F0\u009F\u0093\u0081', '\uD83D\uDCC1'],  // 📁
  ['\u00F0\u009F\u0092\u00BE', '\uD83D\uDCBE'],  // 💾
  ['\u00F0\u009F\u009A\u00A8', '\uD83D\uDEA8'],  // 🚨
  ['\u00F0\u009F\u008E\u0089', '\uD83C\uDF89'],  // 🎉
  ['\u00F0\u009F\u009A\u0080', '\uD83D\uDE80'],  // 🚀
  ['\u00F0\u009F\u0094\u0094', '\uD83D\uDD14'],  // 🔔
  ['\u00F0\u009F\u0091\u008B', '\uD83D\uDC4B'],  // 👋
  ['\u00F0\u009F\u0092\u00A1', '\uD83D\uDCA1'],  // 💡
  ['\u00F0\u009F\u0094\u00A5', '\uD83D\uDD25'],  // 🔥
  ['\u00F0\u009F\u008C\u009F', '\uD83C\uDF1F'],  // 🌟
  ['\u00F0\u009F\u00A4\u009D', '\uD83E\uDD1D'],  // 🤝
  ['\u00F0\u009F\u0092\u00BB', '\uD83D\uDCBB'],  // 💻
  ['\u00F0\u009F\u0093\u009D', '\uD83D\uDCDD'],  // 📝
  ['\u00F0\u009F\u0094\u008D', '\uD83D\uDD0D'],  // 🔍
  ['\u00F0\u009F\u00A7\u00B9', '\uD83E\uDDF9'],  // 🧹
  ['\u00F0\u009F\u0092\u00AC', '\uD83D\uDCAC'],  // 💬
  ['\u00F0\u009F\u0093\u00A2', '\uD83D\uDCE2'],  // 📢
  ['\u00F0\u009F\u008E\u00B8', '\uD83C\uDFB8'],  // 🎸
  ['\u00F0\u009F\u0091\u008D', '\uD83D\uDC4D'],  // 👍
  ['\u00F0\u009F\u0091\u008E', '\uD83D\uDC4E'],  // 👎
  ['\u00E2\u009D\u00A4', '\u2764'],              // ❤
  ['\u00E2\u009D\u008C', '\u274C'],              // ❌ alt
];

const filesToFix = [
  'app/src/pages/CollaborationPage.tsx',
  'app/src/pages/QuickConnectPage.tsx',
  'app/src/components/CollabIDE.tsx',
  'app/src/pages/DashboardPage.tsx',
  'app/src/pages/ProfilePage.tsx',
  'app/src/pages/LoginPage.tsx',
  'app/src/pages/ProjectsPage.tsx',
  'app/src/App.tsx',
  'app/src/components/UserProfileModal.tsx',
  'backend/src/services/challenge.ts',
  'backend/src/services/socket.ts',
  'backend/src/routes/auth.ts',
];

const base = __dirname;
let totalFixed = 0;

filesToFix.forEach(f => {
  const p = path.join(base, f);
  if (!fs.existsSync(p)) { console.log('SKIP:', f); return; }
  let content = fs.readFileSync(p, 'utf8');
  let changed = false;
  fixes.forEach(([bad, good]) => {
    if (content.includes(bad)) {
      content = content.split(bad).join(good);
      changed = true;
      totalFixed++;
    }
  });
  if (changed) { fs.writeFileSync(p, content, 'utf8'); console.log('FIXED:', f); }
  else console.log('OK:', f);
});
console.log('\nTotal replacements:', totalFixed);
