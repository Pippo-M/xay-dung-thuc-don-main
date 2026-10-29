// Kiểm thử offline (KHÔNG chạm CSDL): xác nhận nutrition_engine.js cho ra
// đúng cùng con số với Client/script.js: calculateMetrics(), và với công thức in trong bài báo.
const e = require('../nutrition_engine');

let pass = 0, fail = 0;
function eq(label, got, want, tol = 0.01) {
    const ok = Math.abs(Number(got) - Number(want)) <= tol;
    console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(52)} got=${got}  want=${want}`);
    ok ? pass++ : fail++;
}

// ---- Ca A: Nam 45 tuổi, 170cm, 75kg, PAL 1.55 (vận động vừa) ----
console.log('\nCa A — Nam, 45t, 170cm, 75kg, PAL=1.55');
const A = e.computeTargets({ height_cm: 170, weight_kg: 75, age: 45, gender: 'nam', activity_pal: 1.55 });

// (1) BMI = 75 / 1.7^2 = 25.95 -> 26.0
eq('(1) BMI', A.bmi, 26.0);
// (2) (170-100)*0.9 = 63.0
eq('(2) W_ideal', A.ideal_weight_kg, 63.0);
// (3) 10*75 + 6.25*170 - 5*45 + 5 = 750 + 1062.5 - 225 + 5 = 1592.5
eq('(3) BMR', A.bmr_kcal, 1592.5);
// (4) 1592.5 * 1.55 = 2468.375 -> 2468
eq('(4) TDEE', A.tdee_kcal, 2468);
// (5) PAL 1.55 > 1.5 -> pRatio 2.0 -> P = 150
eq('(5) pRatio', A.p_ratio, 2.0);
eq('(5) P (g)', A.target_protein_g, 150);
// (6) L = 2468*0.25/9 = 68.56 -> 69
eq('(6) L (g)', A.target_lipid_g, 69);
// (7) C = (2468 - (150*4 + 69*9))/4 = (2468 - 1221)/4 = 311.75 -> 312
eq('(7) C (g)', A.target_carb_g, 312);
console.log(`     tỷ lệ ADA: P ${A.pct_protein}% | L ${A.pct_lipid}% | C ${A.pct_carb}% -> ada_compliant=${A.ada_compliant}`);

// ---- Ca B: Nữ 60 tuổi, 155cm, 58kg, PAL 1.2 (ít vận động) ----
console.log('\nCa B — Nữ, 60t, 155cm, 58kg, PAL=1.2');
const B = e.computeTargets({ height_cm: 155, weight_kg: 58, age: 60, gender: 'nu', activity_pal: 1.2 });
eq('(1) BMI', B.bmi, 24.1);                       // 58/1.55^2 = 24.14
eq('(2) W_ideal', B.ideal_weight_kg, 49.5);
eq('(3) BMR (S = -161)', B.bmr_kcal, 1087.75);   // 580 + 968.75 - 300 - 161
eq('(4) TDEE', B.tdee_kcal, 1305);                // 1087.75*1.2 = 1305.3 -> 1305
eq('(5) pRatio (PAL<=1.5)', B.p_ratio, 1.5);
eq('(5) P (g)', B.target_protein_g, 87);
eq('(6) L (g)', B.target_lipid_g, 36);            // 1305*0.25/9 = 36.25
eq('(7) C (g)', B.target_carb_g, 158);            // (1305 - (348+324))/4 = 158.25 -> 158

// ---- Công thức (9): GL = Σ (GI_i × C_i / 100) ----
console.log('\nCông thức (9) — GL của một bữa');
// Xôi nếp 200g: carb 75.1/100g, GI 86  => C_i = 150.2 ; GL = 86*150.2/100 = 129.17
const xoi = e.scaleFood({ kcal_100g: 348.3, protein_100g: 8.6, lipid_100g: 1.5, carb_100g: 75.1, gi: 86 }, 200);
eq('GL xôi nếp 200g', xoi.gl, 129.17);
// Gạo lứt 200g: carb 76.2, GI 68 => 68*152.4/100 = 103.63
const lut = e.scaleFood({ kcal_100g: 358.8, protein_100g: 7.5, lipid_100g: 2.7, carb_100g: 76.2, gi: 68 }, 200);
eq('GL gạo lứt 200g', lut.gl, 103.63);
eq('Mức giảm GL khi thay xôi -> gạo lứt (%)', ((xoi.gl - lut.gl) / xoi.gl) * 100, 19.77, 0.05);

// Món gần như không có bột đường -> GL = 0
const uc_ga = e.scaleFood({ kcal_100g: 165, protein_100g: 31, lipid_100g: 3.6, carb_100g: 0, gi: 0 }, 150);
eq('GL ức gà 150g', uc_ga.gl, 0);

// Món thiếu GI -> GL null, và GL cả bữa cũng phải là null (không được cộng thiếu)
const unknown = e.scaleFood({ kcal_100g: 120, protein_100g: 2, lipid_100g: 1, carb_100g: 25, gi: null }, 100);
console.log(`  ${unknown.gl === null ? '✓' : '✗'} Món thiếu GI -> gl = null (không âm thầm coi là 0)`);
unknown.gl === null ? pass++ : fail++;
console.log(`  ${e.glTotal([xoi, unknown]) === null ? '✓' : '✗'} GL cả bữa = null khi còn món thiếu GI`);
e.glTotal([xoi, unknown]) === null ? pass++ : fail++;

// ---- Công thức (10): |E(x') - E_target| < 50 Kcal ----
console.log('\nCông thức (10) — ràng buộc sai số năng lượng');
eq('gap khi ăn 2440 / mục tiêu 2468', e.energyCheck(2440, 2468).energy_gap_abs, 28);
console.log(`  ${e.energyCheck(2440, 2468).within_50kcal === 1 ? '✓' : '✗'} 28 Kcal -> ĐẠT (within_50kcal = 1)`);
e.energyCheck(2440, 2468).within_50kcal === 1 ? pass++ : fail++;
console.log(`  ${e.energyCheck(2300, 2468).within_50kcal === 0 ? '✓' : '✗'} 168 Kcal -> KHÔNG ĐẠT (within_50kcal = 0)`);
e.energyCheck(2300, 2468).within_50kcal === 0 ? pass++ : fail++;

console.log(`\n${'─'.repeat(64)}\nKẾT QUẢ: ${pass} đạt, ${fail} lỗi`);
process.exit(fail ? 1 : 0);
