# Prompt thiết kế ứng dụng di động NutriAI

Tài liệu gồm 2 bản:
- **Bản đầy đủ**: dán vào công cụ thiết kế/sinh giao diện (Figma AI, v0, Lovable, Claude, Galileo, Uizard…) hoặc giao cho designer.
- **Bản rút gọn**: cho công cụ giới hạn độ dài prompt.

Mọi con số, công thức và luật an toàn trong prompt được lấy trực tiếp từ `Server/nutrition_engine.js`,
`Server/server.js` (CONTRAINDICATIONS) và `docs/LUONG_DU_LIEU_CONG_THUC.md` — khi code thay đổi thì cập nhật prompt theo.

---

## BẢN ĐẦY ĐỦ

```
VAI TRÒ
Bạn là Product Designer + UX Writer cấp cao chuyên về ứng dụng sức khỏe (mHealth).
Hãy thiết kế ứng dụng di động "NutriAI" (iOS + Android, khung 390×844), giao diện tiếng Việt.

1. NUTRIAI LÀ GÌ (CỐT LÕI KHÔNG ĐƯỢC THAY ĐỔI)
NutriAI là AI Agent lập thực đơn cá nhân hóa cho người Việt, đặc biệt người có bệnh nền
(Tiểu đường, Gút, Cao huyết áp, Đau dạ dày/Đại tràng, Gan nhiễm mỡ).
Điểm khác biệt: KHÔNG để AI tự bịa thực đơn. Mỗi thực đơn đi qua một vòng khép kín:

  Hồ sơ người dùng
   → Bộ tính nhu cầu dinh dưỡng (công thức chuẩn, tính bằng code, không phải AI)
   → AI lập thực đơn (LLM GPT-OSS-120B qua Groq) chỉ được chọn món từ CSDL 621 thực phẩm Việt Nam
   → Lá chắn an toàn 2 lớp (Lớp 1: luật chống chỉ định theo bệnh; Lớp 2: AI kiểm duyệt lại, nhiệt độ 0.1)
   → Nếu vi phạm: chặn món, giải thích lý do y khoa, đề xuất món thay thế an toàn
   → Lưu từng món vào nhật ký → tính tổng ngày → calo còn lại trở thành ngân sách cho bữa tiếp theo

Giao diện phải làm cho người dùng NHÌN THẤY và TIN được vòng khép kín này:
con số đến từ đâu, vì sao món bị chặn, còn bao nhiêu calo cho bữa sau.

2. NGƯỜI DÙNG MỤC TIÊU
- Chính: người trưởng thành có bệnh nền đái tháo đường, 
  (nhiều người 40–65 tuổi, không rành công nghệ).
→ Chữ thân tối thiểu 16pt, vùng chạm ≥ 48×48dp, tương phản WCAG AA, ngôn ngữ đời thường,
  thuật ngữ y khoa luôn có giải thích ngắn (chạm vào icon "i").

3. DỮ LIỆU & CÔNG THỨC (hiển thị trung thực, đúng đơn vị)
Đầu vào hồ sơ: tuổi, giới tính (Nam/Nữ), chiều cao (cm), cân nặng (kg),
mức vận động PAL (1.2 Ít vận động · 1.375 Nhẹ 1–3 ngày/tuần · 1.55 Vừa 3–5 ngày/tuần · 1.725 Nhiều 6–7 ngày/tuần),
bệnh nền (chọn nhiều), dị ứng/món không ăn, món yêu thích, số bữa/ngày.

Kết quả tính (hiển thị kèm công thức khi người dùng chạm "Xem cách tính"):
 (1) BMI = Cân nặng / (Chiều cao/100)²  → phân loại: <18.5 Thiếu cân · <25 Bình thường · <30 Tiền béo phì · ≥30 Béo phì
 (2) Cân nặng lý tưởng = (Chiều cao − 100) × 0.9
 (3) BMR = 10×W + 6.25×H − 5×Tuổi + S   (S = +5 nam, −161 nữ)
 (4) TDEE = BMR × PAL   ← mục tiêu calo/ngày
 (5) Đạm P = W × 1.5 g/kg (PAL ≤ 1.5) hoặc 2.0 g/kg (PAL > 1.5)
 (6) Béo L = TDEE × 25% / 9
 (7) Bột đường C = (TDEE − (4P + 9L)) / 4
 Dải chuẩn ADA để tô màu đạt/chưa đạt: Đạm 15–20% · Béo 20–30% · Bột đường 45–60% năng lượng.
 (9) Tải lượng đường huyết GL món = GI × Carb(g) / 100; GL ngày = tổng các món.
     Mức rủi ro: ≤10 Thấp (xanh) · 10–20 Trung bình (vàng) · ≥20 Cao (đỏ).
     Nếu món chưa có dữ liệu GI → hiển thị "Chưa có GI" (KHÔNG hiển thị 0).
 (10) Ngày "đạt mục tiêu" khi |Calo đã ăn − TDEE| < 50 kcal.

Ví dụ dữ liệu mẫu để dựng màn hình: Nam 45 tuổi, 170 cm, 75 kg, PAL 1.55
→ BMI 26.0 (Tiền béo phì), Cân nặng lý tưởng 63 kg, BMR 1592 kcal, TDEE 2468 kcal,
  Đạm 150 g, Béo 69 g, Bột đường 312 g.
Ví dụ đổi món: Xôi nếp 200 g (GI 86, GL 129.2) → Gạo lứt 200 g (GI 68, GL 103.6): giảm 19.8% GL.

Luật chống chỉ định (Lớp 1) dùng cho nội dung mẫu:
- Gút: thịt bò, thịt chó, hải sản, nội tạng, bia, rượu, tôm, cua, ghẹ — "làm tăng axit uric, gây đau khớp cấp"
- Tiểu đường: đường, kẹo, nước ngọt, bánh mì trắng, mật ong, chè, sữa đặc — "GI cao gây tăng đường huyết đột ngột"
- Cao huyết áp: muối, dưa muối, mắm, mỡ động vật, cà phê — "nhiều Natri/chất kích thích"
- Gan nhiễm mỡ: mỡ lợn, nội tạng, đồ chiên, rượu, bia, đồ nướng — "tăng gánh nặng cho gan"
- Dạ dày: ớt, tiêu, rượu, bia, chanh, quất, đồ chua — "kích ứng niêm mạc"

4. KIẾN TRÚC ĐIỀU HƯỚNG
Thanh tab dưới 5 mục: Hôm nay · Thực đơn · [nút giữa nổi: Hỏi NutriAI] · Nhật ký · Hồ sơ.

5. DANH SÁCH MÀN HÌNH CẦN THIẾT KẾ
A. Khởi động
 A1 Splash + 3 màn giới thiệu: "Tính đúng nhu cầu" · "AI chọn món từ 621 thực phẩm Việt" · "Lá chắn an toàn theo bệnh nền".
 A2 Đăng nhập: Google, email/mật khẩu.
 A3 Thiết lập hồ sơ dạng từng bước (stepper 5 bước, mỗi bước 1 câu hỏi, có thanh tiến độ):
    giới tính+tuổi → chiều cao+cân nặng (thước cuộn) → mức vận động (thẻ minh họa) →
    bệnh nền (chip chọn nhiều, có "Không có") → dị ứng/món không ăn/món thích.
 A4 Kết quả sinh trắc: thẻ BMI với thang màu, TDEE nổi bật, vòng tròn 3 đa lượng P/L/C,
    nhãn "Đạt chuẩn ADA" hoặc cảnh báo dải nào lệch, nút "Xem cách tính" mở bottom sheet công thức (1)–(7)
    điền sẵn số của người dùng.

B. Hôm nay (Dashboard — màn quan trọng nhất)
 - Vòng calo lớn: "Còn lại X kcal" = TDEE − đã ăn; vạch ±50 kcal thể hiện vùng đạt mục tiêu.
 - 3 thanh đa lượng Đạm/Béo/Bột đường (đã ăn / mục tiêu).
 - Thẻ GL ngày với đèn 3 màu (chỉ hiện nổi bật nếu người dùng có Tiểu đường).
 - Dòng thời gian Bữa sáng / Bữa trưa / Bữa tối: mỗi bữa hiển thị món, gram, kcal, GL;
   bữa chưa ăn hiển thị "Ngân sách bữa này: ~Y kcal" (lấy từ calo còn lại — thể hiện vòng lặp khép kín).
 - Nút "Đã ăn" / "Ăn khác đi" trên từng bữa.
 - Thẻ nhắc nhở bữa kế tiếp.

C. Thực đơn
 C1 Tạo thực đơn: chọn 1 ngày / 7 ngày, số bữa, món ưu tiên → nút "Tạo bằng AI".
 C2 Màn chờ sinh thực đơn: hiển thị tiến trình THẬT theo các bước của Agent
    ("Đang tính nhu cầu" → "AI đang chọn món" → "Kiểm tra an toàn lớp 1" → "Kiểm tra an toàn lớp 2" → "Cân đối calo").
 C3 Thực đơn 7 ngày: thanh chọn ngày ngang, mỗi ngày là danh sách bữa; badge tổng kcal và "Đạt ±50 kcal" / "Lệch X kcal".
 C4 Chi tiết món: ảnh, khối lượng (g, chỉnh được bằng stepper → số liệu tự tính lại), kcal, P/L/C, GI + nhóm GI,
    GL món, nguồn dữ liệu GI (Tài liệu công bố / Ước tính theo nhóm — cần chuyên gia rà soát).
 C5 Đổi món: danh sách món thay thế cùng nhóm, sắp theo GL thấp hơn, hiện "−x% GL" và chênh lệch kcal.
 C6 Hành động: Lưu vào nhật ký · Xuất Excel · Chia sẻ cho người thân.

D. Hỏi NutriAI (Chatbot)
 - Chat bong bóng, gợi ý nhanh: "Thực đơn 7 ngày", "Bữa trưa dưới 600 kcal", "Món thay cơm trắng", "Tôi bị Gút ăn gì?".
 - Câu trả lời chứa thực đơn hiển thị dạng THẺ CÓ CẤU TRÚC (không phải đoạn văn markdown) kèm nút Lưu / Xuất Excel.
 - HỘP CẢNH BÁO AN TOÀN (thành phần trọng tâm): khi người dùng hỏi món bị chống chỉ định
   (ví dụ người bị Gút hỏi "thịt bò xào"), hiển thị thẻ viền đỏ:
     icon khiên · "Món này không phù hợp với bệnh Gút của bạn" · lý do y khoa 1 câu ·
     nhãn nguồn chặn ("Lớp 1 – Luật y khoa" hoặc "Lớp 2 – AI kiểm duyệt") ·
     thẻ món thay thế an toàn (ví dụ Ức gà) với nút "Dùng món này".
 - Mọi câu trả lời có dòng nhỏ: "Thông tin tham khảo, không thay thế tư vấn của bác sĩ/chuyên gia dinh dưỡng."

E. Nhật ký & Tiến trình
 - Lịch tháng: mỗi ngày tô màu theo đạt/lệch mục tiêu calo.
 - Biểu đồ 7/30 ngày: calo vs TDEE, GL ngày, cân nặng.
 - Chi tiết 1 ngày: danh sách món đã ăn, món nào là món được AI thay thế (nhãn "Đã thay vì: …").

F. Hồ sơ & Cài đặt
 - Chỉ số cơ thể, cập nhật cân nặng (tự tính lại mục tiêu, có thông báo "Mục tiêu đã cập nhật: …").
 - Bệnh nền, dị ứng, món không ăn.
 - Nhắc bữa ăn: 3 khung giờ tùy chỉnh (thông báo đẩy + email), bật/tắt từng bữa.
 - Hồ sơ gia đình: thêm nhiều thành viên, chuyển nhanh giữa các hồ sơ.
 - Quyền riêng tư: xuất dữ liệu, xóa tài khoản.

6. TRẠNG THÁI BẮT BUỘC PHẢI CÓ
- Rỗng (chưa có hồ sơ / chưa có thực đơn) với lời mời hành động rõ ràng.
- Đang tải (skeleton), lỗi mạng, AI quá tải (hết hạn mức) — có nút thử lại.
- Món thiếu dữ liệu GI → "Chưa có GI", tổng GL ngày hiển thị "Chưa đủ dữ liệu".
- Hồ sơ thiếu thông tin → không tính TDEE, chỉ ra trường còn thiếu.
- Cảnh báo khi BMI < 18.5 hoặc ≥ 30, hoặc đạm vượt 20% TDEE (gợi ý hỏi chuyên gia).

7. NGÔN NGỮ THIẾT KẾ
- Phong cách: y tế đáng tin cậy nhưng ấm áp, gần gũi bữa cơm gia đình Việt; sạch, nhiều khoảng trắng, bo góc 16–20px.
- Màu: chủ đạo xanh ngọc #00796B (thương hiệu hiện tại), nền #F7FAF9, phụ xanh dương #1976D2;
  trạng thái: Đạt #2E7D32 · Cảnh báo #F9A825 · Nguy hiểm #C62828. Có chế độ tối.
- Font: Be Vietnam Pro (hỗ trợ đầy đủ dấu tiếng Việt). Số liệu dùng chữ số đều (tabular).
- Màu đa lượng cố định toàn app: Đạm, Béo, Bột đường mỗi loại 1 màu, luôn kèm nhãn chữ (không chỉ dựa vào màu).
- Icon nét tròn, minh họa món ăn Việt (cơm, canh, rau luộc, cá kho…).

8. ĐẦU RA MONG MUỐN
1) Sơ đồ luồng người dùng (onboarding → tạo thực đơn → bị chặn món → đổi món → lưu → nhật ký).
2) Design system: màu, typography, khoảng cách, các component (thẻ món, vòng calo, thanh đa lượng,
   đèn GL, hộp cảnh báo an toàn, chip bệnh nền, bottom sheet công thức).
3) Hi-fi mockup cho tất cả màn hình mục 5 ở chế độ sáng, và các màn B, C3, D ở chế độ tối.
4) Ghi chú tương tác/animation cho vòng calo, màn chờ Agent, hộp cảnh báo.
5) Ánh xạ dữ liệu: mỗi màn ghi rõ dùng API nào:
   POST /api/auth/login | /api/auth/google · GET/PUT /api/user/profile · POST /api/user/targets ·
   GET /api/foods · POST /api/chat/generate · POST /api/user/meals ·
   GET/POST/DELETE /api/user/schedules · POST /api/export-excel

9. RÀNG BUỘC
- Không bịa số liệu dinh dưỡng; mọi số trên mockup phải tính đúng theo công thức mục 3.
- Không dùng ngôn ngữ chẩn đoán/điều trị ("chữa", "khỏi bệnh"); chỉ "gợi ý", "phù hợp", "nên hạn chế".
- Cảnh báo an toàn luôn nổi bật hơn mọi nội dung khác và không thể vô tình bỏ qua.
- Không thiết kế mua bán, quảng cáo hay gamification gây áp lực ăn uống.
```

---

## BẢN RÚT GỌN

```
Thiết kế app di động "NutriAI" (iOS/Android, 390×844, tiếng Việt): AI Agent lập thực đơn cá nhân hóa
cho người Việt có bệnh nền tập trung vào Tiểu đường theo như file bài báo 2020.docx (Và phụ là  Gút, Cao huyết áp, Dạ dày, Gan nhiễm mỡ).
Cốt lõi: hồ sơ → code tính BMI/BMR (Mifflin-St Jeor)/TDEE=BMR×PAL/đạm-béo-bột đường theo ADA →
AI (GPT-OSS-120B) chỉ chọn món từ CSDL 621 thực phẩm Việt → lá chắn an toàn 2 lớp chặn món chống chỉ định,
giải thích lý do, đề xuất món thay → lưu nhật ký → calo còn lại thành ngân sách bữa sau (vòng khép kín).
Hiển thị GL = GI×Carb/100 (≤10 xanh, 10–20 vàng, ≥20 đỏ) và mục tiêu đạt khi lệch TDEE < 50 kcal.
Tab: Hôm nay · Thực đơn · [Hỏi NutriAI] · Nhật ký · Hồ sơ.
Màn chính: onboarding 5 bước, kết quả sinh trắc có "Xem cách tính", dashboard vòng "Còn lại X kcal",
thực đơn 7 ngày, chi tiết món chỉnh gram, đổi món theo GL thấp hơn, chatbot với HỘP CẢNH BÁO ĐỎ khi hỏi món cấm
(vd người bị Gút hỏi thịt bò → chặn, nêu lý do axit uric, gợi ý ức gà), nhắc bữa 3 khung giờ, hồ sơ gia đình.
Phong cách y tế ấm áp, xanh ngọc #00796B, font Be Vietnam Pro, chữ ≥16pt, chạm ≥48dp, WCAG AA, có dark mode.
Dữ liệu mẫu: Nam 45t, 170cm, 75kg, PAL 1.55 → BMI 26.0, TDEE 2468 kcal, Đạm 150g, Béo 69g, Bột đường 312g.
Không bịa số liệu, không dùng từ "chữa bệnh", luôn có dòng "không thay thế tư vấn bác sĩ".
Xuất: user flow, design system, hi-fi mockup mọi màn, ghi chú tương tác.
```
