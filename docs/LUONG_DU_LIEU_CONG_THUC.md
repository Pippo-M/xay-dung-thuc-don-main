# NutriAI — Luồng dữ liệu thống nhất: công thức ↔ CSDL TiDB

Tài liệu này trả lời đúng 3 câu hỏi:

1. Mỗi biến trong các công thức (1)–(10) của bài báo **lấy số từ cột nào** trong CSDL?
2. Hệ thống **chạy theo trình tự nào** từ lúc người bệnh nhập hồ sơ tới lúc ra thực đơn?
3. Số liệu thực nghiệm **được lưu ở đâu** trên TiDB và số nào **tái lập được**, số nào **chưa**.

---

## 1. Sơ đồ một luồng dữ liệu duy nhất

```
                    ┌──────────────── NGƯỜI BỆNH ────────────────┐
                    │  Form: tuổi, giới, cao, nặng, vận động,    │
                    │        bệnh nền                            │
                    └───────────────────┬────────────────────────┘
                                        │  PUT /api/user/profile
                                        ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ TiDB: users                                                          │
  │   age, gender, height, weight, disease, activity_pal ← CỘT MỚI       │
  └───────────────────┬──────────────────────────────────────────────────┘
                      │  recomputeAndStoreTargets()  →  nutrition_engine.js
                      │  công thức (1) (2) (3) (4) (5) (6) (7)
                      ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ TiDB: nutrition_targets   ← ĐÍCH ĐẾN CỦA CÔNG THỨC (1)–(7)           │
  │   bmi, ideal_weight_kg, bmr_kcal, tdee_kcal,                         │
  │   target_protein_g / lipid_g / carb_g, pct_*, ada_compliant          │
  │   + chụp lại input (height_cm, weight_kg, age, sex_constant, PAL)    │
  └───────┬───────────────────────────────────────────┬──────────────────┘
          │ tdee_kcal = E_target                      │ P/L/C = ngân sách
          ▼                                           ▼
  ┌───────────────────────┐               ┌──────────────────────────────┐
  │ Menu Generation Agent │◄──── RAG ─────│ TiDB: foods (621 bản ghi)    │
  │ GPT-OSS-120B / Groq   │   GET /api/   │   kcal/protein/lipid/carb    │
  │ enrichedSystemPrompt  │     foods     │   gi, gi_class ← CỘT MỚI     │
  └───────────┬───────────┘               │   is_contraindicated_dm      │
              │                            └──────────────┬───────────────┘
              │                                           │ GI_i
              ▼                                           │
  ┌───────────────────────────────────────┐               │
  │ Dual-Layer Safety Guardrail            │               │
  │  Lớp 1: server.js CONTRAINDICATIONS   │◄──────────────┘
  │  Lớp 2: /api/chat/generate  τ=0.1     │
  └───────────┬───────────────────────────┘
              │ món đạt / món bị thay (Counterfactual)
              ▼  POST /api/user/meals
  ┌──────────────────────────────────────────────────────────────────────┐
  │ TiDB: meal_items    ← ĐÍCH ĐẾN CỦA CÔNG THỨC (9) cấp MÓN             │
  │   grams, kcal, carb_g (= C_i), gi (= GI_i), gl = GI_i×C_i/100        │
  │   origin, replaced_food_id, guardrail_flag                           │
  └───────────────────┬──────────────────────────────────────────────────┘
                      │ summarizeDay()
                      ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ TiDB: daily_nutrition_summary  ← CÔNG THỨC (9) cấp NGÀY + (10)       │
  │   kcal_consumed = E(x)        gl_total = GL(x)                       │
  │   kcal_remaining = TDEE − E(x)         ← vòng lặp CẤP BỮA            │
  │   energy_gap_abs, within_50kcal        ← ràng buộc (10)              │
  └───────────────────┬──────────────────────────────────────────────────┘
                      │ kcal_remaining quay lại làm ngân sách bữa kế tiếp
                      └──────────────► vòng lặp khép kín (Closed-Loop MAS)
```

**Điểm mấu chốt:** trước khi sửa, mũi tên từ `nutrition_targets` trở xuống **không tồn tại**.
Toàn bộ kết quả công thức (1)–(7) chỉ nằm trong `localStorage` của trình duyệt, còn thực đơn
chỉ được lưu dưới dạng một khối `schedules.meal_data TEXT` (markdown) — không truy vấn được,
không tính được GL, không tính được sai số calo. Đó chính là chỗ "đứt" của luồng dữ liệu.

---

## 2. Bảng đối chiếu: công thức → biến → cột dữ liệu

Bảng này cũng được nạp vào TiDB ở bảng `formula_data_map` để truy vấn bằng SQL.

| CT | Công thức | Biến | Lấy số từ | Code hiện thực |
|----|-----------|------|-----------|----------------|
| (1) | `BMI = W / (H/100)²` | `W` | `users.weight` | `nutrition_engine.js: bmi()` |
| | | `H` | `users.height` | `Client/script.js:85` |
| | | kết quả | `nutrition_targets.bmi` | |
| (2) | `W_ideal = (H−100)×0.9` | `H` | `users.height` | `idealWeight()` |
| | | kết quả | `nutrition_targets.ideal_weight_kg` | `Client/script.js:86` |
| (3) | `BMR = 10W + 6.25H − 5·Age + S` | `Age` | `users.age` | `bmr()` |
| | | `S` | suy từ `users.gender`, lưu tại `nutrition_targets.sex_constant` | nam `+5`, nữ `−161` |
| | | kết quả | `nutrition_targets.bmr_kcal` | `Client/script.js:88-89` |
| (4) | `TDEE = BMR × PAL` | **`PAL`** | **`users.activity_pal`** ← cột mới | `<select id="activity">` 1.2 / 1.375 / 1.55 / 1.725 |
| | | kết quả | `nutrition_targets.tdee_kcal` (= `E_target` của CT 10) | `Client/script.js:90` |
| (5) | `P = W × pRatio` | `pRatio` | `nutrition_targets.p_ratio` | `2.0` nếu `PAL > 1.5`, ngược lại `1.5` |
| | | kết quả | `nutrition_targets.target_protein_g` | `Client/script.js:92-93` |
| (6) | `L = (TDEE × 0.25)/9` | kết quả | `nutrition_targets.target_lipid_g` | `Client/script.js:94` |
| (7) | `C = (TDEE − (4P + 9L))/4` | kết quả | `nutrition_targets.target_carb_g` | `Client/script.js:95` |
| (8) | `min ‖x′−x‖ + λ₁|E(x′)−E| + λ₂·GL(x′)` | `λ₁, λ₂` | `exp_gl_optimization.lambda1/2` | **chưa hiện thực** |
| | | `x → x′` | `meal_items.replaced_food_id` | **chưa hiện thực** |
| (9) | `GL = Σ (GIᵢ × Cᵢ / 100)` | **`GIᵢ`** | **`foods.gi`** ← cột mới, nguồn `Server/data/gi_rules.json` | `scaleFood()` |
| | | `Cᵢ` | `meal_items.carb_g` = `foods.carb_100g × grams/100` | `Client/script.js:156` |
| | | `GL` | `meal_items.gl` (món) → `daily_nutrition_summary.gl_total` (ngày) | `glTotal()` |
| (10) | `|E(x′) − E_target| < 50 Kcal` | `E(x′)` | `daily_nutrition_summary.kcal_consumed` | `summarizeDay()` |
| | | `E_target` | `nutrition_targets.tdee_kcal` | |
| | | kết quả | `daily_nutrition_summary.within_50kcal` | `energyCheck()` |

### Ví dụ số thật (đã chạy `05_selftest_engine.js`, 25/25 đạt)

Nam 45 tuổi, 170 cm, 75 kg, vận động vừa (PAL = 1.55):

```
(1) BMI   = 75 / 1.70²                          = 26.0
(2) W_ideal = (170 − 100) × 0.9                 = 63.0 kg
(3) BMR   = 750 + 1062.5 − 225 + 5              = 1592.50 Kcal
(4) TDEE  = 1592.50 × 1.55                      = 2468 Kcal   ← E_target
(5) P     = 75 × 2.0                            = 150 g   (PAL > 1.5)
(6) L     = 2468 × 0.25 / 9                     = 69 g
(7) C     = (2468 − (150×4 + 69×9)) / 4         = 312 g
```

Bữa sáng xôi nếp 200 g, công thức (9):
```
Cᵢ = 75.1 × 200/100 = 150.2 g  ;  GIᵢ = 86 (gạo nếp)
GL = 86 × 150.2 / 100 = 129.17
```
Thay bằng gạo lứt 200 g (GI = 68): `GL = 103.63` → **giảm 19.8 %** chỉ với một lần thay món.

---

## 3. Bốn chỗ đứt gãy đã tìm ra và cách vá

| # | Vấn đề | Hệ quả với bài báo | Đã xử lý |
|---|--------|--------------------|----------|
| 1 | `users` **không có cột PAL**. Mức vận động chỉ nằm trong `localStorage`. | Công thức (4) TDEE **không tái lập được** từ CSDL → mọi con số "sai số calo" ở Bảng II không kiểm chứng được. | Thêm `users.activity_pal`, `pal_label`; client đẩy lên qua `PUT /api/user/profile`. |
| 2 | `food_data.json` **không có trường GI**. | Công thức (9) `GL = Σ(GIᵢ×Cᵢ/100)` **không có nguồn dữ liệu** → con số "GL giảm 55.4 %" không truy được về dữ liệu. | Thêm `foods.gi / gi_class / gi_source` + bảng tra `Server/data/gi_rules.json`, có ghi rõ nguồn từng giá trị. |
| 3 | Kết quả công thức (1)–(7) **không được lưu**; thực đơn chỉ là `TEXT` markdown. | Không tính được sai số calo/đa lượng bằng SQL; ràng buộc (10) không tồn tại trong code. | Thêm `nutrition_targets`, `meal_items`, `daily_nutrition_summary` + `POST /api/user/meals`. |
| 4 | **Guardrail Lớp 2 chưa từng chạy.** `Client/script.js: checkFoodWithAI()` thoát ngay ở dòng `if (!API_CONFIG.KEY) return true;` — mà `API_CONFIG` (khai báo trong `chatbot.js`) **không hề có khoá `KEY`**. | Bảng III đang báo cáo Precision/Recall cho một lớp kiểm duyệt mà code sản xuất **không kích hoạt**. | Chuyển `checkFoodWithAI()` gọi qua proxy `/api/chat/generate` với `temperature = 0.1`, `max_tokens = 100` đúng như bài báo mô tả. |

Ngoài ra còn 2 lỗi nhỏ đã sửa:
- `Client/script.js:3` khởi tạo `targets = {kcal, protein, liquid, carb}` nhưng `calculateMetrics()` lại ghi vào `targets.p/.l/.c` → ba khoá kia là khoá chết, `updateSummary()` đọc phải `undefined` cho tới khi người dùng bấm "Tính chỉ số".
- Thông tin đăng nhập TiDB đang **hardcode trong `Server/server.js` dòng 22–26** và đã được commit vào git. Đã tách ra `Server/.env` (nằm trong `.gitignore`) + `.env.example`. **Nên đổi mật khẩu TiDB** vì chuỗi cũ đã nằm trong lịch sử git.

---

## 4. Đối chiếu số liệu thực nghiệm với dữ liệu thật

### 4.1. Bảng I — đã kiểm tra trực tiếp trên 621 bản ghi

| Chỉ số | Min/Max in bài | Min/Max tính lại | Mean in bài | Mean tính lại | **SD in bài** | **SD tính lại** |
|--------|----------------|------------------|-------------|---------------|---------------|-----------------|
| Năng lượng (Kcal) | 0.0 – 900.0 | 0.0 – 900.0 ✅ | 182.70 | 182.70 ✅ | 142.15 | **181.26 ❌** |
| Chất đạm (g) | 0.0 – 75.6 | 0.0 – 75.6 ✅ | 9.20 | 9.20 ✅ | 9.85 | **11.17 ❌** |
| Chất béo (g) | 0.0 – 100.0 | 0.0 – 100.0 ✅ | 7.79 | 7.79 ✅ | 12.40 | **17.69 ❌** |
| Chất bột đường (g) | 0.0 – 99.3 | 0.0 – 99.3 ✅ | 18.42 | 18.42 ✅ | 22.18 | **25.11 ❌** |
| Nhóm chống chỉ định ĐTĐ | 31 | 31 ✅ | — | — | — | — |

**Kết luận:** Min, Max, Mean và con số 31 thực phẩm chống chỉ định **khớp tuyệt đối**.
Riêng **cột Độ lệch chuẩn thì không tái lập được** — cả 4 giá trị đều thấp hơn thực tế
(đã thử SD mẫu, SD tổng thể, bỏ giá trị 0, lọc ngoại lai IQR, MAD — không cấu hình nào ra
đúng con số in trong bài). **Cần thay 4 giá trị SD bằng số tính lại trước khi nộp bản thảo.**

Con số **"140 thực phẩm an toàn có chỉ số GI thấp"**: sau khi nạp `gi_rules.json` vào TiDB,
số món thực sự đạt `gi_class = 'low'` **và** có bột đường ≥ 5 g/100 g là **76**, không phải 140.

Độ phủ GI thực tế trên 621 món (kết quả chạy `02_seed_foods.js`):

| Nguồn GI | Số món | Ý nghĩa |
|----------|--------|---------|
| `literature` | 126 | Giá trị công bố (Atkinson et al., ADA) |
| `category_proxy` | 106 | Suy theo nhóm món tương đương — **cần chuyên gia rà soát** |
| `negligible_carb` | 242 | Carb < 5 g/100 g → GL ≈ 0 bất kể GI (thịt, cá, dầu mỡ, rau) |
| **chưa tra được** | **147** | Vẫn có bột đường ≥ 5 g → **GL của thực đơn chứa các món này bị tính thiếu** |

### 4.2. Bảng II — nội kiểm nhất quán

Đã kiểm cả 5 dòng → **khớp cả 5**. Lưu ý cách đọc khác nhau giữa hai loại chỉ số:
- 4 chỉ số sai số dùng **% giảm tương đối** = `mean_diff / baseline_mean`:
  82.4 %, 75.6 %, 73.2 %, 77.2 % — khớp.
- Dòng "Tuân thủ ADA" là **điểm phần trăm** (96 − 64 = +32 đp), không phải % tương đối
  (tương đối sẽ là +50 %). Nên **ghi rõ "điểm phần trăm" trong chú thích chân bảng**, tránh
  người đọc hiểu nhầm là cùng loại với 4 dòng trên.

Khoảng tin cậy 95 % CI mà PB1 yêu cầu hiện **mới có cho 3/5 chỉ số**
(Calo, Carb, Tuân thủ ADA); còn thiếu CI cho **Protein và Lipid**.

### 4.3. Bảng III — mâu thuẫn số học giữa hai tài liệu

Báo cáo giải trình PB1 nêu ma trận nhầm lẫn của Dual-Layer: **TP = 50, TN = 48, FP = 2, FN = 0**.
Từ ma trận đó suy ra:

```
Precision = 50/(50+2) = 96.2 %     Recall = 50/50 = 100 %     F1 = 98.0 %
```

Nhưng **Bảng III trong bài báo ghi Precision = 98.0 %**. Con số 98.0 % chính là **F1-Score**,
không phải Precision. Hai khả năng: hoặc đổi nhãn cột thành F1, hoặc sửa Precision thành 96.2 %.
(Chính báo cáo PB1 cũng ghi "Precision = 96.2 %, F1-Score = 98.0 %" — tức là bảng đang lệch với
phần thuyết minh của chính mình.)

Mâu thuẫn thứ hai: Bảng III ghi **Lớp 1 Precision = 100 %** (⇒ FP = 0), nhưng phần phân tích
dương tính giả lại nói *"2 ca FP xảy ra ở Lớp 1 Rule-based"* (câu "gà kho gừng **không** thêm đường").
Nếu Lớp 1 thật sự sinh 2 FP thì Precision của nó là `44/46 = 95.7 %`, không phải 100 %.

### 4.4. Mục IV.D — GL

`(38.6 − 17.2) / 38.6 = 55.44 %` → **khớp** với con số 55.4 % trong bài.
Theo đúng khuyến nghị PB1, hai giá trị PPG (182.4 → 128.6 mg/dL) **được ghi vào CSDL dưới dạng
dòng ghi chú "KHÔNG BÁO CÁO"**, không lưu như số liệu.

### 4.5. Một phát hiện về công thức (5) cần lưu ý

Với `pRatio = 2.0 g/kg` (áp dụng khi PAL > 1.5), tỷ lệ protein tính ra là **24.3 % TDEE**
ở ca ví dụ — **vượt dải ADA 15–20 %** mà chính bài báo trích dẫn ở mục III.B.
Nghĩa là công thức (5) như đang viết có thể **tự vi phạm chuẩn ADA** ở nhóm bệnh nhân vận động nhiều,
trong khi Bảng II lại báo cáo "Tuân thủ ADA 96 %". Cột `nutrition_targets.pct_protein` và
`ada_compliant` được thêm vào chính là để phát hiện những ca này bằng SQL. Cần hoặc nới dải ADA
trích dẫn, hoặc kẹp `pRatio` sao cho `P×4 ≤ 0.20 × TDEE`.

---

## 5. Các bảng thực nghiệm trên TiDB

### Nhóm số liệu đã đẩy lên (`value_source = 'paper_reported'`)

| Bảng TiDB | Nội dung | Tương ứng |
|-----------|----------|-----------|
| `exp_experiments` | Sổ đăng ký 6 thực nghiệm: thiết kế, N, model, τ, top_p, max_tokens | Mục IV |
| `exp_food_stats` | 6 dòng `paper_reported` + 6 dòng `computed_from_db` | Bảng I |
| `exp_metrics_summary` | 6 chỉ số kèm mean_diff, 95 % CI, tên kiểm định | Bảng II + SUS |
| `exp_guardrail_results` | 4 phương pháp kèm TP/FP/TN/FN, kappa | Bảng III |
| `exp_gl_summary` | GL trước/sau, độ lệch calo, dòng ghi chú PPG | Mục IV.D |
| `exp_inference_benchmark` | 3 stack mô hình | Bảng IV |
| `formula_data_map` | 23 dòng ánh xạ biến → cột → code → trạng thái | Mục III.B |

### Nhóm bảng **cố ý để trống** — phải chạy thực nghiệm thật mới điền

| Bảng TiDB | Cần điền gì | Vì sao chưa điền |
|-----------|-------------|------------------|
| `exp_scenarios` | 50 kịch bản lâm sàng + ground truth | Repo không có file 50 kịch bản. **Không được sinh ngẫu nhiên rồi gọi là số liệu thực nghiệm.** |
| `exp_runs` | 250 lượt sinh (50 × 2 nhánh × 5 lần) | Chưa có log chạy thật. Đây là dữ liệu thô mà PB1 yêu cầu để ra Mean ± SD và p-value. |
| `exp_guardrail_queries` | 100 truy vấn + nhãn 2 RDs | Chưa có file gán nhãn. |
| `exp_gl_optimization` | >30 thực đơn trước/sau tối ưu | Chưa có log tối ưu phản nghiệm. |
| `exp_sus_scores` | 20 phiếu SUS 10 câu | Chưa có dữ liệu khảo sát thô. |

> Đây là ranh giới quan trọng: mọi con số trong nhóm đầu là **sao chép trung thực** từ bản thảo,
> có gắn nhãn `paper_reported` để không ai nhầm là dữ liệu đo được. Nhóm thứ hai để trống cho đến
> khi có số đo thật. Khi 5 bảng này được điền, chạy lại `04_verify.js` sẽ tự động so
> `computed_from_db` với `paper_reported` và chỉ ra mọi chỗ lệch.

---

## 6. Cách chạy

```bash
cd Server
npm install
node scripts/_mkenv.js          # tách thông tin DB từ server.js ra .env (chạy 1 lần)
node scripts/00_inspect.js      # chỉ đọc — xem schema hiện tại
node scripts/05_selftest_engine.js   # kiểm thử công thức, không chạm CSDL
```

Ba script có **ghi** vào TiDB (chỉ `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN`, `INSERT ... ON DUPLICATE KEY UPDATE`
— không `DROP`, không đụng dữ liệu `users`/`schedules` đang có):

```bash
node scripts/01_migrate.js          # tạo 14 bảng mới + 2 cột mới cho users
node scripts/02_seed_foods.js       # nạp 621 thực phẩm + GI, tính lại Bảng I
node scripts/03_push_experiments.js # đẩy số liệu Bảng I–IV, GL, formula map
node scripts/04_verify.js           # chỉ đọc — in bảng đối chiếu khớp/lệch
```

---

## 7. Việc còn lại (theo thứ tự ưu tiên)

1. **Sửa 4 giá trị SD ở Bảng I** thành số tính lại được (181.26 / 11.17 / 17.69 / 25.11).
2. **Xử lý mâu thuẫn Bảng III**: Precision 98.0 % → hoặc đổi nhãn thành F1, hoặc sửa thành 96.2 %;
   thống nhất lại 2 ca FP thuộc lớp nào.
3. **Bổ sung 95 % CI cho Protein và Lipid** ở Bảng II, và **ghi chú "điểm phần trăm"** cho dòng Tuân thủ ADA.
4. **Sửa con số 140 → 76 thực phẩm GI thấp**, hoặc tra nốt GI cho 147 món còn thiếu rồi đếm lại.
5. **Nhờ chuyên gia dinh dưỡng rà soát** 106 giá trị GI đang gắn nhãn `category_proxy` trong
   `gi_rules.json` trước khi đưa vào bài.
6. **Chạy thực nghiệm thật** để điền 5 bảng raw, rồi chạy `04_verify.js` đối chiếu.
7. **Hiện thực công thức (8)** (bộ giải tối ưu phản nghiệm) hoặc hạ cấp cách diễn đạt trong bài
   thành "luật thay thế heuristic theo GI" — hiện code mới chỉ nhắc LLM trong prompt, chưa có
   bài toán tối ưu nào được giải.
8. **Đổi mật khẩu TiDB** (chuỗi cũ đã nằm trong lịch sử git).
