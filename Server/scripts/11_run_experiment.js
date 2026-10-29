// =====================================================================
//  Ý kiến phản biện PB1 #2 — Chạy thực nghiệm 2 nhánh, N lần lặp
//
//  Cách dùng:
//     node scripts/11_run_experiment.js --limit 5            # chạy thử 5 kịch bản (50 lượt gọi)
//     node scripts/11_run_experiment.js --limit 5 --runs 3   # chạy thử nhanh hơn
//     node scripts/11_run_experiment.js                      # chạy đủ 50 kịch bản (500 lượt gọi)
//     node scripts/11_run_experiment.js --dry-run            # in prompt, KHÔNG gọi API
//
//  BIẾN ĐỘC LẬP DUY NHẤT giữa 2 nhánh là LƯỢNG THÔNG TIN đưa vào prompt:
//     baseline : chỉ có hồ sơ bệnh nhân dạng văn xuôi. Không TDEE, không ngân sách
//                P-L-C, không danh mục FCDB, không luật an toàn.
//     nutriai  : + ngân sách từ động cơ sinh trắc (công thức 4-7)
//                + danh mục thực phẩm FCDB (RAG)
//                + danh sách thực phẩm chống chỉ định (Guardrail Lớp 1)
//  Định dạng đầu ra (JSON) GIỮ NGUYÊN ở cả hai nhánh, để chênh lệch đo được là do
//  thông tin chứ không phải do một nhánh dễ bóc tách hơn nhánh kia.
//
//  Tham số sinh cố định cho cả hai: temperature = 0.1, top_p = 0.9, max_tokens = 2000.
// =====================================================================
const { getConn } = require('./_db');

const args = process.argv.slice(2);
const argVal = (name, def) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const LIMIT = parseInt(argVal('--limit', '0')) || 0;     // 0 = tất cả
const RUNS = parseInt(argVal('--runs', '3'));   // 3 lần lặp/kịch bản — đủ cho Mean±SD, vừa hạn mức token/ngày
const DRY = args.includes('--dry-run');
const BATCH = LIMIT ? 'pilot' : 'full';

// LƯU Ý cấu hình sinh — khác với con số ghi trong bản thảo, và phải sửa lại bản thảo:
//  - gpt-oss-120b là MODEL SUY LUẬN. Với max_tokens = 2000 như bài báo ghi, toàn bộ
//    ngân sách token chảy vào kênh `reasoning` và `content` trả về RỖNG (đã kiểm chứng:
//    20/20 lượt chạy thử đều rỗng, tokens_out = 2000). Bắt buộc đặt reasoning_effort = 'low'.
//  - response_format json_object để bảo đảm đầu ra bóc tách được ở CẢ HAI nhánh.
const GEN = {
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: parseInt(argVal('--max-tokens', '1400')),
    reasoning_effort: argVal('--reasoning', 'low'),
};
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const API = 'https://api.groq.com/openai/v1/chat/completions';

// Gói cước Groq on-demand giới hạn 8000 token/phút. Phải tự điều tiết nhịp gọi,
// nếu không quá nửa số lượt sẽ bị từ chối (đã gặp: 30/50 lượt thất bại khi chạy thử).
const TPM_LIMIT = parseInt(argVal('--tpm', '8000'));
const tokenLog = [];                    // [{t, tokens}] trong 60 giây gần nhất
function recordTokens(n) { tokenLog.push({ t: Date.now(), tokens: n }); }
async function paceFor(estTokens) {
    for (;;) {
        const cutoff = Date.now() - 60_000;
        while (tokenLog.length && tokenLog[0].t < cutoff) tokenLog.shift();
        const used = tokenLog.reduce((s, x) => s + x.tokens, 0);
        if (used + estTokens <= TPM_LIMIT * 0.92) return;      // chừa 8% biên an toàn
        const waitMs = Math.max(1000, tokenLog[0].t + 60_000 - Date.now() + 500);
        process.stdout.write(`\r    …chờ ${(waitMs / 1000).toFixed(0)}s cho hạn mức token/phút   `);
        await new Promise(z => setTimeout(z, waitMs));
    }
}

// Ngưỡng coi là "tuân thủ" một chỉ tiêu đa lượng: lệch <= 10% so với ground truth
const MACRO_TOLERANCE = 0.10;

// ---------------------------------------------------------------- prompts
// Mỗi dòng phải là MỘT NGUYÊN LIỆU ĐƠN, không phải tên món tổng hợp.
// Bảng thành phần thực phẩm chỉ có nguyên liệu đơn; nếu LLM trả "Phở gà (súp gà,
// bánh phở nguyên cám)" thì không tra ngược được giá trị dinh dưỡng thật.
const OUTPUT_SPEC = `
QUY TẮC ĐẦU RA
- Mỗi phần tử là MỘT NGUYÊN LIỆU ĐƠN đã cân theo gam (ví dụ "Bánh phở", "Thịt gà ta",
  "Rau muống"), KHÔNG ghi tên món tổng hợp như "Phở gà" hay "Gỏi cuốn tôm".
- Dùng tên nguyên liệu ngắn gọn, đúng như cách gọi trong bảng thành phần thực phẩm Việt Nam.
- Trường "mon" ghi tên món mà nguyên liệu đó thuộc về.
- Mỗi bữa khoảng 3-5 nguyên liệu. Tổng cả ngày không quá 15 nguyên liệu.

Chỉ trả về MỘT đối tượng JSON hợp lệ, không markdown, không giải thích:
{"bua_an":[{"bua":"sang","mon":"Phở gà","nguyen_lieu":"Bánh phở","gram":180,"kcal":254,"protein_g":5.8,"lipid_g":0,"carb_g":57.8}],
 "tong":{"kcal":0,"protein_g":0,"lipid_g":0,"carb_g":0}}`;

function baselinePrompt(s) {
    // Nhánh đối chứng: LLM tự do. KHÔNG cho biết TDEE, ngân sách đa lượng hay danh mục FCDB.
    return `Hãy lập thực đơn 3 bữa (sáng, trưa, tối) cho một ngày, dùng món ăn Việt Nam, cho bệnh nhân sau:
- Giới tính: ${s.gender === 'nam' ? 'Nam' : 'Nữ'}, ${s.age} tuổi
- Chiều cao ${s.height_cm} cm, cân nặng ${s.weight_kg} kg
- Bệnh lý: ${s.comorbidities}
- Mức vận động: PAL ${s.activity_pal}
${OUTPUT_SPEC}`;
}

function nutriaiPrompt(s, foodList, banned) {
    // Nhánh hệ thống: có ngân sách từ động cơ sinh trắc + RAG FCDB + luật an toàn.
    return `Bạn là NutriAI, chuyên gia dinh dưỡng lâm sàng.

HỒ SƠ BỆNH NHÂN
- Giới tính: ${s.gender === 'nam' ? 'Nam' : 'Nữ'}, ${s.age} tuổi
- Chiều cao ${s.height_cm} cm, cân nặng ${s.weight_kg} kg, BMI ${s.bmi}
- Bệnh lý: ${s.comorbidities}

NGÂN SÁCH DINH DƯỠNG BẮT BUỘC (đã tính sẵn bằng Mifflin-St Jeor và chuẩn ADA 2026):
- Tổng năng lượng cả ngày: ${s.gt_tdee_kcal} Kcal (sai lệch cho phép dưới 50 Kcal)
- Protein: ${s.gt_protein_g} g | Lipid: ${s.gt_lipid_g} g | Carbohydrate: ${s.gt_carb_g} g
Tổng của thực đơn phải bám sát các con số trên.

DANH MỤC THỰC PHẨM CHUẨN (Bảng Thành phần Thực phẩm Việt Nam).
Định dạng mỗi dòng: tên|kcal|protein_g|lipid_g|carb_g (trị số trên 100g). Ưu tiên chọn trong danh mục này:
${foodList}

CẤM TUYỆT ĐỐI: ${banned}.
Ưu tiên thực phẩm chỉ số đường huyết GI thấp, giàu chất xơ.
${OUTPUT_SPEC}`;
}

// ---------------------------------------------------------------- đối chiếu tên món với FCDB
function norm(s) {
    return String(s).toLowerCase()
        .replace(/[()\[\]{},.;:!?"'`]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}
function tokens(s) { return new Set(norm(s).split(' ').filter(w => w.length > 1)); }
function jaccard(a, b) {
    const inter = [...a].filter(x => b.has(x)).length;
    return inter / (a.size + b.size - inter);
}

function buildMatcher(foods) {
    // Bỏ phần trong ngoặc của tên FCDB khi đối chiếu: "Đậu xanh (đậu tắt)" -> "đậu xanh"
    const index = foods.map(f => {
        const short = norm(String(f.name).replace(/\([^)]*\)/g, ''));
        return { f, n: norm(f.name), short, t: tokens(short || f.name) };
    });
    const exact = new Map();
    for (const x of index) {
        if (!exact.has(x.n)) exact.set(x.n, x.f);
        if (x.short && !exact.has(x.short)) exact.set(x.short, x.f);
    }
    const MIN_LEN = 4;   // tránh "kê", "lê", "na" khớp bừa vào mọi câu

    return function match(name) {
        const n = norm(name);
        if (!n) return null;
        if (exact.has(n)) return { food: exact.get(n), how: 'exact', score: 1 };

        // Tên FCDB nằm trong tên nguyên liệu, hoặc ngược lại.
        // Chọn chuỗi khớp DÀI NHẤT — "bánh phở" thắng "phở", "gạo lứt" thắng "gạo".
        let best = null;
        for (const x of index) {
            for (const cand of [x.short, x.n]) {
                if (!cand || cand.length < MIN_LEN) continue;
                if (n.includes(cand) || (n.length >= MIN_LEN && cand.includes(n))) {
                    const score = cand.length / Math.max(cand.length, n.length);
                    const len = Math.min(cand.length, n.length);
                    if (!best || len > best.len) best = { food: x.f, how: 'substring', score, len };
                }
            }
        }
        if (best) return { food: best.food, how: best.how, score: best.score };

        // Cuối cùng mới xét trùng từ khoá
        const t = tokens(name);
        let byTok = null;
        for (const x of index) {
            const score = jaccard(t, x.t);
            if (!byTok || score > byTok.score) byTok = { food: x.f, how: 'token', score };
        }
        return byTok && byTok.score >= 0.5 ? byTok : null;
    };
}

// ---------------------------------------------------------------- gọi Groq
async function callGroq(prompt, key) {
    // Ước lượng thô: ~1 token / 3 ký tự tiếng Việt, cộng ngân sách đầu ra
    const estTokens = Math.ceil(prompt.length / 3) + GEN.max_tokens;
    await paceFor(estTokens);

    const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: GEN.temperature,
            top_p: GEN.top_p,
            max_tokens: GEN.max_tokens,
            reasoning_effort: GEN.reasoning_effort,
            response_format: { type: 'json_object' },
        }),
    });
    const data = await res.json();

    if (!res.ok) {
        const msg = data.error?.message || `HTTP ${res.status}`;
        // Groq nói rõ phải chờ bao lâu — tôn trọng đúng con số đó thay vì lùi mù
        // Hết hạn mức TOKEN/NGÀY thì chờ cũng vô ích — dừng hẳn để không đốt thêm lượt gọi.
        if (/tokens per day \(TPD\)/i.test(msg)) {
            const e = new Error(msg); e.quotaExhausted = true; throw e;
        }
        const m = /try again in ([\d.]+)\s*(ms|s)/i.exec(msg);
        if (m) {
            const ms = m[2].toLowerCase() === 'ms' ? Number(m[1]) : Number(m[1]) * 1000;
            recordTokens(estTokens);   // coi như đã tiêu, để nhịp sau tự giãn ra
            const e = new Error(msg); e.retryAfterMs = ms + 800; throw e;
        }
        throw new Error(msg);
    }

    recordTokens(data.usage?.total_tokens ?? estTokens);
    const msg = data.choices[0].message;
    return {
        // Model suy luận có thể để trống content; giữ lại reasoning để còn chẩn đoán
        content: msg.content || '',
        reasoning: msg.reasoning || '',
        tokens_out: data.usage?.completion_tokens ?? null,
    };
}

function parseMenu(raw) {
    let s = String(raw).trim();
    if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b < 0) throw new Error('không tìm thấy khối JSON');
    const obj = JSON.parse(s.slice(a, b + 1));
    if (!Array.isArray(obj.bua_an)) throw new Error('thiếu mảng bua_an');
    return obj;
}

// ---------------------------------------------------------------- một lượt chạy
async function runOne(scenario, arm, runIndex, ctx) {
    const prompt = arm === 'baseline'
        ? baselinePrompt(scenario)
        : nutriaiPrompt(scenario, ctx.foodList, ctx.banned);

    if (DRY) { console.log(`\n----- ${scenario.scenario_code} / ${arm} -----\n${prompt}\n`); return null; }

    const t0 = Date.now();
    const { content, reasoning, tokens_out } = await callGroq(prompt, ctx.key);
    const latency_ms = Date.now() - t0;

    const base = {
        scenario_id: scenario.id, arm, run_index: runIndex,
        model: MODEL, temperature: GEN.temperature, latency_ms, tokens_out,
        raw_response: content || `[content rỗng — kênh reasoning]\n${reasoning}`,
    };

    let menu;
    try { menu = parseMenu(content || reasoning); }
    catch (e) {
        const why = content ? e.message : 'content rỗng (toàn bộ token vào kênh reasoning)';
        return { ...base, parse_ok: 0, parse_note: `Lỗi bóc tách: ${why}` };
    }

    // ---- Hai cách đo song song ----
    let srK = 0, srP = 0, srL = 0, srC = 0;          // LLM tự khai
    let fK = 0, fP = 0, fL = 0, fC = 0;              // tra lại FCDB
    let matched = 0, contra = 0;
    const items = [];

    for (const it of menu.bua_an) {
        const gram = Number(it.gram) || 0;
        srK += Number(it.kcal) || 0;
        srP += Number(it.protein_g) || 0;
        srL += Number(it.lipid_g) || 0;
        srC += Number(it.carb_g) || 0;

        const ten = it.nguyen_lieu || it.mon || '';
        const m = ctx.match(ten);
        if (m) {
            matched++;
            const r = gram / 100;
            fK += m.food.kcal_100g * r;
            fP += m.food.protein_100g * r;
            fL += m.food.lipid_100g * r;
            fC += m.food.carb_100g * r;
            if (m.food.is_contraindicated_dm) contra++;
        }
        items.push({
            mon: it.mon, nguyen_lieu: it.nguyen_lieu, bua: it.bua, gram,
            llm: { kcal: Number(it.kcal) || 0, p: Number(it.protein_g) || 0, l: Number(it.lipid_g) || 0, c: Number(it.carb_g) || 0 },
            fcdb: m ? { ten: m.food.name, how: m.how, score: +m.score.toFixed(2), kcal_100g: m.food.kcal_100g } : null,
        });
    }

    const n = menu.bua_an.length;
    const matchRate = n ? (matched / n) * 100 : 0;
    // Nếu khớp được dưới nửa số món thì con số FCDB không đại diện -> quy về LLM tự khai
    const useFcdb = matchRate >= 50;
    const predK = useFcdb ? fK : srK;
    const predP = useFcdb ? fP : srP;
    const predL = useFcdb ? fL : srL;
    const predC = useFcdb ? fC : srC;

    const gt = scenario;
    const within = (pred, target) => Math.abs(pred - target) <= target * MACRO_TOLERANCE ? 1 : 0;

    return {
        ...base,
        parse_ok: 1,
        parse_note: useFcdb ? null : `Chỉ khớp ${matchRate.toFixed(0)}% tên món — dùng số LLM tự khai`,
        pred_kcal: +predK.toFixed(2),
        pred_protein_g: +predP.toFixed(2),
        pred_lipid_g: +predL.toFixed(2),
        pred_carb_g: +predC.toFixed(2),
        pred_kcal_selfreport: +srK.toFixed(2),
        pred_kcal_fcdb: +fK.toFixed(2),
        err_kcal: +Math.abs(predK - gt.gt_tdee_kcal).toFixed(2),
        err_protein_g: +Math.abs(predP - gt.gt_protein_g).toFixed(2),
        err_lipid_g: +Math.abs(predL - gt.gt_lipid_g).toFixed(2),
        err_carb_g: +Math.abs(predC - gt.gt_carb_g).toFixed(2),
        err_kcal_selfreport: +Math.abs(srK - gt.gt_tdee_kcal).toFixed(2),
        err_kcal_fcdb: +Math.abs(fK - gt.gt_tdee_kcal).toFixed(2),
        selfreport_bias: +(srK - fK).toFixed(2),
        ada_compliant: within(predP, gt.gt_protein_g) && within(predL, gt.gt_lipid_g) && within(predC, gt.gt_carb_g) ? 1 : 0,
        n_items: n,
        n_items_matched: matched,
        match_rate_pct: +matchRate.toFixed(2),
        contraindicated_hits: contra,
        items_json: JSON.stringify(items),
    };
}

// ---------------------------------------------------------------- main
(async () => {
    const key = process.env.GROQ_API_KEY;
    if (!key && !DRY) throw new Error('Thiếu GROQ_API_KEY trong Server/.env');

    const c = await getConn();
    const [scenarios] = await c.query(
        `SELECT * FROM exp_scenarios ORDER BY scenario_code ${LIMIT ? `LIMIT ${LIMIT}` : ''}`);
    if (!scenarios.length) throw new Error('exp_scenarios trống — chạy 10_gen_scenarios.js trước.');

    const [foods] = await c.query('SELECT id, name, kcal_100g, protein_100g, lipid_100g, carb_100g, gi, gi_class, is_contraindicated_dm FROM foods');
    const [[exp]] = await c.query(`SELECT id FROM exp_experiments WHERE code='EXP-NUTRI-ERR'`);

    // Danh mục RAG phải CÂN ĐỐI theo nhóm món, nếu chỉ sắp theo GI thì rau quả
    // (carb ~ 0 nên GI = 0) chiếm hết chỗ, thực đơn sinh ra sẽ không có cơm/thịt/cá.
    // Ngoài nhóm chống chỉ định, loại thêm đồ uống có cồn và nhóm sên đường
    // (mứt, ô mai, siro) — không phải nguyên liệu nấu bữa chính cho người ĐTĐ.
    const NOT_INGREDIENT = /rượu|bia|mứt|ô mai|siro|nước ngọt/i;
    const safe = foods.filter(f => !f.is_contraindicated_dm && !NOT_INGREDIENT.test(f.name));
    const byGi = (a, b) => (a.gi ?? 999) - (b.gi ?? 999);
    // Số món trong danh mục bị khống chế bởi hạn mức 8000 token/phút của Groq:
    // danh mục càng dài thì càng ít lượt gọi lọt qua mỗi phút.
    const RAG_N = parseInt(argVal('--rag', '45'));
    const tinhBot = safe.filter(f => f.carb_100g >= 20).sort(byGi).slice(0, Math.round(RAG_N * 0.3));
    const dam = safe.filter(f => f.protein_100g >= 12 && f.carb_100g < 20)
        .sort((a, b) => a.lipid_100g - b.lipid_100g).slice(0, Math.round(RAG_N * 0.4));
    const rauQua = safe.filter(f => f.carb_100g < 20 && f.protein_100g < 12 && f.kcal_100g > 5)
        .sort(byGi).slice(0, Math.round(RAG_N * 0.3));
    const ragFoods = [...new Map([...tinhBot, ...dam, ...rauQua].map(f => [f.id, f])).values()];
    console.log(`Danh mục RAG: ${ragFoods.length} món (${tinhBot.length} tinh bột, ${dam.length} đạm, ${rauQua.length} rau quả)`);

    const r0 = n => Math.round(n);   // bỏ phần thập phân để tiết kiệm token
    const ctx = {
        key,
        match: buildMatcher(foods),
        foodList: ragFoods.map(f => `${f.name}|${r0(f.kcal_100g)}|${r0(f.protein_100g)}|${r0(f.lipid_100g)}|${r0(f.carb_100g)}`).join('\n'),
        // Nêu NHÓM cấm thay vì liệt kê đủ 31 tên — tiết kiệm ~300 token mỗi lượt gọi
        // mà vẫn giữ nguyên nội dung luật của Guardrail Lớp 1.
        banned: 'đường các loại, kẹo, mứt, chè ngọt, mật ong, sữa đặc có đường, '
              + 'nước ngọt, bánh mì trắng, quả ngâm nước đường',
    };

    const total = scenarios.length * 2 * RUNS;
    console.log(`Mẻ chạy: ${BATCH} | ${scenarios.length} kịch bản × 2 nhánh × ${RUNS} lần = ${total} lượt gọi`);
    console.log(`Model: ${MODEL} | temperature ${GEN.temperature} | top_p ${GEN.top_p} | max_tokens ${GEN.max_tokens}\n`);

    let done = 0, failed = 0, quotaOut = false;
    const t0 = Date.now();
    outer:
    for (const s of scenarios) {
        for (const arm of ['baseline', 'nutriai']) {
            for (let r = 1; r <= RUNS; r++) {
                if (quotaOut) break outer;
                let row = null, lastErr = null;
                for (let attempt = 1; attempt <= 4; attempt++) {
                    try { row = await runOne(s, arm, r, ctx); break; }
                    catch (e) {
                        lastErr = e;
                        if (e.quotaExhausted) break;
                        if (attempt === 4) break;
                        // Chờ đúng khoảng thời gian Groq yêu cầu, thay vì lùi mù
                        const wait = e.retryAfterMs || 2000 * attempt;
                        process.stdout.write(`\r    …hạn mức, chờ ${(wait / 1000).toFixed(1)}s rồi thử lại   `);
                        await new Promise(z => setTimeout(z, wait));
                    }
                }
                if (DRY) continue;
                if (!row) {
                    failed++;
                    console.log(`  ✗ ${s.scenario_code} ${arm} #${r}: ${lastErr.message}`);
                    if (lastErr.quotaExhausted) {
                        console.log(`
  ĐÃ HẾT HẠN MỨC TOKEN/NGÀY CỦA GROQ. Dừng mẻ chạy tại đây.`);
                        console.log(`  Dữ liệu đã ghi vẫn còn trong exp_runs. Chạy lại lệnh này vào ngày mai`);
                        console.log(`  (hoặc sau khi nâng gói) — các lượt đã có sẽ được ghi đè, không bị trùng.`);
                        quotaOut = true;
                    }
                    continue;
                }

                const cols = Object.keys(row).filter(k => row[k] !== undefined);
                await c.query(
                    `INSERT INTO exp_runs (experiment_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})
                     ON DUPLICATE KEY UPDATE ${cols.filter(k => !['scenario_id', 'arm', 'run_index'].includes(k)).map(k => `${k}=VALUES(${k})`).join(', ')}`,
                    [exp ? exp.id : null, ...cols.map(k => row[k])]
                );
                done++;
                const tag = row.parse_ok
                    ? `err_kcal=${String(row.err_kcal).padStart(7)}  khớp ${String(row.match_rate_pct).padStart(5)}%  cấm=${row.contraindicated_hits}`
                    : `BÓC TÁCH LỖI: ${row.parse_note}`;
                console.log(`  ${String(done).padStart(3)}/${total} ${s.scenario_code} ${arm.padEnd(8)} #${r}  ${tag}`);
            }
        }
    }

    if (!DRY) {
        console.log(`\nHoàn tất trong ${((Date.now() - t0) / 1000 / 60).toFixed(1)} phút. Thành công ${done}, thất bại ${failed}.`);
        const [[q]] = await c.query(`
            SELECT COUNT(*) n, SUM(parse_ok) ok, AVG(match_rate_pct) match_avg,
                   SUM(contraindicated_hits > 0) runs_with_contra
            FROM exp_runs WHERE parse_ok IS NOT NULL`);
        console.log(`Trong CSDL: ${q.n} lượt | bóc tách được ${q.ok} | tỷ lệ khớp tên món TB ${Number(q.match_avg).toFixed(1)}% | ${q.runs_with_contra} lượt có món chống chỉ định`);

        const [cmp] = await c.query(`
            SELECT arm, COUNT(*) n,
                   ROUND(AVG(err_kcal),1) err_kcal_tb, ROUND(STDDEV_SAMP(err_kcal),1) err_kcal_sd,
                   ROUND(AVG(err_kcal_fcdb),1) err_fcdb, ROUND(AVG(err_kcal_selfreport),1) err_selfrep,
                   ROUND(AVG(ABS(selfreport_bias)),1) bias_tb,
                   ROUND(100*AVG(ada_compliant),1) tuan_thu_pct,
                   SUM(contraindicated_hits) mon_cam
            FROM exp_runs WHERE parse_ok=1 GROUP BY arm`);
        console.log('\nSơ bộ theo nhánh (chưa phải kết quả thống kê chính thức):');
        console.table(cmp);
    }
    await c.end();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
