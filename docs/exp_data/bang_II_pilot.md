# Bảng II — mẻ chạy `pilot` (N = 3 cặp)

| Chỉ số | Baseline | NutriAI | Chênh lệch TB | 95% CI | Kiểm định | p |
|---|---|---|---|---|---|---|
| Sai số Calo (Kcal) | 1051.0 ± 257.5 | 529.2 ± 188.3 | 521.8 | [148.9, 894.7] | Paired t-test | = 0.027 |
| Sai số Protein (g) | 58.4 ± 20.9 | 57.8 ± 11.0 | 0.6 | [-26.9, 28.0] | Paired t-test | = 0.937 |
| Sai số Lipid (g) | 34.3 ± 5.4 | 31.8 ± 11.3 | 2.4 | [-12.3, 17.2] | Paired t-test | = 0.551 |
| Sai số Carb (g) | 128.7 ± 39.5 | 69.3 ± 23.5 | 59.4 | [-19.2, 138.0] | Paired t-test | = 0.083 |
| Sai số Calo (LLM tự khai) (Kcal) | 844.1 ± 267.9 | 529.1 ± 188.5 | 315.0 | [-66.0, 696.0] | Paired t-test | = 0.071 |
| Độ lệch tự khai báo (Kcal) | 282.3 ± 116.4 | 86.8 ± 149.9 | 195.6 | [111.6, 279.5] | Paired t-test | = 0.010 |
| Tuân thủ đa lượng ADA (%) | 0.0 | 0.0 | 0.0 | [-56.1, 56.1] | McNemar (exact) | = 1.000 |

Thiết kế mẫu ghép cặp, N = 3, alpha = 0.05, kiểm định hai phía.
H0: mu_baseline = mu_NutriAI. H1: mu_baseline != mu_NutriAI.
Kiểm định chuẩn tắc Shapiro-Wilk trên hiệu số từng cặp quyết định dùng paired t-test hay Wilcoxon signed-rank.
