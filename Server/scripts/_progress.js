// Theo dõi tiến độ mẻ chạy thực nghiệm (chỉ đọc).
const { getConn } = require('./_db');
(async () => {
    const c = await getConn();
    const [[n]] = await c.query(
        `SELECT COUNT(*) total, SUM(parse_ok=1) ok, SUM(parse_ok=0) loi,
                ROUND(AVG(match_rate_pct),1) khop_tb, MAX(created_at) moi_nhat
         FROM exp_runs`);
    console.log(`Đã ghi ${n.total} lượt | bóc tách được ${n.ok} | lỗi ${n.loi} | khớp FCDB TB ${n.khop_tb}% | mới nhất ${n.moi_nhat}`);

    const [byArm] = await c.query(`
        SELECT arm, COUNT(*) n,
               ROUND(AVG(err_kcal),1) err_kcal, ROUND(STDDEV_SAMP(err_kcal),1) sd,
               ROUND(AVG(err_protein_g),1) err_p, ROUND(AVG(err_carb_g),1) err_c,
               ROUND(AVG(ABS(selfreport_bias)),1) bias,
               ROUND(100*AVG(ada_compliant),1) tuan_thu,
               SUM(contraindicated_hits) cam
        FROM exp_runs WHERE parse_ok=1 GROUP BY arm`);
    if (byArm.length) console.table(byArm);
    await c.end();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
