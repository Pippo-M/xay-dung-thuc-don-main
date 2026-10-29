// Xem thử phản hồi thô của model để chẩn đoán lỗi bóc tách.
const { getConn } = require('./_db');
(async () => {
    const c = await getConn();
    const [rows] = await c.query(
        `SELECT r.arm, r.run_index, r.parse_note, r.tokens_out, r.raw_response, s.scenario_code
         FROM exp_runs r JOIN exp_scenarios s ON s.id = r.scenario_id
         ORDER BY r.id LIMIT 2`);
    for (const r of rows) {
        console.log(`\n===== ${r.scenario_code} / ${r.arm} #${r.run_index} | tokens_out=${r.tokens_out} =====`);
        console.log(`ghi chú: ${r.parse_note}`);
        console.log(`độ dài raw: ${r.raw_response ? r.raw_response.length : 0} ký tự`);
        console.log('--- 1200 ký tự đầu ---');
        console.log((r.raw_response || '(rỗng)').slice(0, 1200));
        console.log('--- 400 ký tự cuối ---');
        console.log((r.raw_response || '').slice(-400));
    }
    await c.end();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
