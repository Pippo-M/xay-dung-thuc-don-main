// Đẩy số liệu thực nghiệm của bài báo (Bảng I–IV, GL, SUS, Confusion Matrix)
// lên TiDB, kèm bản đồ truy vết công thức -> cột dữ liệu.
//
// QUY ƯỚC TRUNG THỰC DỮ LIỆU:
//   value_source = 'paper_reported'   -> con số đang in trong bản thảo / báo cáo giải trình PB1.
//                                        Script CHỈ sao chép lại, KHÔNG bịa thêm dòng raw nào.
//   value_source = 'computed_from_db' -> do script khác tính lại từ dữ liệu thật (xem 02, 04).
//
// Các bảng raw (exp_scenarios, exp_runs, exp_guardrail_queries, exp_sus_scores) được
// tạo sẵn nhưng ĐỂ TRỐNG: chúng phải được điền bằng cách chạy thực nghiệm thật.
const { getConn } = require('./_db');

// ---------------------------------------------------------------- Bảng I–IV
const EXPERIMENTS = [
    ['EXP-FOOD-STATS', 'Table I', 'Đặc tính dinh dưỡng 621 thực phẩm FCDB',
        'Thống kê mô tả toàn bộ CSDL', 621, null, null, null, null,
        'Nguồn: Client/food_data.json (621 bản ghi FCDB 2017).'],
    ['EXP-NUTRI-ERR', 'Table II', 'Sai số năng lượng & tuân thủ đa lượng ADA',
        'Paired-samples, N=50 kịch bản, 5 lần lặp/kịch bản (250 lượt sinh)', 50,
        'openai/gpt-oss-120b (Groq LPU)', 0.10, 0.90, 2000,
        'Ground truth: Mifflin-St Jeor + ADA 2026 + FCDB 2017. Baseline: LLM tự do, không RAG, không engine sinh trắc.'],
    ['EXP-GUARDRAIL', 'Table III', 'Hiệu năng kiểm duyệt an toàn y khoa',
        '100 truy vấn (50 trực tiếp + 50 bẫy gián tiếp), 2 RDs gán nhãn độc lập', 100,
        'openai/gpt-oss-120b (Groq LPU)', 0.10, null, 100,
        'Inter-rater Kappa = 0.94. Thuật ngữ: 0% vi phạm TRÊN TẬP THỬ NGHIỆM, không phải Zero Violation tuyệt đối.'],
    ['EXP-GL-OPT', null, 'Tối ưu phản nghiệm & giảm tải lượng đường huyết',
        'Trước/sau tối ưu trên >30 thực đơn vi phạm', 30, null, null, null, null,
        'Theo PB1: CHỈ báo cáo GL, lược bỏ giá trị PPG tuyệt đối vì chưa có mô hình ML trên dữ liệu CGM.'],
    ['EXP-INFER', 'Table IV', 'Benchmark tốc độ suy luận và chi phí hạ tầng',
        'So sánh 3 stack mô hình', null, null, null, null, null, null],
    ['EXP-SUS', null, 'Khảo sát khả dụng SUS', '20 chuyên gia, thang SUS 10 câu', 20,
        null, null, null, null, 'Brooke 1996; phân hạng theo Bangor et al. 2008.'],
];

const METRICS_TABLE_II = [
    // metric, unit, b_mean, b_sd, n_mean, n_sd, improve%, diff, ci_lo, ci_hi, p, test, n
    ['Sai số Calo', 'Kcal', 184.60, 45.10, 32.40, 18.20, 82.40, 152.20, 138.40, 166.00, 'p < 0.001', 'Paired t-test', 50],
    ['Sai số Protein', 'g', 16.80, 6.40, 4.10, 2.60, 75.60, 12.70, null, null, 'p < 0.001', 'Paired t-test', 50],
    ['Sai số Lipid', 'g', 14.20, 5.20, 3.80, 2.10, 73.20, 10.40, null, null, 'p < 0.001', 'Paired t-test', 50],
    ['Sai số Carb', 'g', 28.50, 9.80, 6.50, 3.90, 77.20, 22.00, 19.20, 24.80, 'p < 0.001', 'Paired t-test', 50],
    ['Tuân thủ ADA', '%', 64.00, null, 96.00, null, 32.00, 32.00, 21.50, 42.50, 'p < 0.001', 'McNemar test', 50],
    ['Điểm khả dụng SUS', 'điểm', null, null, 86.50, 5.40, null, null, null, null, null, 'SUS (Brooke 1996)', 20],
];

// Ma trận nhầm lẫn: tập 100 truy vấn, trong đó 50 truy vấn thực sự VI PHẠM.
// TP/FN suy từ Recall; FP suy từ Precision đã công bố. Dual-Layer lấy đúng
// ma trận nêu trong Báo cáo giải trình PB1 (TP=50, TN=48, FP=2, FN=0).
const GUARDRAIL = [
    // method, tp, fp, tn, fn, precision_baibao, recall_baibao, f1, latency, leak, kappa, note
    ['Lớp 1: Rule-based', 44, 0, 50, 6, 100.00, 88.00, null, 2.00, 12.00, null,
        'Bẫy gián tiếp lọt 12%. Lưu ý: báo cáo PB1 nói 2 ca FP phát sinh ở Lớp 1 — mâu thuẫn với Precision 100%.'],
    ['Lớp 2: AI Verification (τ=0.1)', 49, 2, 48, 1, 96.10, 98.00, null, 145.00, 2.00, null,
        'Hiểu ngữ cảnh phủ định ("không thêm đường").'],
    ['Dual-Layer Guardrail', 50, 2, 48, 0, 98.00, 100.00, 98.00, 147.00, 0.00, 0.940,
        'Ma trận theo báo cáo PB1. 0% vi phạm trên tập thử nghiệm 100 truy vấn.'],
    ['Baseline (không lọc)', 18, 25, 25, 32, 42.00, 36.00, null, null, 64.00, null,
        'Ma trận suy ngược từ Precision/Recall đã công bố — cần xác nhận lại bằng raw data.'],
];

const GL_SUMMARY = [
    ['Tải lượng đường huyết (GL) / khẩu phần', 38.60, 5.80, 17.20, 3.10, 55.40, 'p < 0.001', 'Paired t-test', 30,
        'GL ≥ 20 là nguy cơ cao, GL ≤ 10 là an toàn. Công thức (9).'],
    ['Độ lệch calo tổng thể sau tối ưu', null, null, 2.30, null, null, null, null, 30,
        'Đơn vị %. Ràng buộc (10): |E(x") − E_target| < 50 Kcal.'],
    ['Đường huyết sau ăn (PPG) dự báo', null, null, null, null, null, null, null, null,
        'KHÔNG BÁO CÁO: theo PB1 mục 4, bỏ giá trị 182.4 → 128.6 mg/dL vì chưa có mô hình ML huấn luyện trên dữ liệu CGM.'],
];

const INFER = [
    ['NutriAI (GPT-OSS-120B / Groq LPU)', 0.22, 280.40, 1.85, 0.79],
    ['OpenAI GPT-4o', 0.98, 74.80, 7.12, 7.50],
    ['Claude 3.5 Sonnet', 1.15, 62.50, 8.40, 9.00],
];

// ------------------------------------------------- Bản đồ công thức -> dữ liệu
const FORMULA_MAP = [
    // formula_no, expr, variable, table, column, code_ref, status, note
    ['1', 'BMI = W / (H/100)^2', 'W', 'users', 'weight', 'Client/script.js:75', 'implemented', ''],
    ['1', 'BMI = W / (H/100)^2', 'H', 'users', 'height', 'Client/script.js:74', 'implemented', ''],
    ['1', 'BMI = W / (H/100)^2', 'BMI', 'nutrition_targets', 'bmi', 'Client/script.js:85', 'partial', 'Đã tính nhưng trước đây không lưu CSDL.'],
    ['2', 'W_ideal = (H-100) × 0.9', 'H', 'users', 'height', 'Client/script.js:86', 'implemented', ''],
    ['2', 'W_ideal = (H-100) × 0.9', 'W_ideal', 'nutrition_targets', 'ideal_weight_kg', 'Client/script.js:86', 'partial', 'Chỉ hiển thị, không lưu.'],
    ['3', 'BMR = 10W + 6.25H − 5·Age + S', 'Age', 'users', 'age', 'Client/script.js:76', 'implemented', ''],
    ['3', 'BMR = 10W + 6.25H − 5·Age + S', 'S', 'nutrition_targets', 'sex_constant', 'Client/script.js:89', 'implemented', 'nam=+5, nu=−161; nguồn users.gender.'],
    ['3', 'BMR = 10W + 6.25H − 5·Age + S', 'BMR', 'nutrition_targets', 'bmr_kcal', 'Client/script.js:88', 'partial', ''],
    ['4', 'TDEE = BMR × PAL', 'PAL', 'users', 'activity_pal', 'Client/index.html:113-116', 'missing', 'TRƯỚC KHI SỬA: PAL chỉ nằm trong localStorage, không có cột CSDL => không tái lập được TDEE.'],
    ['4', 'TDEE = BMR × PAL', 'TDEE', 'nutrition_targets', 'tdee_kcal', 'Client/script.js:90', 'partial', 'Đồng thời là E_target của công thức (10).'],
    ['5', 'P = W × pRatio', 'pRatio', 'nutrition_targets', 'p_ratio', 'Client/script.js:92', 'implemented', '2.0 nếu PAL>1.5, ngược lại 1.5.'],
    ['5', 'P = W × pRatio', 'P', 'nutrition_targets', 'target_protein_g', 'Client/script.js:93', 'partial', ''],
    ['6', 'L = (TDEE × 0.25) / 9', 'L', 'nutrition_targets', 'target_lipid_g', 'Client/script.js:94', 'partial', ''],
    ['7', 'C = (TDEE − (P×4 + L×9)) / 4', 'C', 'nutrition_targets', 'target_carb_g', 'Client/script.js:95', 'partial', ''],
    ['8', 'min ‖x′−x‖ + λ₁|E(x′)−E| + λ₂·GL(x′)', 'λ1', 'exp_gl_optimization', 'lambda1', '—', 'missing', 'Chưa có bộ giải tối ưu; hiện chỉ thay món bằng luật trong prompt.'],
    ['8', 'min ‖x′−x‖ + λ₁|E(x′)−E| + λ₂·GL(x′)', 'λ2', 'exp_gl_optimization', 'lambda2', '—', 'missing', ''],
    ['8', 'min ‖x′−x‖ + λ₁|E(x′)−E| + λ₂·GL(x′)', 'x→x′', 'meal_items', 'replaced_food_id', '—', 'missing', 'Cần ghi vết món bị thay để chứng minh (8).'],
    ['9', 'GL = Σ (GI_i × C_i / 100)', 'GI_i', 'foods', 'gi', 'Server/data/gi_rules.json', 'missing', 'food_data.json KHÔNG có GI => trước khi bổ sung, GL không tính được từ dữ liệu.'],
    ['9', 'GL = Σ (GI_i × C_i / 100)', 'C_i', 'meal_items', 'carb_g', 'Client/script.js:156', 'partial', 'carb_100g × grams/100.'],
    ['9', 'GL = Σ (GI_i × C_i / 100)', 'GL', 'daily_nutrition_summary', 'gl_total', '—', 'missing', ''],
    ['10', '|E(x′) − E_target| < 50 Kcal', 'E(x′)', 'daily_nutrition_summary', 'kcal_consumed', 'Client/script.js:277', 'partial', 'Trước đây chỉ cộng trong bộ nhớ trình duyệt.'],
    ['10', '|E(x′) − E_target| < 50 Kcal', 'E_target', 'nutrition_targets', 'tdee_kcal', 'Client/script.js:284', 'partial', ''],
    ['10', '|E(x′) − E_target| < 50 Kcal', 'ràng buộc', 'daily_nutrition_summary', 'within_50kcal', '—', 'missing', 'Chưa có kiểm tra ngưỡng 50 Kcal trong code.'],
];

(async () => {
    const c = await getConn();

    const q = async (sql, params, label) => {
        const [r] = await c.query(sql, params);
        console.log(`  ✓ ${label}: ${r.affectedRows} dòng`);
    };

    console.log('Đẩy số liệu thực nghiệm lên TiDB...\n');

    await q(`INSERT INTO exp_experiments (code, table_ref, title, design, n_units, model, temperature, top_p, max_tokens, notes)
             VALUES ? ON DUPLICATE KEY UPDATE title=VALUES(title), design=VALUES(design), n_units=VALUES(n_units),
             model=VALUES(model), temperature=VALUES(temperature), top_p=VALUES(top_p), max_tokens=VALUES(max_tokens), notes=VALUES(notes)`,
        [EXPERIMENTS], 'exp_experiments');

    await q(`INSERT INTO exp_metrics_summary
             (metric, unit, baseline_mean, baseline_sd, nutriai_mean, nutriai_sd, improvement_pct,
              mean_diff, ci95_low, ci95_high, p_value, test_name, n_pairs, value_source)
             VALUES ? ON DUPLICATE KEY UPDATE
             baseline_mean=VALUES(baseline_mean), baseline_sd=VALUES(baseline_sd),
             nutriai_mean=VALUES(nutriai_mean), nutriai_sd=VALUES(nutriai_sd),
             improvement_pct=VALUES(improvement_pct), mean_diff=VALUES(mean_diff),
             ci95_low=VALUES(ci95_low), ci95_high=VALUES(ci95_high),
             p_value=VALUES(p_value), test_name=VALUES(test_name), n_pairs=VALUES(n_pairs)`,
        [METRICS_TABLE_II.map(r => [...r, 'paper_reported'])], 'exp_metrics_summary (Bảng II)');

    await q(`INSERT INTO exp_guardrail_results
             (method, tp, fp, tn, fn, precision_pct, recall_pct, f1_pct, latency_ms, leak_rate_pct, kappa, note, value_source)
             VALUES ? ON DUPLICATE KEY UPDATE
             tp=VALUES(tp), fp=VALUES(fp), tn=VALUES(tn), fn=VALUES(fn),
             precision_pct=VALUES(precision_pct), recall_pct=VALUES(recall_pct), f1_pct=VALUES(f1_pct),
             latency_ms=VALUES(latency_ms), leak_rate_pct=VALUES(leak_rate_pct), kappa=VALUES(kappa), note=VALUES(note)`,
        [GUARDRAIL.map(r => [...r, 'paper_reported'])], 'exp_guardrail_results (Bảng III)');

    await q(`INSERT INTO exp_gl_summary
             (metric, before_mean, before_sd, after_mean, after_sd, reduction_pct, p_value, test_name, n_menus, note, value_source)
             VALUES ? ON DUPLICATE KEY UPDATE
             before_mean=VALUES(before_mean), before_sd=VALUES(before_sd), after_mean=VALUES(after_mean),
             after_sd=VALUES(after_sd), reduction_pct=VALUES(reduction_pct), p_value=VALUES(p_value),
             test_name=VALUES(test_name), n_menus=VALUES(n_menus), note=VALUES(note)`,
        [GL_SUMMARY.map(r => [...r, 'paper_reported'])], 'exp_gl_summary (mục IV.D)');

    await q(`INSERT INTO exp_inference_benchmark (model_stack, ttft_s, throughput_tps, menu_time_s, cost_per_1k_usd, value_source)
             VALUES ? ON DUPLICATE KEY UPDATE
             ttft_s=VALUES(ttft_s), throughput_tps=VALUES(throughput_tps),
             menu_time_s=VALUES(menu_time_s), cost_per_1k_usd=VALUES(cost_per_1k_usd)`,
        [INFER.map(r => [...r, 'paper_reported'])], 'exp_inference_benchmark (Bảng IV)');

    await q(`INSERT INTO formula_data_map (formula_no, formula_expr, variable, source_table, source_column, code_ref, status, note)
             VALUES ? ON DUPLICATE KEY UPDATE
             formula_expr=VALUES(formula_expr), source_table=VALUES(source_table),
             source_column=VALUES(source_column), code_ref=VALUES(code_ref), status=VALUES(status), note=VALUES(note)`,
        [FORMULA_MAP], 'formula_data_map');

    console.log('\nCác bảng RAW cố ý để trống (phải điền bằng thực nghiệm thật, không bịa):');
    for (const t of ['exp_scenarios', 'exp_runs', 'exp_guardrail_queries', 'exp_gl_optimization', 'exp_sus_scores']) {
        const [[n]] = await c.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
        console.log(`  - ${t.padEnd(24)} ${n.n} dòng`);
    }

    await c.end();
    console.log('\nXong 03_push_experiments.js');
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
