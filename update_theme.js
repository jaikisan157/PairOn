const fs = require('fs');
const path = require('path');
const pagesDir = 'app/src/pages';
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.tsx') && !['LandingPage.tsx', 'LoginPage.tsx', 'RegisterPage.tsx', 'OnboardingPage.tsx'].includes(f));

for (const file of files) {
    const fullPath = path.join(pagesDir, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    
    if (content.includes('GlobalThemeToggle')) continue; // Already added

    // Add import right after first import block
    if (content.includes('lucide-react')) {
      content = content.replace(/(import .*?from 'lucide-react';)/, "$1\nimport { GlobalThemeToggle } from '@/components/GlobalThemeToggle';");
    } else {
      content = content.replace(/(import .*?;)/, "$1\nimport { GlobalThemeToggle } from '@/components/GlobalThemeToggle';");
    }
    
    // In DashboardPage.tsx we replace NotificationBell
    if (file === 'DashboardPage.tsx') {
        content = content.replace('<NotificationBell />', '<div className="flex items-center gap-2"><GlobalThemeToggle /><NotificationBell /></div>');
    }
    // In CollaborationPage.tsx we replace before voice call conditionally
    else if (file === 'CollaborationPage.tsx') {
        content = content.replace('{/* Voice Call Button — WebRTC P2P', '<GlobalThemeToggle />\n              {/* Voice Call Button — WebRTC P2P');
    }
    else {
        // Find the right-most div inside header or just append to end of header
        // For pages like CommunityPage, ProfilePage, etc.
        const headerRegex = /(<header[^>]*>)([\s\S]*?)(<\/header>)/;
        const match = content.match(headerRegex);
        if (match) {
            let innerHeader = match[2];
            // Most have flex-shrink-0 or flex or gap things inside. We can safely append it as a top-level child of header if header is flex justify-between.
            // Some headers are: <header className="... flex items-center justify-between ...">
            // By wrapping it in a div that pushes right or just merging it correctly:
            if (innerHeader.includes('justify-between')) {
                 // if it's already justify between, and there are 2 children, adding a 3rd will mess it up UNLESS we append it to the 2nd child.
                 // let's just make the header NOT justify between or append it to the end with a margin left auto
                 // Actually just simpler: replace </header> with <div className="ml-2 flex items-center justify-center shrink-0"><GlobalThemeToggle /></div></header>
            }
            content = content.replace(headerRegex, `${match[1]}${innerHeader}<div className="ml-auto flex items-center gap-2"><GlobalThemeToggle /></div>${match[3]}`);
        }
    }
    
    fs.writeFileSync(fullPath, content);
}
console.log('Done injecting Theme Toggle');
