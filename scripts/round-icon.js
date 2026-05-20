const sharp = require('sharp');
const size = 1024;
const radius = 180;
const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/></svg>`);
sharp('assets/icon.png').resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png().toFile('assets/icon-rounded.png', (err) => { if (err) console.error(err); else console.log('Done'); });
