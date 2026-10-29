// =====================================================================
//  Nutrition Calculator Agent — nguồn chân lý duy nhất cho công thức (1)-(10)
//  Bản hiện thực này phải KHỚP TỪNG CHỮ với các công thức in trong bài báo
//  và với Client/script.js: calculateMetrics().
// =====================================================================

const ADA = {
    LIPID_PCT: 0.25,        // L chiếm 25% TDEE
    KCAL_PER_G: { protein: 4, lipid: 9, carb: 4 },
    P_RATIO_LOW: 1.5,       // g/kg khi PAL <= 1.5
    P_RATIO_HIGH: 2.0,      // g/kg khi PAL > 1.5
    // Dải tuân thủ ADA 2026 dùng để chấm cột ada_compliant
    BAND: { protein: [15, 20], lipid: [20, 30], carb: [45, 60] },
    ENERGY_TOLERANCE_KCAL: 50,   // công thức (10)
};

const SEX_CONSTANT = { nam: 5, nu: -161 };

/** (1) BMI = W / (H/100)^2 */
function bmi(weightKg, heightCm) {
    const h = heightCm / 100;
    return +(weightKg / (h * h)).toFixed(1);
}

function bmiClass(v) {
    if (v < 18.5) return 'Thiếu cân';
    if (v < 25) return 'Bình thường';
    if (v < 30) return 'Tiền béo phì';
    return 'Béo phì';
}

/** (2) W_ideal = (H - 100) × 0.9 */
function idealWeight(heightCm) {
    return +((heightCm - 100) * 0.9).toFixed(1);
}

/** (3) BMR = 10W + 6.25H − 5·Age + S */
function bmr(weightKg, heightCm, age, gender) {
    const S = SEX_CONSTANT[String(gender).toLowerCase() === 'nam' ? 'nam' : 'nu'];
    return +((10 * weightKg) + (6.25 * heightCm) - (5 * age) + S).toFixed(2);
}

/** (4) TDEE = BMR × PAL */
function tdee(bmrValue, pal) {
    return Math.round(bmrValue * pal);
}

/** (5) P = W × pRatio — (6) L = TDEE×0.25/9 — (7) C = (TDEE − (4P + 9L))/4 */
function macros(weightKg, tdeeValue, pal) {
    const pRatio = pal > 1.5 ? ADA.P_RATIO_HIGH : ADA.P_RATIO_LOW;
    const protein = Math.round(weightKg * pRatio);
    const lipid = Math.round((tdeeValue * ADA.LIPID_PCT) / ADA.KCAL_PER_G.lipid);
    const carb = Math.round(
        (tdeeValue - (protein * ADA.KCAL_PER_G.protein + lipid * ADA.KCAL_PER_G.lipid)) / ADA.KCAL_PER_G.carb
    );
    return { pRatio, protein, lipid, carb };
}

/** Tính trọn bộ (1)-(7) + kiểm tra dải ADA. Trả về đúng cấu trúc bảng nutrition_targets. */
function computeTargets({ height_cm, weight_kg, age, gender, activity_pal }) {
    const h = Number(height_cm), w = Number(weight_kg), a = Number(age);
    const pal = Number(activity_pal);
    if (!h || !w || !a || !pal) {
        throw new Error('Thiếu height_cm / weight_kg / age / activity_pal — không đủ đầu vào cho công thức (1)-(7).');
    }

    const g = String(gender).toLowerCase() === 'nam' ? 'nam' : 'nu';
    const bmiV = bmi(w, h);
    const bmrV = bmr(w, h, a, g);
    const tdeeV = tdee(bmrV, pal);
    const { pRatio, protein, lipid, carb } = macros(w, tdeeV, pal);

    const pctP = +((protein * 4 / tdeeV) * 100).toFixed(1);
    const pctL = +((lipid * 9 / tdeeV) * 100).toFixed(1);
    const pctC = +((carb * 4 / tdeeV) * 100).toFixed(1);
    const inBand = (v, [lo, hi]) => v >= lo && v <= hi;

    return {
        height_cm: h, weight_kg: w, age: a, gender: g,
        sex_constant: SEX_CONSTANT[g],
        activity_pal: pal,
        p_ratio: pRatio,
        bmi: bmiV,
        bmi_class: bmiClass(bmiV),
        ideal_weight_kg: idealWeight(h),
        bmr_kcal: bmrV,
        tdee_kcal: tdeeV,
        target_protein_g: protein,
        target_lipid_g: lipid,
        target_carb_g: carb,
        pct_protein: pctP,
        pct_lipid: pctL,
        pct_carb: pctC,
        ada_compliant:
            inBand(pctP, ADA.BAND.protein) && inBand(pctL, ADA.BAND.lipid) && inBand(pctC, ADA.BAND.carb) ? 1 : 0,
        formula_version: 'MSJ-1990/ADA-2026',
    };
}

/** Quy đổi 1 món về khối lượng thực tế: ratio = grams / 100 */
function scaleFood(food, grams) {
    const r = grams / 100;
    const carb_g = +(food.carb_100g * r).toFixed(2);
    const gi = food.gi === null || food.gi === undefined ? null : Number(food.gi);
    return {
        grams,
        kcal: +(food.kcal_100g * r).toFixed(2),
        protein_g: +(food.protein_100g * r).toFixed(2),
        lipid_g: +(food.lipid_100g * r).toFixed(2),
        carb_g,
        gi,
        /** (9) thành phần GL của một món: GI_i × C_i / 100 */
        gl: gi === null ? null : +((gi * carb_g) / 100).toFixed(2),
    };
}

/** (9) GL(x) = Σ_i (GI_i × C_i / 100). Trả về null nếu còn món thiếu GI. */
function glTotal(items) {
    if (items.some(i => i.gl === null || i.gl === undefined)) return null;
    return +items.reduce((s, i) => s + i.gl, 0).toFixed(2);
}

function glRiskClass(gl) {
    if (gl === null) return null;
    if (gl <= 10) return 'low';
    if (gl < 20) return 'medium';
    return 'high';
}

/** (10) |E(x) − E_target| < 50 Kcal */
function energyCheck(kcalConsumed, tdeeTarget) {
    const gap = +Math.abs(kcalConsumed - tdeeTarget).toFixed(2);
    return { energy_gap_abs: gap, within_50kcal: gap < ADA.ENERGY_TOLERANCE_KCAL ? 1 : 0 };
}

/** Cộng dồn một ngày: đầu vào cho daily_nutrition_summary và vòng lặp khép kín. */
function summarizeDay(items, target) {
    const sum = (k) => +items.reduce((s, i) => s + Number(i[k] || 0), 0).toFixed(2);
    const kcal = sum('kcal');
    const gl = glTotal(items);
    return {
        kcal_consumed: kcal,
        protein_g: sum('protein_g'),
        lipid_g: sum('lipid_g'),
        carb_g: sum('carb_g'),
        gl_total: gl,
        gl_risk_class: glRiskClass(gl),
        kcal_remaining: +(target.tdee_kcal - kcal).toFixed(2),
        ...energyCheck(kcal, target.tdee_kcal),
    };
}

module.exports = {
    ADA, SEX_CONSTANT,
    bmi, bmiClass, idealWeight, bmr, tdee, macros,
    computeTargets, scaleFood, glTotal, glRiskClass, energyCheck, summarizeDay,
};
