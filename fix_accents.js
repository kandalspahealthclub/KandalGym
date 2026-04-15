const fs = require('fs');
const filePath = 'c:/Users/KandalSPA/.gemini/antigravity/scratch/fitness-pro/app.js';
const content = fs.readFileSync(filePath, 'utf8');

// Global replacement of the most common corruption patterns found
let newContent = content
    .replace(/VáÂ\s+LIDA/g, 'VÁLIDA')
    .replace(/áÂ\s*DA/g, 'ÍDA')
    .replace(/SAÍDA/g, 'SAÍDA') // Ensure SAÍDA (redundant but safe)
    .replace(/DIáÂ\s*RIO/g, 'DIÁRIO')
    .replace(/áÂ\s+gua/g, 'Água')
    .replace(/áÂ\s*rea/g, 'área')
    .replace(/áÂ\s+à/g, ' à')
    .replace(/ENTRADA\s+VÁLIDA/g, 'ENTRADA VÁLIDA')
    .replace(/VáÂ\s+LIDA/g, 'VÁLIDA');

// Fix specific line 2018 if it hasn't changed
newContent = newContent.replace('ENTRADA VáÂ LIDA', 'ENTRADA VÁLIDA');

fs.writeFileSync(filePath, newContent);
console.log('Global cleanup complete.');
