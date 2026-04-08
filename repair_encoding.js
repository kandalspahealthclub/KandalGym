const fs = require('fs');
const path = 'c:\\Users\\KandalSPA\\.gemini\\antigravity\\scratch\\fitness-pro\\app.js';
let content = fs.readFileSync(path, 'utf8');

// Define replacements for known corruptions
const replacements = [
    { pattern: /á¢/g, replacement: 'a' },
    { pattern: /á‡áƒO/g, replacement: 'ÇÃO' },
    { pattern: /á‡/g, replacement: 'ç' },
    { pattern: /áƒ/g, replacement: 'ã' },
    { pattern: /Ã¡/g, replacement: 'á' },
    { pattern: /Ã§Ã£/g, replacement: 'çã' },
    { pattern: /Ã§/g, replacement: 'ç' },
    { pattern: /Ã£/g, replacement: 'ã' },
    { pattern: /Ã©/g, replacement: 'é' },
    { pattern: /Ã³/g, replacement: 'ó' },
    { pattern: /Ãº/g, replacement: 'ú' },
    { pattern: /Ã­/g, replacement: 'í' },
    { pattern: /Ãª/g, replacement: 'ê' },
    { pattern: /Ãµ/g, replacement: 'õ' },
    { pattern: /Â¢/g, replacement: '' }
];

replacements.forEach(r => {
    content = content.replace(r.pattern, r.replacement);
});

fs.writeFileSync(path, content, 'utf8');
console.log('File repaired successfully.');
