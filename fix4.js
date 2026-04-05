const fs = require('fs');

try {
  let c1 = fs.readFileSync('app/src/pages/CollaborationPage.tsx', 'utf-8');
  c1 = c1.replace(/ðŸ’»/g, '💻');
  fs.writeFileSync('app/src/pages/CollaborationPage.tsx', c1, 'utf-8');
  console.log('Fixed CollaborationPage.tsx');
  
  let c2 = fs.readFileSync('app/src/components/CollabIDE.tsx', 'utf-8');
  c2 = c2.replace(/ðŸ—‘/g, '🗑️')
         .replace(/ðŸš«/g, '🚫')
         .replace(/ðŸ“¤/g, '📤')
         .replace(/ðŸŒ /g, '🌐')
         .replace(/ðŸ“ /g, '📌')
         .replace(/ðŸŽ‰/g, '🎉');
  fs.writeFileSync('app/src/components/CollabIDE.tsx', c2, 'utf-8');
  console.log('Fixed CollabIDE.tsx');
} catch (e) {
  console.error(e);
}
