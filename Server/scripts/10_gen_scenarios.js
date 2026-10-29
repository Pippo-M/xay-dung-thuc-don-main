// =====================================================================
//  Ý kiến phản biện PB1 #2 — Sinh 50 kịch bản lâm sàng tổng hợp
//
//  NGUYÊN TẮC TÁI LẬP: dùng bộ sinh số giả ngẫu nhiên mulberry32 với SEED CỐ ĐỊNH.
//  Bất kỳ ai chạy lại script này cũng nhận đúng 50 hồ sơ giống hệt — đây là điều
//  kiện để hội đồng kiểm chứng được kết quả.
//
//  Đây là SYNTHETIC CLINICAL VIGNETTES (hồ sơ tổng hợp), KHÔNG phải bệnh nhân thật.
//  Phân bố lấy đúng theo Báo cáo giải trình PB1 mục III.2.
//
//  Ground truth KHÔNG do LLM sinh: tính bằng nutrition_engine (công thức 3-7).
// =====================================================================
const fs = require('fs');
const path = require('path');
const { getConn } = require('./_db');
const engine = require('../nutrition_engine');

const SEED = 20260214;      // cố định — đổi seed là đổi toàn bộ 50 kịch bản
const N = 50;

// --- Bộ sinh giả ngẫu nhiên tất định ---------------------------------
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = mulberry32(SEED);
const between = (lo, hi) => lo + rnd() * (hi - lo);
function shuffled(arr) {                       // Fisher-Yates dùng chính rnd
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// --- Phân bố mục tiêu (Báo cáo giải trình PB1) ------------------------
const SPEC = {
    age: [32, 78],
    bmi: [16.8, 32.4],
    pal: [1.2, 1.375, 1.55, 1.725, 1.9],   // bài báo nêu dải 1.2-1.9
    female_ratio: 0.52,                     // 52% nữ / 48% nam
    height: { nam: [160, 178], nu: [148, 165] },
    comorbidity: {                          // tỷ lệ -> số ca chính xác trên N=50
        'Tăng huyết áp': 0.30,
        'Gút / axit uric cao': 0.20,
        'Bệnh thận mạn giai đoạn 1-2': 0.15,
        'Rối loạn lipid máu': 0.25,
    },
};

function buildScenarios() {
    // Giới tính: chốt số lượng chính xác rồi xáo, thay vì bốc từng ca (tránh lệch tỷ lệ)
    const nFemale = Math.round(N * SPEC.female_ratio);           // 26
    const genders = shuffled([...Array(nFemale).fill('nu'), ...Array(N - nFemale).fill('nam')]);

    // Tuổi và BMI: trải đều hết dải rồi thêm nhiễu nhỏ, sau đó xáo.
    // Cách này bảo đảm min/max ĐÚNG BẰNG con số công bố trong bài (32-78 và 16.8-32.4).
    const spread = (lo, hi, jitter) => shuffled(
        Array.from({ length: N }, (_, i) => {
            const base = lo + (hi - lo) * (i / (N - 1));
            const v = base + (i === 0 || i === N - 1 ? 0 : between(-jitter, jitter));
            return Math.min(hi, Math.max(lo, v));
        })
    );
    const ages = spread(SPEC.age[0], SPEC.age[1], 1.2).map(v => Math.round(v));
    const bmis = spread(SPEC.bmi[0], SPEC.bmi[1], 0.4).map(v => +v.toFixed(1));

    // Bệnh kèm: chốt số ca chính xác cho từng bệnh, cho phép đồng mắc nhiều bệnh.
    // Mọi kịch bản đều là ĐTĐ type 2 (đối tượng của nghiên cứu).
    const comorb = Array.from({ length: N }, () => []);
    for (const [name, ratio] of Object.entries(SPEC.comorbidity)) {
        const k = Math.round(N * ratio);
        shuffled([...Array(N).keys()]).slice(0, k).forEach(i => comorb[i].push(name));
    }

    const palPool = shuffled(
        Array.from({ length: N }, (_, i) => SPEC.pal[i % SPEC.pal.length])
    );

    return Array.from({ length: N }, (_, i) => {
        const gender = genders[i];
        const [hLo, hHi] = SPEC.height[gender];
        const height_cm = +between(hLo, hHi).toFixed(1);
        const bmi = bmis[i];
        // Suy cân nặng từ BMI mục tiêu: W = BMI × (H/100)²
        const weight_kg = +(bmi * (height_cm / 100) ** 2).toFixed(1);

        const s = {
            scenario_code: `SC-${String(i + 1).padStart(3, '0')}`,
            age: ages[i],
            gender,
            height_cm,
            weight_kg,
            activity_pal: palPool[i],
            comorbidities: ['Đái tháo đường type 2', ...comorb[i]].join('; '),
        };

        // ---- Ground truth: công thức (1)-(7), tất định, không qua LLM ----
        const gt = engine.computeTargets({
            height_cm: s.height_cm, weight_kg: s.weight_kg,
            age: s.age, gender: s.gender, activity_pal: s.activity_pal,
        });
        return {
            ...s,
            bmi: gt.bmi,                     // tính lại bằng engine, không dùng bmi mục tiêu
            sex_constant: gt.sex_constant,
            p_ratio: gt.p_ratio,
            gt_bmr_kcal: gt.bmr_kcal,
            gt_tdee_kcal: gt.tdee_kcal,
            gt_protein_g: gt.target_protein_g,
            gt_lipid_g: gt.target_lipid_g,
            gt_carb_g: gt.target_carb_g,
            gt_pct_protein: gt.pct_protein,
            gt_pct_lipid: gt.pct_lipid,
            gt_pct_carb: gt.pct_carb,
            gt_ada_compliant: gt.ada_compliant,
        };
    });
}

function describe(rows) {
    const num = k => rows.map(r => Number(r[k]));
    const mm = k => { const v = num(k); return `${Math.min(...v)} – ${Math.max(...v)}`; };
    const mean = k => (num(k).reduce((a, b) => a + b, 0) / rows.length).toFixed(1);

    console.log('\n═══ ĐẶC TÍNH 50 KỊCH BẢN (đưa vào mục IV.A của bài báo) ═══');
    console.log(`  Seed sinh mẫu           : ${SEED} (cố định — tái lập được)`);
    console.log(`  Tuổi                    : ${mm('age')}   (TB ${mean('age')})`);
    console.log(`  BMI (kg/m²)             : ${mm('bmi')}   (TB ${mean('bmi')})`);
    console.log(`  Chiều cao (cm)          : ${mm('height_cm')}`);
    console.log(`  Cân nặng (kg)           : ${mm('weight_kg')}`);
    console.log(`  TDEE ground truth (Kcal): ${mm('gt_tdee_kcal')}   (TB ${mean('gt_tdee_kcal')})`);

    const nu = rows.filter(r => r.gender === 'nu').length;
    console.log(`  Giới tính               : ${nu} nữ (${(nu / rows.length * 100).toFixed(0)}%) / ${rows.length - nu} nam`);

    console.log('\n  Mức vận động PAL:');
    for (const p of SPEC.pal) {
        const k = rows.filter(r => r.activity_pal === p).length;
        console.log(`    PAL ${p.toFixed(3)} : ${String(k).padStart(2)} ca (${(k / rows.length * 100).toFixed(0)}%)`);
    }

    console.log('\n  Bệnh lý đồng mắc (ngoài ĐTĐ type 2 — có ở cả 50 ca):');
    for (const name of Object.keys(SPEC.comorbidity)) {
        const k = rows.filter(r => r.comorbidities.includes(name)).length;
        console.log(`    ${name.padEnd(32)} ${String(k).padStart(2)} ca (${(k / rows.length * 100).toFixed(0)}%)`);
    }
    const none = rows.filter(r => r.comorbidities.split(';').length === 1).length;
    console.log(`    ${'Chỉ ĐTĐ đơn thuần'.padEnd(32)} ${String(none).padStart(2)} ca`);

    // ---- Báo cáo trung thực: ground truth tự lệch dải ADA ở đâu ----
    const bad = rows.filter(r => !r.gt_ada_compliant);
    console.log(`\n  ⚠ Ground truth VƯỢT dải ADA 15-20% protein: ${bad.length}/${rows.length} ca ` +
        `(${(bad.length / rows.length * 100).toFixed(0)}%)`);
    if (bad.length) {
        const pcts = bad.map(r => Number(r.gt_pct_protein));
        console.log(`    Tỷ lệ protein ở các ca này: ${Math.min(...pcts).toFixed(1)}% – ${Math.max(...pcts).toFixed(1)}% TDEE`);
        console.log(`    Nguyên nhân: pRatio = 2.0 g/kg khi PAL > 1.5 (công thức 5). Đã thống nhất`);
        console.log(`    GIỮ NGUYÊN công thức và báo cáo con số này như một hạn chế của nghiên cứu.`);
    }
}

(async () => {
    const rows = buildScenarios();
    describe(rows);

    // ---- Xuất CSV để nộp kèm bản thảo ----
    const outDir = path.join(__dirname, '..', '..', 'docs', 'exp_data');
    fs.mkdirSync(outDir, { recursive: true });
    const cols = ['scenario_code', 'age', 'gender', 'height_cm', 'weight_kg', 'bmi', 'activity_pal',
        'comorbidities', 'sex_constant', 'p_ratio', 'gt_bmr_kcal', 'gt_tdee_kcal',
        'gt_protein_g', 'gt_lipid_g', 'gt_carb_g', 'gt_pct_protein', 'gt_pct_lipid',
        'gt_pct_carb', 'gt_ada_compliant'];
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => {
        const v = r[c];
        return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
    }).join(','))].join('\n');
    const csvPath = path.join(outDir, '50_kich_ban_lam_sang.csv');
    fs.writeFileSync(csvPath, '﻿' + csv, 'utf8');   // BOM để Excel đọc đúng tiếng Việt
    console.log(`\n  Đã xuất CSV: ${csvPath}`);

    // ---- Ghi vào TiDB ----
    const c = await getConn();
    const values = rows.map(r => [
        r.scenario_code, r.age, r.gender, r.height_cm, r.weight_kg, r.bmi, r.activity_pal,
        r.comorbidities, r.gt_bmr_kcal, r.gt_tdee_kcal, r.gt_protein_g, r.gt_lipid_g, r.gt_carb_g,
        'MSJ-1990/ADA-2026/FCDB-2017', r.gt_pct_protein, r.gt_pct_lipid, r.gt_pct_carb,
        r.gt_ada_compliant, SEED, r.sex_constant, r.p_ratio,
    ]);
    const [res] = await c.query(
        `INSERT INTO exp_scenarios
         (scenario_code, age, gender, height_cm, weight_kg, bmi, activity_pal, comorbidities,
          gt_bmr_kcal, gt_tdee_kcal, gt_protein_g, gt_lipid_g, gt_carb_g, gt_source,
          gt_pct_protein, gt_pct_lipid, gt_pct_carb, gt_ada_compliant, rng_seed, sex_constant, p_ratio)
         VALUES ? ON DUPLICATE KEY UPDATE
          age=VALUES(age), gender=VALUES(gender), height_cm=VALUES(height_cm), weight_kg=VALUES(weight_kg),
          bmi=VALUES(bmi), activity_pal=VALUES(activity_pal), comorbidities=VALUES(comorbidities),
          gt_bmr_kcal=VALUES(gt_bmr_kcal), gt_tdee_kcal=VALUES(gt_tdee_kcal),
          gt_protein_g=VALUES(gt_protein_g), gt_lipid_g=VALUES(gt_lipid_g), gt_carb_g=VALUES(gt_carb_g),
          gt_pct_protein=VALUES(gt_pct_protein), gt_pct_lipid=VALUES(gt_pct_lipid),
          gt_pct_carb=VALUES(gt_pct_carb), gt_ada_compliant=VALUES(gt_ada_compliant),
          rng_seed=VALUES(rng_seed), sex_constant=VALUES(sex_constant), p_ratio=VALUES(p_ratio)`,
        [values]
    );
    console.log(`  Đã ghi exp_scenarios: ${res.affectedRows} dòng`);

    console.log('\n  5 kịch bản đầu:');
    const [sample] = await c.query(
        `SELECT scenario_code, age, gender, height_cm, weight_kg, bmi, activity_pal,
                gt_tdee_kcal, gt_protein_g, gt_lipid_g, gt_carb_g, gt_ada_compliant
         FROM exp_scenarios ORDER BY scenario_code LIMIT 5`);
    console.table(sample);

    await c.end();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
