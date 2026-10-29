-- Bổ sung cột phục vụ ý kiến phản biện #2 (mô tả kịch bản/baseline) và #9 (thống kê).
-- Idempotent: chạy lại sẽ bị bỏ qua vì trùng tên cột.

-- exp_scenarios: ghi thêm tỷ lệ đa lượng của chính GROUND TRUTH, để báo cáo
-- trung thực tỷ lệ kịch bản mà ground truth tự vượt dải ADA 15-20% (do pRatio = 2.0 g/kg).
ALTER TABLE exp_scenarios ADD COLUMN gt_pct_protein DECIMAL(4,1) NULL COMMENT 'P*4/TDEE*100';
ALTER TABLE exp_scenarios ADD COLUMN gt_pct_lipid   DECIMAL(4,1) NULL;
ALTER TABLE exp_scenarios ADD COLUMN gt_pct_carb    DECIMAL(4,1) NULL;
ALTER TABLE exp_scenarios ADD COLUMN gt_ada_compliant TINYINT(1) NULL COMMENT '0 = chính ground truth đã lệch dải ADA';
ALTER TABLE exp_scenarios ADD COLUMN rng_seed       INT          NULL COMMENT 'Seed sinh kịch bản — bảo đảm tái lập';
ALTER TABLE exp_scenarios ADD COLUMN sex_constant   SMALLINT     NULL COMMENT 'S của công thức (3)';
ALTER TABLE exp_scenarios ADD COLUMN p_ratio        DECIMAL(3,1) NULL COMMENT 'pRatio của công thức (5)';

-- exp_runs: tách 2 cách đo sai số calo (quyết định "báo cáo song song")
--   *_selfreport = con số LLM tự khai trong văn bản
--   *_fcdb       = tính lại từ tên món + số gram, tra bảng foods
ALTER TABLE exp_runs ADD COLUMN pred_kcal_selfreport DECIMAL(9,2) NULL COMMENT 'Tổng kcal LLM tự khai';
ALTER TABLE exp_runs ADD COLUMN pred_kcal_fcdb       DECIMAL(9,2) NULL COMMENT 'Tổng kcal tra lại từ FCDB';
ALTER TABLE exp_runs ADD COLUMN err_kcal_selfreport  DECIMAL(9,2) NULL;
ALTER TABLE exp_runs ADD COLUMN err_kcal_fcdb        DECIMAL(9,2) NULL;
ALTER TABLE exp_runs ADD COLUMN selfreport_bias      DECIMAL(9,2) NULL COMMENT 'pred_selfreport - pred_fcdb = mức LLM khai sai';
ALTER TABLE exp_runs ADD COLUMN n_items              SMALLINT     NULL COMMENT 'Số món bóc tách được';
ALTER TABLE exp_runs ADD COLUMN n_items_matched      SMALLINT     NULL COMMENT 'Số món khớp được với 621 bản ghi FCDB';
ALTER TABLE exp_runs ADD COLUMN match_rate_pct       DECIMAL(5,2) NULL COMMENT 'Tỷ lệ khớp tên món — phải báo cáo trong bài';
ALTER TABLE exp_runs ADD COLUMN contraindicated_hits SMALLINT     NULL COMMENT 'Số món chống chỉ định lọt vào thực đơn';
ALTER TABLE exp_runs ADD COLUMN parse_ok             TINYINT(1)   NULL COMMENT '0 = không bóc tách được, loại khỏi phân tích';
ALTER TABLE exp_runs ADD COLUMN parse_note           VARCHAR(255) NULL;
ALTER TABLE exp_runs ADD COLUMN items_json           JSON         NULL COMMENT 'Danh sách món đã bóc tách + kết quả tra FCDB';

-- Lưu kết quả kiểm định thống kê (ý kiến #9): mỗi dòng một chỉ số
CREATE TABLE IF NOT EXISTS exp_stat_tests (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    metric          VARCHAR(64)  NOT NULL,
    unit            VARCHAR(24)  NULL,
    measure_mode    ENUM('fcdb','selfreport','n/a') NOT NULL DEFAULT 'n/a',
    design          VARCHAR(64)  NOT NULL DEFAULT 'paired-samples',
    n_pairs         INT          NOT NULL,

    baseline_mean   DECIMAL(10,3) NULL,
    baseline_sd     DECIMAL(10,3) NULL,
    nutriai_mean    DECIMAL(10,3) NULL,
    nutriai_sd      DECIMAL(10,3) NULL,

    mean_diff       DECIMAL(10,3) NULL COMMENT 'baseline - nutriai',
    ci95_low        DECIMAL(10,3) NULL,
    ci95_high       DECIMAL(10,3) NULL,

    normality_test  VARCHAR(32)  NULL COMMENT 'Shapiro-Wilk trên hiệu số từng cặp',
    normality_p     DOUBLE       NULL,
    test_name       VARCHAR(64)  NULL COMMENT 'Kiểm định đã chọn dựa trên kết quả chuẩn tắc',
    statistic       DOUBLE       NULL,
    p_value         DOUBLE       NULL,
    p_value_text    VARCHAR(24)  NULL COMMENT 'Dạng in trong bài, vd "< 0.001"',
    effect_size     DOUBLE       NULL COMMENT "Cohen's d cho mẫu ghép cặp",
    effect_label    VARCHAR(24)  NULL,

    within_scenario_sd DECIMAL(10,3) NULL COMMENT 'SD trung vị giữa 5 lần chạy — đo tính bất định LLM',
    improvement_pct DECIMAL(8,3) NULL,
    alpha           DECIMAL(4,3) NOT NULL DEFAULT 0.050,
    h0              VARCHAR(128) NULL,
    h1              VARCHAR(128) NULL,
    run_batch       VARCHAR(32)  NULL COMMENT 'pilot / full',
    computed_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_stat (metric, measure_mode, run_batch)
) COMMENT='Ý kiến PB1 #9 — kiểm định, giả thuyết, thiết kế mẫu, 95% CI cho từng chỉ số';
