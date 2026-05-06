
const fs = require('fs');
const content = fs.readFileSync('d:\\Test\\tembak_ikan\\src\\scenes\\MainGame.ts', 'utf8');
let braces = 0;
let parens = 0;
let brackets = 0;
for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') braces++;
    if (content[i] === '}') braces--;
    if (content[i] === '(') parens++;
    if (content[i] === ')') parens--;
    if (content[i] === '[') brackets++;
    if (content[i] === ']') brackets--;
}
console.log(`Braces: ${braces}, Parens: ${parens}, Brackets: ${brackets}`);
