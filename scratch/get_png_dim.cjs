
const fs = require('fs');
const buffer = fs.readFileSync('d:\\Test\\tembak_ikan\\public\\assets\\coolfish\\sharkjumbo.png');
const width = buffer.readUInt32BE(16);
const height = buffer.readUInt32BE(20);
console.log(`Width: ${width}, Height: ${height}`);
