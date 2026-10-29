// Áp dụng Server/db/01_schema_nutriai.sql lên TiDB.
// Chỉ ADD COLUMN / CREATE TABLE IF NOT EXISTS — không DROP, không sửa dữ liệu đang có.
// Chạy lại nhiều lần vẫn an toàn (idempotent).
const fs = require('fs');
const path = require('path');
const { getConn } = require('./_db');

// Mặc định chạy lược đồ chính; truyền tên file để chạy lược đồ khác.
//   node scripts/01_migrate.js 02_schema_experiment.sql
const SQL_FILE = path.join(__dirname, '..', 'db', process.argv[2] || '01_schema_nutriai.sql');

// Tách statement theo dấu ';' ở cuối dòng, bỏ comment dòng '--'
function splitStatements(sql) {
    const lines = sql.split(/\r?\n/).filter(l => !/^\s*--/.test(l));
    return lines.join('\n')
        .split(/;\s*(?:\r?\n|$)/)
        .map(s => s.trim())
        .filter(Boolean);
}

const IGNORABLE = new Set([
    'ER_DUP_FIELDNAME',   // ALTER TABLE ... ADD COLUMN đã tồn tại
    'ER_TABLE_EXISTS_ERROR',
    'ER_DUP_KEYNAME',
]);

(async () => {
    const c = await getConn();
    const stmts = splitStatements(fs.readFileSync(SQL_FILE, 'utf8'));
    console.log(`Đang áp dụng ${stmts.length} câu lệnh từ ${path.basename(SQL_FILE)}\n`);

    let ok = 0, skipped = 0;
    for (const s of stmts) {
        const label = s.split(/\r?\n/)[0].slice(0, 72);
        try {
            await c.query(s);
            ok++;
            console.log(`  ✓ ${label}`);
        } catch (e) {
            if (IGNORABLE.has(e.code)) {
                skipped++;
                console.log(`  ~ ${label}   (đã tồn tại — bỏ qua)`);
            } else {
                console.error(`  ✗ ${label}\n    ${e.code}: ${e.message}`);
                throw e;
            }
        }
    }
    console.log(`\nHoàn tất: ${ok} lệnh thực thi, ${skipped} lệnh bỏ qua vì đã tồn tại.`);
    await c.end();
})().catch(e => { console.error('\nMIGRATION THẤT BẠI:', e.message); process.exit(1); });
