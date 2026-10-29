-- =====================================================================
--  NutriAI — Lược đồ CSDL hợp nhất (TiDB Cloud / MySQL 8 compatible)
--  Mục tiêu: mỗi biến trong các công thức (1)-(10) của bài báo VNICT 2026
--            có đúng MỘT cột nguồn trong CSDL, tạo thành một luồng dữ liệu duy nhất.
--
--  Quy ước cột chú giải: -- [F<n>.<biến>] = biến <biến> trong công thức (<n>)
--
--  (1) BMI   = W / (H/100)^2
--  (2) W_ideal = (H - 100) * 0.9
--  (3) BMR   = 10W + 6.25H - 5*Age + S     (S = +5 Nam, -161 Nữ)
--  (4) TDEE  = BMR * PAL
--  (5) P     = W * pRatio
--  (6) L     = (TDEE * 0.25) / 9
--  (7) C     = (TDEE - (P*4 + L*9)) / 4
--  (8) min_x' { ||x'-x|| + λ1|E(x')-E| + λ2*GL(x') }
--  (9) GL(x') = Σ_i (GI_i * C_i / 100)
-- (10) |E(x') - E_target| < 50 Kcal
-- =====================================================================

-- ---------------------------------------------------------------------
-- PHẦN A. BỔ SUNG CỘT CÒN THIẾU CHO BẢNG `users` ĐANG CÓ
--   Thiếu PAL => công thức (4) TDEE không thể tái lập từ CSDL.
--   (Chỉ ADD COLUMN, không xoá/sửa cột cũ.)
-- ---------------------------------------------------------------------
ALTER TABLE users ADD COLUMN activity_pal DECIMAL(4,3) NULL COMMENT '[F4.PAL] Physical Activity Level 1.2-1.9';
ALTER TABLE users ADD COLUMN pal_label    VARCHAR(64)  NULL COMMENT 'Nhãn mức vận động hiển thị trên UI';

-- ---------------------------------------------------------------------
-- PHẦN B. CSDL THỰC PHẨM FCDB 2017 (nguồn của công thức 9)
--   Hiện food_data.json chỉ có 4 trường dinh dưỡng, KHÔNG có GI
--   => cột gi / gi_class / gi_source là phần bổ sung bắt buộc để tính GL.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS foods (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    food_code            VARCHAR(32)  NOT NULL COMMENT 'Mã nội bộ FCDB-0001..0621',
    name                 VARCHAR(255) NOT NULL COMMENT 'TenThucPham trong food_data.json',
    kcal_100g            DECIMAL(7,2) NOT NULL COMMENT '[F9/F10.E_i] Năng lượng /100g',
    protein_100g         DECIMAL(6,2) NOT NULL COMMENT 'Protid_g /100g',
    lipid_100g           DECIMAL(6,2) NOT NULL COMMENT 'Lipid_g /100g',
    carb_100g            DECIMAL(6,2) NOT NULL COMMENT '[F9.C_i gốc] Carb_g /100g',
    gi                   SMALLINT     NULL     COMMENT '[F9.GI_i] Chỉ số đường huyết (glucose=100)',
    gi_class             ENUM('low','medium','high','na') NULL COMMENT 'low<=55, 56-69, >=70',
    gi_source            VARCHAR(48)  NULL     COMMENT 'literature | category_proxy | negligible_carb',
    is_contraindicated_dm TINYINT(1)  NOT NULL DEFAULT 0 COMMENT 'Guardrail Lớp 1 chặn tuyệt đối',
    contra_keyword       VARCHAR(64)  NULL     COMMENT 'Từ khoá cấm đã khớp',
    source               VARCHAR(32)  NOT NULL DEFAULT 'FCDB2017',
    created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_foods_name (name),
    KEY idx_foods_gi (gi),
    KEY idx_foods_contra (is_contraindicated_dm)
) COMMENT='621 bản ghi Bảng Thành phần Thực phẩm Việt Nam — nguồn RAG + nguồn GI cho công thức (9)';

-- ---------------------------------------------------------------------
-- PHẦN C. KẾT QUẢ ĐỘNG CƠ SINH TRẮC — CÔNG THỨC (1)..(7)
--   Mỗi lần calculateMetrics() chạy => ghi 1 dòng (snapshot input + output).
--   Nhờ snapshot input, mọi con số trong bài báo đều tái lập được.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nutrition_targets (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    user_id           INT          NOT NULL,
    computed_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

    -- ---- INPUT: chụp lại tại thời điểm tính (nguồn: bảng users) ----
    height_cm         DECIMAL(5,1) NOT NULL COMMENT '[F1.H][F2.H][F3.H] users.height',
    weight_kg         DECIMAL(5,1) NOT NULL COMMENT '[F1.W][F3.W][F5.W] users.weight',
    age               INT          NOT NULL COMMENT '[F3.Age] users.age',
    gender            VARCHAR(10)  NOT NULL COMMENT '[F3.S] nam=+5 / nu=-161',
    sex_constant      SMALLINT     NOT NULL COMMENT '[F3.S] giá trị S đã áp dụng',
    activity_pal      DECIMAL(4,3) NOT NULL COMMENT '[F4.PAL] users.activity_pal',
    p_ratio           DECIMAL(3,1) NOT NULL COMMENT '[F5.pRatio] 1.5 hoặc 2.0 g/kg',

    -- ---- OUTPUT: giá trị các công thức ----
    bmi               DECIMAL(4,1) NOT NULL COMMENT '(1) BMI',
    bmi_class         VARCHAR(24)  NULL     COMMENT 'Thiếu cân/Bình thường/Tiền béo phì/Béo phì',
    ideal_weight_kg   DECIMAL(5,1) NOT NULL COMMENT '(2) W_ideal',
    bmr_kcal          DECIMAL(7,2) NOT NULL COMMENT '(3) BMR Mifflin-St Jeor',
    tdee_kcal         INT          NOT NULL COMMENT '(4) TDEE = ngân sách E_target',
    target_protein_g  INT          NOT NULL COMMENT '(5) P',
    target_lipid_g    INT          NOT NULL COMMENT '(6) L',
    target_carb_g     INT          NOT NULL COMMENT '(7) C',

    -- ---- KIỂM ĐỊNH NGƯỠNG ADA 2026 (cột dẫn xuất, phục vụ Bảng II) ----
    pct_protein       DECIMAL(4,1) NULL COMMENT 'P*4/TDEE*100 — ADA 15-20%',
    pct_lipid         DECIMAL(4,1) NULL COMMENT 'L*9/TDEE*100 — ADA ~25%',
    pct_carb          DECIMAL(4,1) NULL COMMENT 'C*4/TDEE*100 — ADA 50-55%',
    ada_compliant     TINYINT(1)   NULL COMMENT '1 nếu cả 3 tỷ lệ nằm trong dải ADA',

    formula_version   VARCHAR(24)  NOT NULL DEFAULT 'MSJ-1990/ADA-2026',
    KEY idx_nt_user (user_id, computed_at)
) COMMENT='Đầu ra công thức (1)-(7) — Nutrition Calculator Agent';

-- ---------------------------------------------------------------------
-- PHẦN D. THỰC ĐƠN CÓ CẤU TRÚC — nguồn của công thức (9) và (10)
--   Hiện schedules.meal_data chỉ là TEXT markdown => không truy vấn được.
--   meal_items tách từng món thành dòng có số => tính GL và sai số calo bằng SQL.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_items (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id    INT          NULL COMMENT 'FK schedules.id (NULL nếu là nhật ký nhanh)',
    user_id        INT          NOT NULL,
    log_date       DATE         NOT NULL,
    meal_slot      ENUM('sang','phu_sang','trua','phu_chieu','toi') NOT NULL,

    food_id        INT          NULL COMMENT 'FK foods.id — NULL nếu LLM sinh món ngoài FCDB',
    food_name_raw  VARCHAR(255) NOT NULL COMMENT 'Tên món như LLM/người dùng nhập',
    grams          DECIMAL(7,1) NOT NULL COMMENT 'Khối lượng — hệ số ratio = grams/100',

    -- Giá trị đã nhân ratio (script.js addFood)
    kcal           DECIMAL(8,2) NOT NULL COMMENT '[F10.E_i] kcal_100g * grams/100',
    protein_g      DECIMAL(7,2) NOT NULL,
    lipid_g        DECIMAL(7,2) NOT NULL,
    carb_g         DECIMAL(7,2) NOT NULL COMMENT '[F9.C_i] carb_100g * grams/100',

    gi             SMALLINT     NULL COMMENT '[F9.GI_i] sao chép từ foods.gi tại thời điểm ghi',
    gl             DECIMAL(7,2) NULL COMMENT '(9) thành phần: gi * carb_g / 100',

    origin         ENUM('user','llm','counterfactual') NOT NULL DEFAULT 'user',
    replaced_food_id INT        NULL COMMENT '(8) món GI cao đã bị thay thế bởi dòng này',
    guardrail_flag ENUM('none','layer1_block','layer2_warn','user_override') NOT NULL DEFAULT 'none',
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    KEY idx_mi_user_date (user_id, log_date),
    KEY idx_mi_schedule (schedule_id)
) COMMENT='Một dòng = một món trong một bữa. Nguồn tính (9) GL và (10) sai số năng lượng';

-- ---------------------------------------------------------------------
-- PHẦN E. VÒNG LẶP KHÉP KÍN CẤP NGÀY (Closed-Loop MAS, per-day loop)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_nutrition_summary (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT       NOT NULL,
    log_date        DATE      NOT NULL,
    target_id       INT       NOT NULL COMMENT 'FK nutrition_targets.id — ngân sách áp dụng cho ngày này',

    kcal_consumed   DECIMAL(9,2) NOT NULL DEFAULT 0 COMMENT '[F10.E(x)] Σ meal_items.kcal',
    protein_g       DECIMAL(8,2) NOT NULL DEFAULT 0,
    lipid_g         DECIMAL(8,2) NOT NULL DEFAULT 0,
    carb_g          DECIMAL(8,2) NOT NULL DEFAULT 0,
    gl_total        DECIMAL(8,2) NULL COMMENT '(9) GL(x) = Σ meal_items.gl',

    kcal_remaining  DECIMAL(9,2) NULL COMMENT 'tdee_kcal - kcal_consumed (per-meal loop)',
    energy_gap_abs  DECIMAL(9,2) NULL COMMENT '(10) |E(x) - E_target|',
    within_50kcal   TINYINT(1)   NULL COMMENT '(10) 1 nếu energy_gap_abs < 50',
    gl_risk_class   ENUM('low','medium','high') NULL COMMENT 'GL<=10 thấp, 11-19 TB, >=20 cao',
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_dns (user_id, log_date)
) COMMENT='Tổng hợp ngày — đầu vào cho vòng phản hồi tái cân bằng ngày kế tiếp';

-- =====================================================================
--  PHẦN F. KHỐI BẢNG THỰC NGHIỆM (số liệu Bảng I - IV của bài báo)
--  Mọi dòng đều mang cột value_source để phân biệt:
--    'computed_from_db' = tính lại được từ dữ liệu trong CSDL (tái lập)
--    'paper_reported'   = con số đang in trong bản thảo (chưa có raw data)
-- =====================================================================

CREATE TABLE IF NOT EXISTS exp_experiments (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    code         VARCHAR(32)  NOT NULL UNIQUE,
    table_ref    VARCHAR(16)  NULL COMMENT 'Table I / II / III / IV',
    title        VARCHAR(255) NOT NULL,
    design       VARCHAR(255) NULL COMMENT 'vd: paired-samples, N=50, 5 lần lặp',
    n_units      INT          NULL,
    model        VARCHAR(96)  NULL,
    temperature  DECIMAL(3,2) NULL,
    top_p        DECIMAL(3,2) NULL,
    max_tokens   INT          NULL,
    notes        TEXT         NULL,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) COMMENT='Sổ đăng ký các thực nghiệm trong bài báo';

-- Bảng I — đặc tính dinh dưỡng 621 thực phẩm
CREATE TABLE IF NOT EXISTS exp_food_stats (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    metric        VARCHAR(64)  NOT NULL,
    unit          VARCHAR(24)  NULL,
    n_items       INT          NULL,
    min_value     DECIMAL(10,2) NULL,
    max_value     DECIMAL(10,2) NULL,
    mean_value    DECIMAL(10,2) NULL,
    sd_value      DECIMAL(10,2) NULL,
    clinical_note VARCHAR(255) NULL,
    value_source  ENUM('computed_from_db','paper_reported') NOT NULL,
    computed_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_efs (metric, value_source)
) COMMENT='Table I — có 2 bộ dòng để đối chiếu số tính lại vs số đang in';

-- 50 kịch bản lâm sàng + ground truth (ADA 2026 / FCDB 2017)
CREATE TABLE IF NOT EXISTS exp_scenarios (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    scenario_code  VARCHAR(16) NOT NULL UNIQUE COMMENT 'SC-001..SC-050',
    age            INT          NOT NULL,
    gender         VARCHAR(10)  NOT NULL,
    height_cm      DECIMAL(5,1) NOT NULL,
    weight_kg      DECIMAL(5,1) NOT NULL,
    bmi            DECIMAL(4,1) NOT NULL COMMENT '(1)',
    activity_pal   DECIMAL(4,3) NOT NULL COMMENT '(4)',
    comorbidities  VARCHAR(255) NULL COMMENT 'THA / Gút / CKD1-2 / RL lipid máu',
    -- Ground truth tính bằng chính công thức (3)-(7)
    gt_bmr_kcal       DECIMAL(7,2) NOT NULL,
    gt_tdee_kcal      INT          NOT NULL COMMENT '[F10.E_target]',
    gt_protein_g      INT          NOT NULL,
    gt_lipid_g        INT          NOT NULL,
    gt_carb_g         INT          NOT NULL,
    gt_source      VARCHAR(64) NOT NULL DEFAULT 'MSJ-1990/ADA-2026/FCDB-2017',
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) COMMENT='Đầu vào Bảng II — ground truth sinh bằng công thức, không do LLM sinh';

-- 250 lượt sinh thực đơn (50 kịch bản x 2 nhánh x 5 lần lặp = raw data Bảng II)
CREATE TABLE IF NOT EXISTS exp_runs (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    experiment_id INT          NOT NULL,
    scenario_id   INT          NOT NULL,
    arm           ENUM('baseline','nutriai') NOT NULL,
    run_index     TINYINT      NOT NULL COMMENT '1..5',
    model         VARCHAR(96)  NULL,
    temperature   DECIMAL(3,2) NULL,

    pred_kcal     DECIMAL(9,2) NULL,
    pred_protein_g DECIMAL(8,2) NULL,
    pred_lipid_g  DECIMAL(8,2) NULL,
    pred_carb_g   DECIMAL(8,2) NULL,

    err_kcal      DECIMAL(9,2) NULL COMMENT '|pred_kcal - gt_tdee_kcal|',
    err_protein_g DECIMAL(8,2) NULL,
    err_lipid_g   DECIMAL(8,2) NULL,
    err_carb_g    DECIMAL(8,2) NULL,
    ada_compliant TINYINT(1)   NULL,

    gl_total      DECIMAL(8,2) NULL COMMENT '(9)',
    latency_ms    INT          NULL,
    tokens_out    INT          NULL,
    raw_response  MEDIUMTEXT   NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_run (scenario_id, arm, run_index),
    KEY idx_run_exp (experiment_id)
) COMMENT='Raw data Bảng II — mỗi dòng 1 lượt sinh, Mean±SD tổng hợp từ đây';

-- Bảng II — tổng hợp thống kê
CREATE TABLE IF NOT EXISTS exp_metrics_summary (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    experiment_id   INT          NULL,
    metric          VARCHAR(64)  NOT NULL,
    unit            VARCHAR(24)  NULL,
    baseline_mean   DECIMAL(10,2) NULL,
    baseline_sd     DECIMAL(10,2) NULL,
    nutriai_mean    DECIMAL(10,2) NULL,
    nutriai_sd      DECIMAL(10,2) NULL,
    improvement_pct DECIMAL(6,2) NULL,
    mean_diff       DECIMAL(10,2) NULL COMMENT 'baseline - nutriai',
    ci95_low        DECIMAL(10,2) NULL,
    ci95_high       DECIMAL(10,2) NULL,
    p_value         VARCHAR(16)  NULL,
    test_name       VARCHAR(64)  NULL COMMENT 'Paired t-test / Wilcoxon / McNemar',
    n_pairs         INT          NULL,
    value_source    ENUM('computed_from_db','paper_reported') NOT NULL,
    UNIQUE KEY uk_ems (metric, value_source)
) COMMENT='Table II — bổ sung 95% CI và tên kiểm định theo yêu cầu PB1';

-- 100 truy vấn kiểm duyệt + nhãn chuyên gia
CREATE TABLE IF NOT EXISTS exp_guardrail_queries (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    query_code    VARCHAR(16) NOT NULL UNIQUE COMMENT 'GQ-001..GQ-100',
    query_text    TEXT        NOT NULL,
    query_type    ENUM('direct','indirect_trap') NOT NULL,
    gt_label      ENUM('VIOLATION','SAFE') NOT NULL COMMENT 'Nhãn hợp nhất 2 RDs',
    rater1_label  ENUM('VIOLATION','SAFE') NULL,
    rater2_label  ENUM('VIOLATION','SAFE') NULL,
    layer1_pred   ENUM('VIOLATION','SAFE') NULL,
    layer2_pred   ENUM('VIOLATION','SAFE') NULL,
    dual_pred     ENUM('VIOLATION','SAFE') NULL,
    layer1_ms     INT NULL,
    layer2_ms     INT NULL,
    fp_reason     VARCHAR(255) NULL COMMENT 'Phân tích ca dương tính giả',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) COMMENT='Raw data Bảng III — Confusion Matrix suy ra từ gt_label vs *_pred';

-- Bảng III — hiệu năng guardrail + ma trận nhầm lẫn
CREATE TABLE IF NOT EXISTS exp_guardrail_results (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    experiment_id INT          NULL,
    method        VARCHAR(64)  NOT NULL,
    tp INT NULL, fp INT NULL, tn INT NULL, fn INT NULL,
    precision_pct DECIMAL(5,2) NULL,
    recall_pct    DECIMAL(5,2) NULL,
    f1_pct        DECIMAL(5,2) NULL,
    latency_ms    DECIMAL(8,2) NULL,
    leak_rate_pct DECIMAL(5,2) NULL COMMENT 'Tỷ lệ lọt vi phạm = FN/(TP+FN)',
    kappa         DECIMAL(4,3) NULL COMMENT 'Inter-rater agreement 2 RDs',
    note          VARCHAR(255) NULL,
    value_source  ENUM('computed_from_db','paper_reported') NOT NULL,
    UNIQUE KEY uk_egr (method, value_source)
) COMMENT='Table III — thay thuật ngữ Zero Violation bằng 0% trên tập 100 truy vấn';

-- Tối ưu phản nghiệm (công thức 8-10) — từng thực đơn
CREATE TABLE IF NOT EXISTS exp_gl_optimization (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    experiment_id  INT          NULL,
    menu_code      VARCHAR(16)  NOT NULL,
    scenario_id    INT          NULL,
    gl_before      DECIMAL(7,2) NOT NULL COMMENT '(9) GL(x)',
    gl_after       DECIMAL(7,2) NOT NULL COMMENT '(9) GL(x'')',
    kcal_before    DECIMAL(9,2) NULL COMMENT '[F10.E(x)]',
    kcal_after     DECIMAL(9,2) NULL COMMENT '[F10.E(x'')]',
    kcal_target    DECIMAL(9,2) NULL COMMENT '[F10.E_target]',
    energy_dev_pct DECIMAL(6,2) NULL,
    within_50kcal  TINYINT(1)   NULL COMMENT '(10)',
    lambda1        DECIMAL(5,3) NULL COMMENT '(8) λ1 trọng số năng lượng',
    lambda2        DECIMAL(5,3) NULL COMMENT '(8) λ2 trọng số GL',
    swaps_json     JSON         NULL COMMENT '[{from,to,gi_from,gi_to,grams}]',
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_glopt (menu_code)
) COMMENT='Raw data mục IV.D — mỗi dòng 1 thực đơn trước/sau tối ưu phản nghiệm';

CREATE TABLE IF NOT EXISTS exp_gl_summary (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    metric         VARCHAR(64)  NOT NULL,
    before_mean    DECIMAL(8,2) NULL,
    before_sd      DECIMAL(8,2) NULL,
    after_mean     DECIMAL(8,2) NULL,
    after_sd       DECIMAL(8,2) NULL,
    reduction_pct  DECIMAL(6,2) NULL,
    p_value        VARCHAR(16)  NULL,
    test_name      VARCHAR(64)  NULL,
    n_menus        INT          NULL,
    value_source   ENUM('computed_from_db','paper_reported') NOT NULL,
    note           VARCHAR(255) NULL,
    UNIQUE KEY uk_gls (metric, value_source)
) COMMENT='Mục IV.D — chỉ báo cáo GL, KHÔNG báo cáo PPG tuyệt đối (theo PB1)';

-- Bảng IV — benchmark hạ tầng suy luận
CREATE TABLE IF NOT EXISTS exp_inference_benchmark (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    model_stack      VARCHAR(96)  NOT NULL,
    ttft_s           DECIMAL(5,2) NULL,
    throughput_tps   DECIMAL(7,2) NULL,
    menu_time_s      DECIMAL(6,2) NULL,
    cost_per_1k_usd  DECIMAL(8,2) NULL,
    n_calls          INT          NULL,
    value_source     ENUM('computed_from_db','paper_reported') NOT NULL,
    UNIQUE KEY uk_eib (model_stack, value_source)
) COMMENT='Table IV';

-- SUS 20 chuyên gia
CREATE TABLE IF NOT EXISTS exp_sus_scores (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    rater_code    VARCHAR(16) NOT NULL UNIQUE COMMENT 'SUS-01..SUS-20',
    rater_role    VARCHAR(64) NULL,
    q1 TINYINT NULL, q2 TINYINT NULL, q3 TINYINT NULL, q4 TINYINT NULL, q5 TINYINT NULL,
    q6 TINYINT NULL, q7 TINYINT NULL, q8 TINYINT NULL, q9 TINYINT NULL, q10 TINYINT NULL,
    sus_score     DECIMAL(5,2) NULL COMMENT '(Σ lẻ-5 + Σ 25-chẵn) * 2.5',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) COMMENT='Raw SUS — trung bình ± SD của cột sus_score là con số 86.5 ± 5.4';

-- Bảng đối chiếu công thức <-> cột dữ liệu (tài liệu sống, truy vấn được)
CREATE TABLE IF NOT EXISTS formula_data_map (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    formula_no    VARCHAR(8)   NOT NULL,
    formula_expr  VARCHAR(255) NOT NULL,
    variable      VARCHAR(32)  NOT NULL,
    source_table  VARCHAR(64)  NOT NULL,
    source_column VARCHAR(64)  NOT NULL,
    code_ref      VARCHAR(128) NULL COMMENT 'file:line hiện thực',
    status        ENUM('implemented','partial','missing') NOT NULL,
    note          VARCHAR(255) NULL,
    UNIQUE KEY uk_fdm (formula_no, variable)
) COMMENT='Bản đồ truy vết: mỗi biến công thức lấy số từ cột nào';
