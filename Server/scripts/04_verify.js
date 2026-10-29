// Chỉ ĐỌC. Đối chiếu số liệu trong bài báo với số tính lại từ CSDL,
// in ra danh sách điểm khớp / lệch để đưa vào báo cáo giải trình PB1.
const { getConn } = require('./_db');

const f = (v, d = 2) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));

(async () => {
    const c = await getConn();
    const issues = [];

    // ---- 1. Bảng I ----
    console.log('═══ 1. BẢNG I — đặc tính 621 thực phẩm ═══');
    const [t1] = await c.query(`
        SELECT c.metric,
               c.n_items AS n_db,  p.n_items AS n_paper,
               c.mean_value AS mean_db, p.mean_value AS mean_paper,
               c.sd_value AS sd_db, p.sd_value AS sd_paper
        FROM exp_food_stats c
        JOIN exp_food_stats p ON p.metric=c.metric AND p.value_source='paper_reported'
        WHERE c.value_source='computed_from_db'`);
    for (const r of t1) {
        const meanOk = r.mean_db === null || Math.abs(r.mean_db - r.mean_paper) < 0.01;
        const sdOk = r.sd_db === null || (r.sd_paper !== null && Math.abs(r.sd_db - r.sd_paper) < 0.01);
        const nOk = r.n_db === r.n_paper;
        console.log(`  ${r.metric.padEnd(34)} n ${String(r.n_db).padStart(4)}/${String(r.n_paper).padStart(4)} ${nOk ? 'OK' : 'LỆCH'}` +
            `  mean ${f(r.mean_db).padStart(8)}/${f(r.mean_paper).padStart(8)} ${meanOk ? 'OK' : 'LỆCH'}` +
            `  SD ${f(r.sd_db).padStart(8)}/${f(r.sd_paper).padStart(8)} ${sdOk ? 'OK' : 'LỆCH'}`);
        if (!nOk) issues.push(`Bảng I — ${r.metric}: n trong bài ${r.n_paper}, CSDL ${r.n_db}`);
        if (!sdOk) issues.push(`Bảng I — ${r.metric}: SD trong bài ${f(r.sd_paper)}, tính lại ${f(r.sd_db)}`);
    }

    // ---- 2. Bảng II: kiểm tra % cải thiện có khớp mean_diff / baseline ----
    console.log('\n═══ 2. BẢNG II — nội kiểm % cải thiện và 95% CI ═══');
    const [t2] = await c.query(`SELECT * FROM exp_metrics_summary WHERE value_source='paper_reported'`);
    for (const r of t2) {
        if (r.baseline_mean === null || r.mean_diff === null) { console.log(`  ${r.metric.padEnd(24)} (không áp dụng)`); continue; }
        // Chỉ số dạng tỷ lệ (%) báo cáo theo ĐIỂM PHẦN TRĂM (96−64 = +32 đp),
        // các chỉ số còn lại báo cáo theo % GIẢM TƯƠNG ĐỐI (mean_diff / baseline).
        const isRate = r.unit === '%';
        const calc = isRate ? r.mean_diff : (r.mean_diff / r.baseline_mean) * 100;
        const ok = Math.abs(calc - r.improvement_pct) < 0.15;
        const ciOk = r.ci95_low === null ? null : (r.mean_diff > r.ci95_low && r.mean_diff < r.ci95_high);
        console.log(`  ${r.metric.padEnd(24)} cải thiện in ${f(r.improvement_pct)}${isRate ? 'đp' : '%'} / tính ${f(calc)}${isRate ? 'đp' : '%'} ${ok ? 'OK' : 'LỆCH'}` +
            `   95%CI ${r.ci95_low === null ? 'THIẾU' : `[${f(r.ci95_low)}, ${f(r.ci95_high)}] ${ciOk ? 'OK' : 'LỆCH'}`}`);
        if (!ok) issues.push(`Bảng II — ${r.metric}: % cải thiện không khớp (${f(r.improvement_pct)} vs ${f(calc)})`);
        if (r.ci95_low === null) issues.push(`Bảng II — ${r.metric}: còn thiếu 95% CI mà PB1 yêu cầu`);
    }

    // ---- 3. Bảng III: Precision/Recall tính lại từ ma trận nhầm lẫn ----
    console.log('\n═══ 3. BẢNG III — Precision/Recall suy từ Confusion Matrix ═══');
    const [t3] = await c.query(`SELECT * FROM exp_guardrail_results WHERE value_source='paper_reported'`);
    for (const r of t3) {
        const p = r.tp + r.fp ? (r.tp / (r.tp + r.fp)) * 100 : null;
        const rc = r.tp + r.fn ? (r.tp / (r.tp + r.fn)) * 100 : null;
        const f1 = p && rc ? (2 * p * rc) / (p + rc) : null;
        const pOk = p === null || Math.abs(p - r.precision_pct) < 0.15;
        const rOk = rc === null || Math.abs(rc - r.recall_pct) < 0.15;
        console.log(`  ${r.method.padEnd(32)} TP=${r.tp} FP=${r.fp} TN=${r.tn} FN=${r.fn}`);
        console.log(`      Precision in ${f(r.precision_pct)}% / tính ${f(p)}% ${pOk ? 'OK' : '<<< LỆCH'}` +
            `   Recall in ${f(r.recall_pct)}% / tính ${f(rc)}% ${rOk ? 'OK' : '<<< LỆCH'}   F1 tính ${f(f1)}%`);
        if (!pOk) issues.push(`Bảng III — ${r.method}: Precision in ${f(r.precision_pct)}% nhưng ma trận cho ${f(p)}% (F1 = ${f(f1)}%)`);
        if (!rOk) issues.push(`Bảng III — ${r.method}: Recall in ${f(r.recall_pct)}% nhưng ma trận cho ${f(rc)}%`);
    }

    // ---- 4. GL ----
    console.log('\n═══ 4. MỤC IV.D — Tải lượng đường huyết ═══');
    const [t4] = await c.query(`SELECT * FROM exp_gl_summary WHERE value_source='paper_reported'`);
    for (const r of t4) {
        if (r.before_mean !== null) {
            const calc = ((r.before_mean - r.after_mean) / r.before_mean) * 100;
            const ok = Math.abs(calc - r.reduction_pct) < 0.15;
            console.log(`  ${r.metric.padEnd(40)} ${f(r.before_mean)}±${f(r.before_sd)} → ${f(r.after_mean)}±${f(r.after_sd)}` +
                `  giảm in ${f(r.reduction_pct)}% / tính ${f(calc)}% ${ok ? 'OK' : 'LỆCH'}`);
        } else {
            console.log(`  ${r.metric.padEnd(40)} ${r.note}`);
        }
    }

    // ---- 5. Độ phủ GI: có đủ dữ liệu để tính công thức (9) không? ----
    console.log('\n═══ 5. ĐỘ PHỦ GI — điều kiện cần để tính công thức (9) ═══');
    const [[gi]] = await c.query(`
        SELECT COUNT(*) total,
               SUM(gi IS NOT NULL) has_gi,
               SUM(gi_source='literature') lit,
               SUM(gi_source='category_proxy') proxy,
               SUM(gi_source='negligible_carb') negl,
               SUM(gi IS NULL AND carb_100g >= 5) missing_with_carb
        FROM foods`);
    if (gi.total === 0) {
        console.log('  Bảng foods đang trống — chạy 02_seed_foods.js trước.');
        issues.push('Bảng foods trống: công thức (9) chưa có nguồn GI_i.');
    } else {
        console.log(`  Tổng ${gi.total} món | có GI: ${gi.has_gi} (y văn ${gi.lit}, suy nhóm ${gi.proxy}, carb không đáng kể ${gi.negl})`);
        console.log(`  Còn thiếu GI mà vẫn có bột đường ≥5g: ${gi.missing_with_carb} món`);
        if (gi.missing_with_carb > 0) issues.push(`Còn ${gi.missing_with_carb} món có bột đường nhưng chưa có GI — GL của thực đơn chứa các món này sẽ bị tính thiếu.`);
        if (gi.proxy > 0) issues.push(`${gi.proxy} món đang dùng GI suy theo nhóm (category_proxy) — cần chuyên gia dinh dưỡng rà soát trước khi in bài.`);
    }

    // ---- 6. Trạng thái hiện thực hoá công thức ----
    console.log('\n═══ 6. TRẠNG THÁI HIỆN THỰC HOÁ 10 CÔNG THỨC ═══');
    const [t6] = await c.query(`
        SELECT formula_no, MAX(formula_expr) expr,
               SUM(status='implemented') impl, SUM(status='partial') part, SUM(status='missing') miss
        FROM formula_data_map GROUP BY formula_no ORDER BY CAST(formula_no AS UNSIGNED)`);
    for (const r of t6) {
        const verdict = r.miss > 0 ? 'THIẾU NGUỒN DỮ LIỆU' : (r.part > 0 ? 'có tính nhưng chưa lưu CSDL' : 'đầy đủ');
        console.log(`  (${r.formula_no}) ${String(r.expr).padEnd(44)} ${verdict}`);
    }

    // ---- 7. Luồng production: đã có dữ liệu chưa ----
    console.log('\n═══ 7. LUỒNG SẢN XUẤT ═══');
    for (const t of ['users', 'nutrition_targets', 'schedules', 'meal_items', 'daily_nutrition_summary']) {
        const [[n]] = await c.query(`SELECT COUNT(*) n FROM \`${t}\``);
        console.log(`  ${t.padEnd(26)} ${String(n.n).padStart(6)} dòng`);
    }
    const [[pal]] = await c.query(`SELECT COUNT(*) total, SUM(activity_pal IS NOT NULL) has_pal FROM users`);
    console.log(`  users có activity_pal: ${pal.has_pal}/${pal.total}`);
    if (pal.has_pal < pal.total) issues.push(`${pal.total - pal.has_pal}/${pal.total} người dùng chưa có activity_pal — TDEE (công thức 4) của họ không tái lập được từ CSDL.`);

    // ---- Tổng kết ----
    console.log(`\n${'═'.repeat(70)}\nTỔNG KẾT: ${issues.length} điểm cần xử lý\n${'═'.repeat(70)}`);
    issues.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

    await c.end();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
