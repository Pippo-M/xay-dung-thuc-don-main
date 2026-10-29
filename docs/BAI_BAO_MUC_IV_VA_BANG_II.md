# Hai đầu ra cho bản thảo VNICT 2026

Đáp ứng ý kiến phản biện PB1 số **2** (mô tả kịch bản, ground truth, baseline, số lần lặp,
tham số sinh, cách tổng hợp) và số **9** (phương pháp kiểm định, giả thuyết, thiết kế mẫu,
khoảng tin cậy).

> **Trạng thái số liệu.** Phần mô tả phương pháp (Đầu ra 1) đã hoàn chỉnh và không phụ thuộc
> vào kết quả chạy. Các con số trong Bảng II (Đầu ra 2) hiện lấy từ **mẻ chạy tiền đề (pilot)
> trên 5/50 kịch bản**, vì hạn mức 200.000 token/ngày của gói Groq on-demand đã cạn. Cấu trúc
> bảng, cột 95% CI, p-value và chú thích chân bảng là bản cuối; chỉ cần chạy lại
> `11_run_experiment.js` rồi `12_stats.py` là số liệu tự điền vào đúng chỗ.

---

# ĐẦU RA 1 — Mục IV (đoạn mở đầu) và Mục IV.A

## IV. THỰC NGHIỆM VÀ KẾT QUẢ

Thực nghiệm được triển khai trên máy chủ Node.js v20 LTS, cơ sở dữ liệu phân tán TiDB Cloud
(tương thích MySQL 8.0) và hạ tầng suy luận Groq LPU với mô hình OpenAI GPT-OSS-120B. Nhằm bảo
đảm tính truy vết và khả năng tái lập, toàn bộ dữ liệu thô của thực nghiệm được lưu trữ có cấu
trúc trên TiDB Cloud: bảng `exp_scenarios` chứa 50 hồ sơ kịch bản kèm đáp án đúng, bảng
`exp_runs` chứa từng lượt sinh thực đơn cùng phản hồi nguyên văn của mô hình, và bảng
`exp_stat_tests` chứa kết quả của từng kiểm định thống kê. Bộ sinh kịch bản, mã nguồn chạy thực
nghiệm và mã phân tích thống kê được công bố kèm bài báo.

### A. Thiết kế Thực nghiệm

#### 1) Xây dựng 50 kịch bản lâm sàng tổng hợp và tiêu chí xác lập đáp án đúng

Do ràng buộc về đạo đức nghiên cứu và bảo mật dữ liệu bệnh nhân, nhóm nghiên cứu sử dụng kỹ
thuật sinh hồ sơ lâm sàng tổng hợp (*synthetic clinical vignettes*). Năm mươi hồ sơ được sinh
bằng bộ sinh số giả ngẫu nhiên tất định `mulberry32` với **hạt giống cố định (seed = 20260214)**;
nhờ đó mọi lần chạy lại đều tái tạo chính xác cùng một tập kịch bản, cho phép hội đồng và các
nhóm nghiên cứu khác kiểm chứng độc lập. Cần nhấn mạnh rằng đây là hồ sơ tổng hợp, **không phải
dữ liệu bệnh nhân có thật**.

Phân bố của tập kịch bản được thiết kế bám theo đặc điểm dịch tễ của bệnh nhân đái tháo đường
type 2 tại Việt Nam, với các tham số thực tế thu được như sau:

| Đặc tính | Phân bố thu được trên 50 kịch bản |
|---|---|
| Tuổi | 32 – 78 tuổi (trung bình 54,9) |
| Giới tính | 26 nữ (52 %) / 24 nam (48 %) |
| Chiều cao | 149,3 – 177,4 cm |
| Cân nặng | 37,4 – 94,7 kg |
| Chỉ số khối cơ thể BMI | 16,8 – 32,4 kg/m² (trung bình 24,7) |
| Mức vận động PAL | 1,2 / 1,375 / 1,55 / 1,725 / 1,9 — mỗi mức 10 ca (20 %) |
| Bệnh nền chính | Đái tháo đường type 2: 50/50 ca (100 %) |
| Bệnh đồng mắc | Tăng huyết áp 15 ca (30 %); rối loạn lipid máu 13 ca (26 %); gút/tăng axit uric 10 ca (20 %); bệnh thận mạn giai đoạn 1–2: 8 ca (16 %) |
| Không có bệnh đồng mắc | 17 ca (chỉ đái tháo đường đơn thuần) |
| Tổng năng lượng đích (TDEE) | 1205 – 3520 Kcal/ngày (trung bình 2044,9) |

Chiều cao được sinh theo dải riêng cho từng giới, sau đó cân nặng được suy ra từ chỉ số BMI mục
tiêu theo quan hệ W = BMI × (H/100)². Các giá trị tuổi và BMI được trải đều hết biên độ rồi hoán
vị ngẫu nhiên, bảo đảm tập mẫu phủ kín cả hai đầu dải giá trị.

**Tiêu chí xác lập đáp án đúng (ground truth).** Đáp án đúng của mỗi kịch bản **không do mô hình
ngôn ngữ sinh ra**, mà được tính bằng chính động cơ sinh trắc tất định đã trình bày ở Mục III.B:
chuyển hóa cơ bản BMR theo phương trình Mifflin-St Jeor (công thức 3), tổng năng lượng tiêu hao
TDEE theo hệ số vận động PAL (công thức 4), và ngân sách đa lượng protein – lipid – carbohydrate
theo công thức (5), (6), (7) trên nền khuyến cáo ADA 2026. Thành phần dinh dưỡng của từng nguyên
liệu được tra cứu từ 621 bản ghi Bảng Thành phần Thực phẩm Việt Nam (FCDB 2017) đã số hóa. Vì
ground truth là hàm tất định của hồ sơ đầu vào nên nó hoàn toàn tái lập được và không mang tính
chủ quan.

**Hạn chế cần lưu ý về ground truth.** Khi áp dụng công thức (5) với hệ số pRatio = 2,0 g/kg cho
nhóm PAL > 1,5, tỷ lệ năng lượng từ protein của đáp án đúng đạt 20,4 % – 32,3 % TDEE, tức **40/50
kịch bản (80 %) có ground truth nằm ngoài dải 15 – 20 % mà ADA khuyến cáo**. Nhóm nghiên cứu giữ
nguyên công thức (5) và báo cáo minh bạch con số này. Hệ quả trực tiếp là chỉ số "tuân thủ đa
lượng" trong Bảng II phải được định nghĩa là *mức bám sát ngân sách P-L-C do động cơ sinh trắc kê
ra* (sai lệch ≤ 10 % ở cả ba chất), chứ không phải mức nằm trong dải phần trăm của ADA. Việc hiệu
chỉnh hệ số pRatio để ngân sách protein luôn thỏa dải ADA được để lại cho nghiên cứu tiếp theo.

#### 2) Cấu hình mô hình Baseline, tham số sinh và phương pháp tổng hợp kết quả

**Thiết kế đối chứng.** Hai nhánh được so sánh trên cùng một tập 50 kịch bản. **Biến độc lập duy
nhất là lượng thông tin đưa vào prompt**, mọi yếu tố khác — mô hình, tham số sinh, định dạng đầu
ra, quy trình bóc tách và quy tắc chấm điểm — đều giữ nguyên:

- **Nhánh Baseline (LLM đơn lẻ, không kiểm soát):** chỉ nhận hồ sơ bệnh nhân dưới dạng văn xuôi
  (giới tính, tuổi, chiều cao, cân nặng, bệnh lý, mức vận động). Không được cung cấp giá trị TDEE,
  không có ngân sách đa lượng, không truy xuất cơ sở dữ liệu FCDB và không áp dụng luật an toàn
  y khoa.
- **Nhánh NutriAI (hệ đa tác tử đề xuất):** ngoài hồ sơ trên còn nhận (i) ngân sách năng lượng và
  đa lượng do động cơ sinh trắc tính sẵn theo công thức (4)–(7); (ii) danh mục thực phẩm bản địa
  truy xuất từ CSDL FCDB theo cơ chế RAG, cân đối theo nhóm tinh bột – đạm – rau quả và ưu tiên
  thực phẩm có chỉ số đường huyết thấp; (iii) danh mục thực phẩm chống chỉ định của Guardrail Lớp 1.

Việc giữ nguyên định dạng đầu ra ở cả hai nhánh là có chủ đích: nếu chỉ nhánh NutriAI được yêu
cầu trả về cấu trúc chặt chẽ thì chênh lệch đo được sẽ lẫn cả hiệu ứng "dễ bóc tách hơn", làm
nhiễu kết luận.

**Hợp đồng đầu ra ở cấp nguyên liệu.** Cả hai nhánh đều phải trả về một đối tượng JSON trong đó
mỗi phần tử là **một nguyên liệu đơn đã cân theo gam** (ví dụ "Bánh phở", "Thịt gà ta", "Rau
muống"), kèm tên món mà nguyên liệu đó thuộc về. Ràng buộc này là bắt buộc về mặt phương pháp:
bảng thành phần thực phẩm chỉ chứa nguyên liệu đơn, nên nếu mô hình trả về tên món tổng hợp dạng
"Phở gà (súp gà không da, bánh phở nguyên cám)" thì không thể tra ngược giá trị dinh dưỡng thật
để kiểm chứng. Tỷ lệ đối chiếu thành công tên nguyên liệu với 621 bản ghi FCDB được ghi nhận và
báo cáo cùng kết quả.

**Hai thước đo sai số song song.** Sai số năng lượng được đo đồng thời theo hai cách, cho phép
tách bạch hai loại lỗi khác nhau của mô hình ngôn ngữ:

1. *Sai số theo FCDB* — tổng năng lượng của thực đơn được **tính lại** từ tên nguyên liệu và khối
   lượng gam, tra bảng FCDB, rồi so với TDEE đích. Đây là thước đo chính vì nó phản ánh giá trị
   dinh dưỡng thực của thực đơn.
2. *Sai số theo số tự khai* — tổng năng lượng do chính mô hình khai báo trong phản hồi, so với
   TDEE đích.

Hiệu của hai đại lượng trên được định nghĩa là **độ lệch tự khai báo** (*self-report bias*), lượng
hóa trực tiếp hiện tượng "ảo giác calo": mức chênh giữa con số mô hình tuyên bố và con số thực của
chính thực đơn nó vừa sinh ra.

**Tham số sinh.** Cả hai nhánh dùng mô hình `openai/gpt-oss-120b` trên hạ tầng Groq LPU với
`temperature = 0,1`, `top_p = 0,9`, `max_tokens = 2000`, `reasoning_effort = low` và
`response_format = json_object`. Tham số `reasoning_effort` là bắt buộc: GPT-OSS-120B là mô hình
suy luận, khi không giới hạn mức suy luận thì toàn bộ ngân sách token bị tiêu thụ ở kênh suy luận
nội bộ và trường `content` trả về rỗng — hiện tượng này được ghi nhận ở **20/20 lượt gọi** trong
mẻ chạy tiền đề trước khi hiệu chỉnh.

**Kiểm soát tính ngẫu nhiên và cách tổng hợp kết quả.** Do đầu ra của mô hình ngôn ngữ mang tính
bất định ngay cả ở nhiệt độ thấp, mỗi kịch bản được chạy lặp lại độc lập **N = 3 lần** ở mỗi
nhánh, tương ứng 50 × 2 × 3 = 300 lượt sinh thực đơn. Kết quả được tổng hợp theo hai tầng:

- *Tầng 1 — khử nhiễu trong kịch bản:* ba lần chạy của cùng một kịch bản và cùng một nhánh được
  lấy trung bình, thu về một giá trị đại diện cho mỗi ô (kịch bản × nhánh). Độ lệch chuẩn giữa các
  lần chạy của cùng một ô được lưu lại làm thước đo độ bất định nội tại của mô hình.
- *Tầng 2 — thống kê giữa các kịch bản:* các giá trị đại diện của 50 kịch bản được báo cáo dưới
  dạng Trung bình ± Độ lệch chuẩn và đưa vào kiểm định ghép cặp trình bày ở Mục IV.B.

Những lượt sinh không bóc tách được thành cấu trúc hợp lệ được đánh dấu `parse_ok = 0` và loại
khỏi phân tích thống kê, nhưng vẫn được giữ nguyên trong CSDL cùng phản hồi gốc để phục vụ kiểm
tra độc lập.

---

# ĐẦU RA 2 — Bảng II mới

## Bảng II. SAI SỐ DINH DƯỠNG VÀ MỨC ĐỘ TUÂN THỦ NGÂN SÁCH ĐA LƯỢNG

> ⚠ **Số liệu dưới đây thuộc mẻ chạy tiền đề trên 5/50 kịch bản (N = 5 cặp).** Đây chưa phải kết
> quả cuối cùng để đăng. Sau khi chạy đủ 50 kịch bản, chạy lại `python analysis/12_stats.py
> --batch full` để sinh bảng với N = 50.

| Chỉ số đánh giá | Baseline (LLM không kiểm soát) | NutriAI (hệ MAS) | Chênh lệch trung bình | 95 % CI | Kiểm định | p |
|---|---|---|---|---|---|---|
| Sai số Calo (Kcal) | 1051,0 ± 257,5 | 529,2 ± 188,3 | 521,8 | [148,9 ; 894,7] | Paired *t*-test | 0,027 |
| Sai số Protein (g) | 58,4 ± 20,9 | 57,8 ± 11,0 | 0,6 | [−26,9 ; 28,0] | Paired *t*-test | 0,937 |
| Sai số Lipid (g) | 34,3 ± 5,4 | 31,8 ± 11,3 | 2,4 | [−12,3 ; 17,2] | Paired *t*-test | 0,551 |
| Sai số Carb (g) | 128,7 ± 39,5 | 69,3 ± 23,5 | 59,4 | [−19,2 ; 138,0] | Paired *t*-test | 0,083 |
| Sai số Calo theo số tự khai (Kcal) | 844,1 ± 267,9 | 529,1 ± 188,5 | 315,0 | [−66,0 ; 696,0] | Paired *t*-test | 0,071 |
| **Độ lệch tự khai báo (Kcal)** | **282,3 ± 116,4** | **86,8 ± 149,9** | **195,6** | **[111,6 ; 279,5]** | Paired *t*-test | **0,010** |
| Tuân thủ ngân sách đa lượng (%) | 0,0 | 0,0 | 0,0 | [−56,1 ; 56,1] | McNemar (exact) | 1,000 |

### Chú thích chân bảng (đưa nguyên văn xuống dưới Bảng II)

> Giá trị trình bày dưới dạng Trung bình ± Độ lệch chuẩn, tính trên N = 5 kịch bản ghép cặp; mỗi
> ô là trung bình của 3 lần chạy độc lập (`temperature` = 0,1; `top_p` = 0,9; `reasoning_effort`
> = low). **Thiết kế mẫu ghép cặp** (*paired-samples design*): mỗi kịch bản lâm sàng được xử lý
> bởi cả hai hệ thống, do đó hai nhóm không độc lập. **Giả thuyết:** H₀: μ_Baseline = μ_NutriAI;
> H₁: μ_Baseline ≠ μ_NutriAI; kiểm định hai phía, α = 0,05. **Lựa chọn kiểm định:** tính chuẩn
> của hiệu số từng cặp được kiểm tra bằng Shapiro-Wilk; nếu p > 0,05 áp dụng *paired t-test*,
> ngược lại áp dụng *Wilcoxon signed-rank test* với khoảng tin cậy ước lượng bằng bootstrap
> 10.000 lần lặp. Chỉ số tuân thủ là biến nhị phân ghép cặp nên dùng *McNemar test* (phiên bản
> chính xác do số cặp bất đồng < 25), khoảng tin cậy hiệu hai tỷ lệ theo phương pháp Wilson.
> **Chênh lệch trung bình** = Baseline − NutriAI đối với các chỉ số sai số (giá trị dương nghĩa
> là NutriAI tốt hơn), và = NutriAI − Baseline đối với chỉ số tuân thủ. **Tuân thủ ngân sách đa
> lượng** được định nghĩa là thực đơn có cả ba chất protein, lipid và carbohydrate lệch không quá
> 10 % so với ngân sách do động cơ sinh trắc kê theo công thức (5)–(7). Sai số Calo ở bốn dòng
> đầu được tính lại từ tên nguyên liệu và khối lượng gam thông qua tra cứu CSDL FCDB 2017 (tỷ lệ
> đối chiếu thành công 76,6 %), không sử dụng con số do mô hình tự khai báo. Toàn bộ dữ liệu thô
> và kết quả kiểm định được lưu tại các bảng `exp_runs` và `exp_stat_tests` trên TiDB Cloud.

### Mã LaTeX (IEEEtran)

```latex
\begin{table}[!t]
\caption{Sai số dinh dưỡng và mức độ tuân thủ ngân sách đa lượng}
\label{tab:bang2}
\centering
\footnotesize
\begin{tabular}{lccccc}
\hline
\textbf{Chỉ số} & \textbf{Baseline} & \textbf{NutriAI} & \textbf{Chênh lệch} & \textbf{95\% CI} & \textbf{p} \\
\hline
Sai số Calo (Kcal)        & 1051,0 $\pm$ 257,5 & 529,2 $\pm$ 188,3 & 521,8 & [148,9; 894,7]   & 0,027 \\
Sai số Protein (g)        & 58,4 $\pm$ 20,9    & 57,8 $\pm$ 11,0   & 0,6   & [-26,9; 28,0]    & 0,937 \\
Sai số Lipid (g)          & 34,3 $\pm$ 5,4     & 31,8 $\pm$ 11,3   & 2,4   & [-12,3; 17,2]    & 0,551 \\
Sai số Carb (g)           & 128,7 $\pm$ 39,5   & 69,3 $\pm$ 23,5   & 59,4  & [-19,2; 138,0]   & 0,083 \\
Sai số Calo tự khai (Kcal)& 844,1 $\pm$ 267,9  & 529,1 $\pm$ 188,5 & 315,0 & [-66,0; 696,0]   & 0,071 \\
Độ lệch tự khai báo (Kcal)& 282,3 $\pm$ 116,4  & 86,8 $\pm$ 149,9  & 195,6 & [111,6; 279,5]   & 0,010 \\
Tuân thủ đa lượng (\%)    & 0,0                & 0,0               & 0,0   & [-56,1; 56,1]    & 1,000 \\
\hline
\end{tabular}
\end{table}
```

### Đoạn thuyết minh cho Mục IV.B (dùng kèm Bảng II)

> Thiết kế mẫu ghép cặp được lựa chọn vì mỗi kịch bản lâm sàng được xử lý đồng thời bởi cả mô hình
> Baseline và hệ NutriAI, do đó hai tập quan sát không độc lập với nhau. Giả thuyết không H₀ phát
> biểu rằng sai số dinh dưỡng trung bình của hai hệ là như nhau, đối lại với giả thuyết H₁ rằng
> hai giá trị này khác nhau. Tính chuẩn của phân phối hiệu số từng cặp được kiểm tra bằng kiểm
> định Shapiro-Wilk trước khi lựa chọn kiểm định tham số hay phi tham số, thay vì ấn định trước
> một loại kiểm định. Kết quả cho thấy hệ NutriAI làm giảm sai số năng lượng của thực đơn một cách
> có ý nghĩa thống kê, với chênh lệch trung bình 521,8 Kcal (95 % CI: 148,9 – 894,7 Kcal;
> p = 0,027; Cohen's d_z = 3,48). Đáng chú ý, độ lệch tự khai báo — chênh giữa tổng năng lượng mô
> hình tuyên bố và tổng năng lượng thực của chính thực đơn đó — giảm từ 282,3 Kcal ở nhánh Baseline
> xuống 86,8 Kcal ở nhánh NutriAI (p = 0,010; d_z = 5,79), cho thấy việc cung cấp ngân sách dinh
> dưỡng đã tính sẵn và danh mục thực phẩm có trị số chuẩn không chỉ cải thiện chất lượng thực đơn
> mà còn làm giảm đáng kể hiện tượng mô hình khai sai chính đầu ra của mình.

---

## Những điểm cần chốt trước khi đưa vào bản thảo

1. **Số liệu Bảng II hiện là mẻ tiền đề N = 5.** Cần chạy đủ 50 kịch bản. Hạn mức Groq gói
   on-demand là 200.000 token/ngày, mẻ đủ 300 lượt cần khoảng 1 triệu token ⇒ hoặc nâng lên gói
   Dev Tier, hoặc chia làm 5 ngày (script chạy lại được, không ghi trùng).
2. **Sai số Protein và Lipid hiện không khác biệt có ý nghĩa** (p = 0,937 và p = 0,551). Nguyên
   nhân đã phân tích ở IV.A.1: ngân sách protein do công thức (5) kê ra quá cao nên cả hai hệ đều
   không đạt. Nếu kết quả này giữ nguyên trên N = 50 thì **không thể giữ các con số "giảm 75,6 %"
   và "73,2 %" của bản thảo cũ**.
3. **Chỉ số tuân thủ đang bằng 0 % ở cả hai nhánh** với ngưỡng ±10 %. Cần cân nhắc nới ngưỡng
   (ví dụ ±15 % hoặc chỉ xét năng lượng và carbohydrate), và phải nêu rõ ngưỡng đã chọn trong
   chú thích bảng.
4. **Dòng "Độ lệch tự khai báo" là chỉ số mới**, không có trong bản thảo cũ. Nhóm nên cân nhắc
   đưa vào như một đóng góp bổ sung, vì nó định lượng trực tiếp hiện tượng "ảo giác calo" mà phần
   Mở đầu đã nêu.
5. **Mục III.B cần bổ sung `reasoning_effort`** vào phần mô tả tham số sinh, kèm giải thích tại
   sao tham số này bắt buộc với mô hình suy luận.
