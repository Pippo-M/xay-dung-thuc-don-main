// Nạp 621 bản ghi FCDB (Client/food_data.json) vào bảng `foods` trên TiDB,
// gắn thêm 2 lớp dữ liệu mà file JSON không có:
//   1) gi / gi_class / gi_source  -> biến GI_i của công thức (9) GL = Σ(GI_i × C_i / 100)
//   2) is_contraindicated_dm      -> danh mục chặn của Guardrail Lớp 1
// Sau đó tính lại Bảng I trực tiếp từ dữ liệu và ghi vào exp_food_stats.
const fs = require('fs');
const path = require('path');
const { getConn } = require('./_db');

const FOOD_JSON = path.join(__dirname, '..', '..', 'Client', 'food_data.json');
const GI_RULES = path.join(__dirname, '..', 'data', 'gi_rules.json');

// Giữ ĐỒNG BỘ với CONTRAINDICATIONS['Tiểu đường'] trong server.js
const DM_BANNED_KEYWORDS = ['đường', 'kẹo', 'nước ngọt', 'bánh mì trắng', 'mật ong', 'chè', 'sữa đặc'];

function classifyGi(gi, bounds) {
    if (gi === null || gi === undefined) return 'na';
    if (gi <= bounds.low_max) return 'low';
    if (gi <= bounds.medium_max) return 'medium';
    return 'high';
}

function resolveGi(name, carb100, rulesCfg) {
    const lower = name.toLowerCase();
    for (const r of rulesCfg.rules) {
        if (!r.match) continue;               // bỏ qua các mục chú thích trong file rules
        if (lower.includes(r.match.toLowerCase())) {
            return { gi: r.gi, source: r.source };
        }
    }
    // Món gần như không có bột đường -> GL ≈ 0 bất kể GI thực tế là bao nhiêu.
    if (carb100 < rulesCfg.negligible_carb_threshold_g) {
        return { gi: 0, source: 'negligible_carb' };
    }
    return { gi: null, source: null };   // chưa tra được — để NULL, không đoán bừa
}

function matchContra(name) {
    const lower = name.toLowerCase();
    for (const k of DM_BANNED_KEYWORDS) {
        if (lower.includes(k)) return k;
    }
    return null;
}

function stats(values) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)); // SD mẫu
    return { n, min: Math.min(...values), max: Math.max(...values), mean, sd };
}

(async () => {
    const foods = JSON.parse(fs.readFileSync(FOOD_JSON, 'utf8'));
    const rulesCfg = JSON.parse(fs.readFileSync(GI_RULES, 'utf8'));
    console.log(`Đọc ${foods.length} bản ghi từ food_data.json`);

    const c = await getConn();

    // ---------- 1. UPSERT bảng foods ----------
    const rows = foods.map((f, i) => {
        const { gi, source } = resolveGi(f.TenThucPham, f.Carb_g, rulesCfg);
        const kw = matchContra(f.TenThucPham);
        return [
            `FCDB-${String(i + 1).padStart(4, '0')}`,
            f.TenThucPham,
            f.Kcal, f.Protid_g, f.Lipid_g, f.Carb_g,
            gi, classifyGi(gi, rulesCfg.gi_class_bounds), source,
            kw ? 1 : 0, kw, 'FCDB2017',
        ];
    });

    const SQL = `INSERT INTO foods
        (food_code, name, kcal_100g, protein_100g, lipid_100g, carb_100g,
         gi, gi_class, gi_source, is_contraindicated_dm, contra_keyword, source)
        VALUES ?
        ON DUPLICATE KEY UPDATE
         kcal_100g=VALUES(kcal_100g), protein_100g=VALUES(protein_100g),
         lipid_100g=VALUES(lipid_100g), carb_100g=VALUES(carb_100g),
         gi=VALUES(gi), gi_class=VALUES(gi_class), gi_source=VALUES(gi_source),
         is_contraindicated_dm=VALUES(is_contraindicated_dm), contra_keyword=VALUES(contra_keyword)`;

    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
        await c.query(SQL, [rows.slice(i, i + CHUNK)]);
        console.log(`  đã nạp ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
    }

    // ---------- 2. Báo cáo độ phủ GI ----------
    const [[cov]] = await c.query(`
        SELECT COUNT(*) AS total,
               SUM(gi IS NOT NULL) AS has_gi,
               SUM(gi_source='literature') AS lit,
               SUM(gi_source='category_proxy') AS proxy,
               SUM(gi_source='negligible_carb') AS negl,
               SUM(gi IS NULL) AS missing,
               SUM(is_contraindicated_dm=1) AS contra,
               SUM(gi_class='low' AND carb_100g >= 5) AS low_gi_carb_foods
        FROM foods`);
    console.log('\n--- Độ phủ GI (nguồn cho công thức 9) ---');
    console.table(cov);

    // ---------- 3. Tính lại Bảng I TỪ DỮ LIỆU ----------
    const metrics = [
        ['Năng lượng', 'Kcal/100g', 'Kcal', 'Dao động lớn giữa rau củ và nhóm dầu mỡ.'],
        ['Chất đạm', 'g/100g', 'Protid_g', 'Nguồn đạm phong phú từ cá nạc và gia cầm.'],
        ['Chất béo', 'g/100g', 'Lipid_g', 'Cần kiểm soát mỡ động vật cho người tim mạch.'],
        ['Chất bột đường', 'g/100g', 'Carb_g', 'Tập trung cao ở ngũ cốc chế biến và bánh kẹo.'],
    ];
    const computed = metrics.map(([label, unit, key, note]) => {
        const s = stats(foods.map(f => f[key]));
        return [label, unit, s.n, s.min, s.max, +s.mean.toFixed(2), +s.sd.toFixed(2), note, 'computed_from_db'];
    });
    computed.push(['Nhóm chống chỉ định ĐTĐ', 'số thực phẩm', cov.contra, null, null, null, null,
        'Bị chặn bởi Safety Guardrail Lớp 1 (khớp từ khoá cấm).', 'computed_from_db']);
    computed.push(['Thực phẩm GI thấp có bột đường', 'số thực phẩm', cov.low_gi_carb_foods, null, null, null, null,
        'GI ≤ 55 và carb ≥ 5g/100g — nhóm ưu tiên của RAG.', 'computed_from_db']);

    // Số đang in trong bản thảo, để đối chiếu trực tiếp bằng SQL
    const reported = [
        ['Năng lượng', 'Kcal/100g', 621, 0.0, 900.0, 182.70, 142.15, 'Dao động lớn giữa rau củ và nhóm dầu mỡ.', 'paper_reported'],
        ['Chất đạm', 'g/100g', 621, 0.0, 75.6, 9.20, 9.85, 'Nguồn đạm phong phú từ cá nạc và gia cầm.', 'paper_reported'],
        ['Chất béo', 'g/100g', 621, 0.0, 100.0, 7.79, 12.40, 'Cần kiểm soát mỡ động vật cho người tim mạch.', 'paper_reported'],
        ['Chất bột đường', 'g/100g', 621, 0.0, 99.3, 18.42, 22.18, 'Tập trung cao ở ngũ cốc chế biến và bánh kẹo.', 'paper_reported'],
        ['Nhóm chống chỉ định ĐTĐ', 'số thực phẩm', 31, null, null, null, null, 'Đường, kẹo, sữa đặc — chặn bởi Guardrail Lớp 1.', 'paper_reported'],
        ['Thực phẩm GI thấp có bột đường', 'số thực phẩm', 140, null, null, null, null, 'Gạo lứt, khoai lang, các loại đậu...', 'paper_reported'],
    ];

    await c.query(
        `INSERT INTO exp_food_stats (metric, unit, n_items, min_value, max_value, mean_value, sd_value, clinical_note, value_source)
         VALUES ? ON DUPLICATE KEY UPDATE
         unit=VALUES(unit), n_items=VALUES(n_items), min_value=VALUES(min_value), max_value=VALUES(max_value),
         mean_value=VALUES(mean_value), sd_value=VALUES(sd_value), clinical_note=VALUES(clinical_note)`,
        [[...computed, ...reported]]
    );

    // ---------- 4. In bảng đối chiếu ----------
    const [diff] = await c.query(`
        SELECT c.metric,
               c.mean_value AS mean_tinh_lai, p.mean_value AS mean_trong_bai,
               c.sd_value   AS sd_tinh_lai,   p.sd_value   AS sd_trong_bai,
               c.n_items    AS n_tinh_lai,    p.n_items    AS n_trong_bai
        FROM exp_food_stats c
        JOIN exp_food_stats p ON p.metric = c.metric AND p.value_source='paper_reported'
        WHERE c.value_source='computed_from_db'`);
    console.log('\n--- ĐỐI CHIẾU BẢNG I: tính lại từ CSDL vs số đang in ---');
    console.table(diff);

    await c.end();
    console.log('\nXong 02_seed_foods.js');
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
