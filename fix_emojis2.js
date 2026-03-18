const fs = require('fs');
const file = 'c:/Users/jaikisan/Downloads/PairOn/app/src/pages/CollaborationPage.tsx';
let c = fs.readFileSync(file, 'utf8');

const before = c.length;

// Fix ⭐ (U+2B50): E2 AD 90 → W1252: â(E2) ­(AD=soft-hyphen) \x90(ctrl)
c = c.split('\u00e2\u00ad\u0090').join('\u2b50');

// Fix • bullet (U+2022): E2 80 A2 → W1252: â(E2) €(80) ¢(A2)  
c = c.split('\u00e2\u20ac\u00a2').join('\u2022');

// Fix ❌ (U+274C): E2 9D 8C → W1252: â(E2) \x9D(ctrl) Œ(8C=U+0152)
c = c.split('\u00e2\u009d\u0152').join('\u274c');

// Fix ─ box drawing (U+2500): E2 94 80 → W1252: â(E2) \x94(ctrl→U+0094) €(80→U+20AC)
c = c.split('\u00e2\u0094\u20ac').join('\u2500');
c = c.split('\u00e2\u201d\u20ac').join('\u2500'); // alt
c = c.split('\u00e2\u0080\u0094').join('\u2014'); // em dash fallback

// Fix ⏰ clock (U+23F0): E2 8F B0 → W1252: â(E2) \x8F(ctrl) °(B0)
c = c.split('\u00e2\u008f\u00b0').join('\u23f0');

// Fix 🔐 (U+1F510): F0 9F 94 90 → W1252: ð(F0) Ÿ(9F=U+0178) \x94(ctrl) \x90(ctrl)
c = c.split('\u00f0\u0178\u0094\u0090').join('\ud83d\udd10');

// Fix 🔒 (U+1F512): F0 9F 94 92 → ð(F0) Ÿ(9F) \x94 '(92=U+2018)
c = c.split('\u00f0\u0178\u2018').join('\ud83d\udd12');

fs.writeFileSync(file, c, 'utf8');

// Verify
const lines = fs.readFileSync(file, 'utf8').split('\n');
const bad = lines.map((l,i) => [i+1,l]).filter(([,l]) => /[\xc0-\xff][\x80-\xbf]/.test(l));
console.log('Remaining garbled lines:', bad.length);
bad.forEach(([n,l]) => {
  const chars = [];
  for(let i=0;i<l.length&&i<120;i++){
    const code=l.charCodeAt(i);
    if(code>127) chars.push('U+'+code.toString(16).toUpperCase());
  }
  console.log('L'+n+':', chars.join(' '));
});
if(bad.length===0) console.log('All clean!');
