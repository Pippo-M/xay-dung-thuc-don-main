// Xem danh sách món LLM sinh ra và kết quả đối chiếu với 621 bản ghi FCDB.
const { getConn } = require('./_db');
(async () => {
    const c = await getConn();
    const [rows] = await c.query(
        `SELECT s.scenario_code, r.arm, r.n_items, r.n_items_matched, r.match_rate_pct, r.items_json
         FROM exp_runs r JOIN exp_scenarios s ON s.id=r.scenario_id
         WHERE r.parse_ok=1 ORDER BY r.id DESC LIMIT 1`);
    if (!rows.length) { console.log('Chưa có lượt chạy nào bóc tách được.'); await c.end(); return; }
    const r = rows[0];
    console.log(`${r.scenario_code} / ${r.arm}: ${r.n_items} món, khớp ${r.n_items_matched} (${r.match_rate_pct}%)\n`);
    const items = typeof r.items_json === 'string' ? JSON.parse(r.items_json) : r.items_json;
    for (const it of items) {
        console.log(`  "${it.mon}" ${it.gram}g`.padEnd(52) + (it.fcdb ? `→ ${it.fcdb.ten} (${it.fcdb.how}, ${it.fcdb.score})` : '→ KHÔNG KHỚP'));
    }
    await c.end();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
