const fs = require('fs');
const path = require('path');
const pagesDir = 'app/src/pages';
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.tsx'));

for (const file of files) {
    const fullPath = path.join(pagesDir, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    
    if (content.includes('<GlobalThemeToggle') && !content.includes('import { GlobalThemeToggle }')) {
        content = "import { GlobalThemeToggle } from '@/components/GlobalThemeToggle';\n" + content;
        fs.writeFileSync(fullPath, content);
        console.log('Fixed ' + file);
    }
}
