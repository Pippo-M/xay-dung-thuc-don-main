// Kiểm tra kết nối TiDB và in trạng thái schema hiện tại (chỉ đọc).
const { getConn } = require('./_db');

(async () => {
    const c = await getConn();
    const [[v]] = await c.query('SELECT VERSION() AS version, DATABASE() AS db, NOW() AS now_at');
    console.log(`TiDB: ${v.version} | database: ${v.db} | ${v.now_at}`);

    const [tables] = await c.query('SHOW TABLES');
    const names = tables.map(r => Object.values(r)[0]);
    console.log(`\nBảng hiện có (${names.length}):`);
    for (const n of names) {
        const [[cnt]] = await c.query(`SELECT COUNT(*) AS n FROM \`${n}\``);
        console.log(`  - ${n.padEnd(28)} ${String(cnt.n).padStart(6)} dòng`);
    }

    for (const t of ['users', 'schedules']) {
        if (!names.includes(t)) continue;
        const [cols] = await c.query(`SHOW COLUMNS FROM \`${t}\``);
        console.log(`\n${t}: ${cols.map(x => `${x.Field}(${x.Type})`).join(', ')}`);
    }
    await c.end();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
