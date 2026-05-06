const fs = require('fs');
const filePath = 'd:\\Test\\tembak_ikan\\public\\assets_mentah\\ikan warna emas.webp';
const buffer = fs.readFileSync(filePath);

if (buffer.toString('utf8', 0, 4) === 'RIFF' && buffer.toString('utf8', 8, 12) === 'WEBP') {
    const type = buffer.toString('utf8', 12, 16);
    if (type === 'VP8X') {
        const width = buffer.readUIntLE(24, 3) + 1;
        const height = buffer.readUIntLE(27, 3) + 1;
        console.log(`Width: ${width}, Height: ${height}`);
    } else if (type === 'VP8 ') {
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        console.log(`Width: ${width}, Height: ${height}`);
    } else if (type === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        console.log(`Width: ${width}, Height: ${height}`);
    } else {
        console.log('Unknown WebP type: ' + type);
    }
} else {
    console.log('Not a valid WebP file');
}
