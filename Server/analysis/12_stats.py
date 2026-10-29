# -*- coding: utf-8 -*-
"""
Ý kiến phản biện PB1 #9 — Phân tích thống kê cho Bảng II.

THIẾT KẾ:
    Mẫu ghép cặp (paired-samples). Mỗi kịch bản lâm sàng được xử lý bởi CẢ HAI
    hệ thống, nên hai nhóm không độc lập -> bắt buộc dùng kiểm định ghép cặp.

GIẢ THUYẾT (hai phía, alpha = 0.05):
    H0: mu_baseline = mu_NutriAI  (không có khác biệt về sai số dinh dưỡng)
    H1: mu_baseline != mu_NutriAI

QUY TRÌNH:
    1. Gộp N lần chạy lặp của mỗi kịch bản thành 1 giá trị (trung bình) -> khử
       tính ngẫu nhiên của LLM. SD nội bộ giữa các lần chạy được báo cáo riêng.
    2. Shapiro-Wilk trên HIỆU SỐ từng cặp. p > 0.05 -> paired t-test;
       ngược lại -> Wilcoxon signed-rank. Không chọn trước kiểm định.
    3. 95% CI cho chênh lệch trung bình (t-based, hoặc bootstrap BCa cho Wilcoxon).
    4. Tuân thủ đa lượng là biến nhị phân ghép cặp -> McNemar test,
       CI cho hiệu tỷ lệ theo phương pháp Wilson.
    5. Effect size: Cohen's dz cho mẫu ghép cặp.

Chạy:  python analysis/12_stats.py [--batch pilot|full]
"""
import os
import sys
import argparse
import numpy as np
import pymysql
from scipy import stats
from statsmodels.stats.contingency_tables import mcnemar
from statsmodels.stats.proportion import proportion_confint

sys.stdout.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
ALPHA = 0.05
H0 = 'mu_baseline = mu_NutriAI'
H1 = 'mu_baseline != mu_NutriAI'


def load_env():
    env = {}
    with open(os.path.join(HERE, '..', '.env'), encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env


def connect():
    e = load_env()
    return pymysql.connect(
        host=e['DB_HOST'], user=e['DB_USER'], password=e['DB_PASSWORD'],
        database=e['DB_NAME'], port=int(e.get('DB_PORT', 4000)),
        ssl={'ssl': {}}, charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
    )


# --------------------------------------------------------------- lấy dữ liệu
METRICS = [
    ('Sai số Calo',    'Kcal', 'err_kcal',           'fcdb'),
    ('Sai số Protein', 'g',    'err_protein_g',      'fcdb'),
    ('Sai số Lipid',   'g',    'err_lipid_g',        'fcdb'),
    ('Sai số Carb',    'g',    'err_carb_g',         'fcdb'),
    ('Sai số Calo (LLM tự khai)', 'Kcal', 'err_kcal_selfreport', 'selfreport'),
    ('Độ lệch tự khai báo',       'Kcal', 'selfreport_bias',     'selfreport'),
]


def fetch(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT s.scenario_code, r.arm, r.run_index,
                   r.err_kcal, r.err_protein_g, r.err_lipid_g, r.err_carb_g,
                   r.err_kcal_selfreport, ABS(r.selfreport_bias) AS selfreport_bias,
                   r.ada_compliant, r.contraindicated_hits, r.match_rate_pct
            FROM exp_runs r JOIN exp_scenarios s ON s.id = r.scenario_id
            WHERE r.parse_ok = 1
        """)
        return cur.fetchall()


def pair_up(rows, col):
    """Gộp các lần chạy lặp -> 1 giá trị/kịch bản/nhánh, rồi ghép cặp theo kịch bản."""
    buckets = {}
    for r in rows:
        if r[col] is None:
            continue
        buckets.setdefault((r['scenario_code'], r['arm']), []).append(float(r[col]))

    codes = sorted({k[0] for k in buckets})
    base, nutri, within = [], [], []
    used = []
    for c in codes:
        b, n = buckets.get((c, 'baseline')), buckets.get((c, 'nutriai'))
        if not b or not n:
            continue                       # thiếu một nhánh -> không ghép cặp được
        base.append(np.mean(b))
        nutri.append(np.mean(n))
        if len(b) > 1:
            within.append(np.std(b, ddof=1))
        if len(n) > 1:
            within.append(np.std(n, ddof=1))
        used.append(c)
    return np.array(base), np.array(nutri), np.array(within), used


def bootstrap_ci(d, n_boot=10000, seed=20260214):
    rng = np.random.default_rng(seed)
    means = [rng.choice(d, size=len(d), replace=True).mean() for _ in range(n_boot)]
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def p_text(p):
    if p < 0.001:
        return '< 0.001'
    return f'= {p:.3f}'


def effect_label(d):
    a = abs(d)
    return 'nhỏ' if a < 0.5 else ('trung bình' if a < 0.8 else 'lớn')


def analyze_continuous(name, unit, col, mode, rows):
    b, n, within, used = pair_up(rows, col)
    if len(b) < 3:
        print(f'  {name}: chỉ có {len(b)} cặp — chưa đủ để kiểm định, bỏ qua.')
        return None

    d = b - n                                   # hiệu số từng cặp
    sw_stat, sw_p = stats.shapiro(d)
    normal = sw_p > ALPHA

    if normal:
        test = 'Paired t-test'
        stat, p = stats.ttest_rel(b, n)
        se = d.std(ddof=1) / np.sqrt(len(d))
        tcrit = stats.t.ppf(1 - ALPHA / 2, len(d) - 1)
        lo, hi = d.mean() - tcrit * se, d.mean() + tcrit * se
    else:
        test = 'Wilcoxon signed-rank'
        stat, p = stats.wilcoxon(b, n)
        lo, hi = bootstrap_ci(d)               # CI phi tham số

    dz = d.mean() / d.std(ddof=1) if d.std(ddof=1) else 0.0
    improvement = (d.mean() / b.mean() * 100) if b.mean() else None

    return dict(
        metric=name, unit=unit, measure_mode=mode, n_pairs=len(b),
        baseline_mean=b.mean(), baseline_sd=b.std(ddof=1),
        nutriai_mean=n.mean(), nutriai_sd=n.std(ddof=1),
        mean_diff=d.mean(), ci95_low=lo, ci95_high=hi,
        normality_test='Shapiro-Wilk', normality_p=sw_p,
        test_name=test, statistic=float(stat), p_value=float(p), p_value_text=p_text(p),
        effect_size=dz, effect_label=effect_label(dz),
        within_scenario_sd=float(np.median(within)) if len(within) else None,
        improvement_pct=improvement,
    )


def analyze_ada(rows):
    """Tuân thủ đa lượng: nhị phân ghép cặp -> McNemar."""
    b, n, _, used = pair_up(rows, 'ada_compliant')
    if len(b) < 3:
        return None
    # Trung bình các lần chạy -> quy về nhị phân theo đa số
    bb, nn = (b >= 0.5).astype(int), (n >= 0.5).astype(int)
    tbl = [[int(((bb == 1) & (nn == 1)).sum()), int(((bb == 1) & (nn == 0)).sum())],
           [int(((bb == 0) & (nn == 1)).sum()), int(((bb == 0) & (nn == 0)).sum())]]
    exact = (tbl[0][1] + tbl[1][0]) < 25
    res = mcnemar(tbl, exact=exact, correction=not exact)

    p_b, p_n = bb.mean(), nn.mean()
    # CI Wilson cho hiệu hai tỷ lệ ghép cặp (xấp xỉ qua CI từng tỷ lệ)
    lo_b, hi_b = proportion_confint(bb.sum(), len(bb), method='wilson')
    lo_n, hi_n = proportion_confint(nn.sum(), len(nn), method='wilson')
    return dict(
        metric='Tuân thủ đa lượng ADA', unit='%', measure_mode='n/a', n_pairs=len(bb),
        baseline_mean=p_b * 100, baseline_sd=None,
        nutriai_mean=p_n * 100, nutriai_sd=None,
        mean_diff=(p_n - p_b) * 100,
        ci95_low=(lo_n - hi_b) * 100, ci95_high=(hi_n - lo_b) * 100,
        normality_test=None, normality_p=None,
        test_name=f"McNemar ({'exact' if exact else 'chi-square, hiệu chỉnh liên tục'})",
        statistic=float(res.statistic) if res.statistic is not None else None,
        p_value=float(res.pvalue), p_value_text=p_text(res.pvalue),
        effect_size=None, effect_label=None, within_scenario_sd=None,
        improvement_pct=(p_n - p_b) * 100,
        _discordant=f'b+/n- = {tbl[0][1]}, b-/n+ = {tbl[1][0]}',
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--batch', default='pilot')
    a = ap.parse_args()

    conn = connect()
    rows = fetch(conn)
    print(f'Đọc {len(rows)} lượt chạy bóc tách được từ exp_runs\n')
    if not rows:
        print('Chưa có dữ liệu — chạy scripts/11_run_experiment.js trước.')
        return

    n_sc = len({r['scenario_code'] for r in rows})
    runs_per = len(rows) / (n_sc * 2) if n_sc else 0
    match = np.mean([float(r['match_rate_pct']) for r in rows if r['match_rate_pct'] is not None])
    contra = sum(1 for r in rows if (r['contraindicated_hits'] or 0) > 0)
    print(f'  Số kịch bản ghép cặp được : {n_sc}')
    print(f'  Số lần chạy TB mỗi ô      : {runs_per:.1f}')
    print(f'  Tỷ lệ khớp tên món FCDB   : {match:.1f}%')
    print(f'  Lượt có món chống chỉ định: {contra}/{len(rows)}')

    results = []
    print(f'\n{"="*96}\nKẾT QUẢ KIỂM ĐỊNH — thiết kế mẫu ghép cặp, alpha = {ALPHA}')
    print(f'H0: {H0}   |   H1: {H1}\n{"="*96}')
    for name, unit, col, mode in METRICS:
        r = analyze_continuous(name, unit, col, mode, rows)
        if r:
            results.append(r)
    ada = analyze_ada(rows)
    if ada:
        results.append(ada)

    hdr = f'{"Chỉ số":<30}{"Baseline":>17}{"NutriAI":>17}{"Chênh lệch [95% CI]":>28}{"Kiểm định":>26}{"p":>11}'
    print(hdr)
    print('-' * len(hdr))
    for r in results:
        bs = f'{r["baseline_mean"]:.1f}' + (f' ± {r["baseline_sd"]:.1f}' if r['baseline_sd'] is not None else '')
        ns = f'{r["nutriai_mean"]:.1f}' + (f' ± {r["nutriai_sd"]:.1f}' if r['nutriai_sd'] is not None else '')
        ci = f'{r["mean_diff"]:.1f} [{r["ci95_low"]:.1f}, {r["ci95_high"]:.1f}]'
        print(f'{r["metric"]:<30}{bs:>17}{ns:>17}{ci:>28}{r["test_name"]:>26}{r["p_value_text"]:>11}')

    print('\nChi tiết:')
    for r in results:
        bits = []
        if r['normality_p'] is not None:
            bits.append(f'Shapiro-Wilk p = {r["normality_p"]:.4f} -> ' +
                        ('phân phối chuẩn' if r['normality_p'] > ALPHA else 'KHÔNG chuẩn'))
        if r['effect_size'] is not None:
            bits.append(f"Cohen's dz = {r['effect_size']:.2f} ({r['effect_label']})")
        if r['within_scenario_sd'] is not None:
            bits.append(f'SD nội bộ giữa các lần chạy (trung vị) = {r["within_scenario_sd"]:.1f}')
        if r.get('_discordant'):
            bits.append(f'cặp bất đồng: {r["_discordant"]}')
        if bits:
            print(f'  {r["metric"]}: ' + ' | '.join(bits))

    # --------------------------------------------------- ghi vào TiDB
    with conn.cursor() as cur:
        for r in results:
            cur.execute("""
                INSERT INTO exp_stat_tests
                  (metric, unit, measure_mode, design, n_pairs, baseline_mean, baseline_sd,
                   nutriai_mean, nutriai_sd, mean_diff, ci95_low, ci95_high,
                   normality_test, normality_p, test_name, statistic, p_value, p_value_text,
                   effect_size, effect_label, within_scenario_sd, improvement_pct,
                   alpha, h0, h1, run_batch)
                VALUES (%s,%s,%s,'paired-samples',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                        %s,%s,%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE
                  n_pairs=VALUES(n_pairs), baseline_mean=VALUES(baseline_mean),
                  baseline_sd=VALUES(baseline_sd), nutriai_mean=VALUES(nutriai_mean),
                  nutriai_sd=VALUES(nutriai_sd), mean_diff=VALUES(mean_diff),
                  ci95_low=VALUES(ci95_low), ci95_high=VALUES(ci95_high),
                  normality_test=VALUES(normality_test), normality_p=VALUES(normality_p),
                  test_name=VALUES(test_name), statistic=VALUES(statistic),
                  p_value=VALUES(p_value), p_value_text=VALUES(p_value_text),
                  effect_size=VALUES(effect_size), effect_label=VALUES(effect_label),
                  within_scenario_sd=VALUES(within_scenario_sd),
                  improvement_pct=VALUES(improvement_pct), computed_at=CURRENT_TIMESTAMP
            """, (r['metric'], r['unit'], r['measure_mode'], r['n_pairs'],
                  r['baseline_mean'], r['baseline_sd'], r['nutriai_mean'], r['nutriai_sd'],
                  r['mean_diff'], r['ci95_low'], r['ci95_high'],
                  r['normality_test'], r['normality_p'], r['test_name'], r['statistic'],
                  r['p_value'], r['p_value_text'], r['effect_size'], r['effect_label'],
                  r['within_scenario_sd'], r['improvement_pct'], ALPHA, H0, H1, a.batch))
    conn.commit()
    print(f'\nĐã ghi {len(results)} dòng vào exp_stat_tests (run_batch = {a.batch}).')

    # --------------------------------------------------- bảng dán vào bài báo
    out = os.path.join(HERE, '..', '..', 'docs', 'exp_data', f'bang_II_{a.batch}.md')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(f'# Bảng II — mẻ chạy `{a.batch}` (N = {results[0]["n_pairs"]} cặp)\n\n')
        f.write('| Chỉ số | Baseline | NutriAI | Chênh lệch TB | 95% CI | Kiểm định | p |\n')
        f.write('|---|---|---|---|---|---|---|\n')
        for r in results:
            bs = f'{r["baseline_mean"]:.1f}' + (f' ± {r["baseline_sd"]:.1f}' if r['baseline_sd'] is not None else '')
            ns = f'{r["nutriai_mean"]:.1f}' + (f' ± {r["nutriai_sd"]:.1f}' if r['nutriai_sd'] is not None else '')
            f.write(f'| {r["metric"]} ({r["unit"]}) | {bs} | {ns} | {r["mean_diff"]:.1f} | '
                    f'[{r["ci95_low"]:.1f}, {r["ci95_high"]:.1f}] | {r["test_name"]} | {r["p_value_text"]} |\n')
        f.write(f'\nThiết kế mẫu ghép cặp, N = {results[0]["n_pairs"]}, alpha = {ALPHA}, kiểm định hai phía.\n')
        f.write(f'H0: {H0}. H1: {H1}.\n')
        f.write('Kiểm định chuẩn tắc Shapiro-Wilk trên hiệu số từng cặp quyết định dùng '
                'paired t-test hay Wilcoxon signed-rank.\n')
    print(f'Đã xuất bảng Markdown: {out}')
    conn.close()


if __name__ == '__main__':
    main()
