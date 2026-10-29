// Tiện ích một lần: trích các giá trị DB đang hardcode trong server.js ra Server/.env
// (Sau khi chạy, nên xoá các giá trị hardcode trong server.js — xem README_DATA_FLOW.md)
const fs = require('fs');
const path = require('path');

const srv = path.join(__dirname, '..', 'server.js');
const s = fs.readFileSync(srv, 'utf8');

function pick(key) {
    const re = new RegExp(`process\\.env\\.${key}\\s*\\|\\|\\s*'([^']+)'`);
    const m = s.match(re);
    return m ? m[1] : '';
}
const portM = s.match(/parseInt\(process\.env\.DB_PORT\)\s*\|\|\s*(\d+)/);

const out = [
    `DB_HOST=${pick('DB_HOST')}`,
    `DB_PORT=${portM ? portM[1] : '4000'}`,
    `DB_USER=${pick('DB_USER')}`,
    `DB_PASSWORD=${pick('DB_PASSWORD')}`,
    `DB_NAME=${pick('DB_NAME')}`,
    '',
].join('\n');

const envPath = path.join(__dirname, '..', '.env');
fs.writeFileSync(envPath, out);
console.log(`Đã ghi ${envPath}`);
console.log(`  DB_HOST=${pick('DB_HOST')}`);
console.log(`  DB_PORT=${portM ? portM[1] : '4000'}`);
console.log(`  DB_NAME=${pick('DB_NAME')}`);
console.log('  DB_USER / DB_PASSWORD: đã ghi (ẩn)');
