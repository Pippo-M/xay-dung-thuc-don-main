# Đưa NutriAI lên mạng (Render) để dùng trên điện thoại

Sau khi làm xong, điện thoại mở được **`https://<tên-dịch-vụ>.onrender.com/app`**:
- đăng nhập Google hoặc email thật;
- hồ sơ lưu trên TiDB;
- chatbot trả lời bằng GPT-OSS-120B qua Groq, mỗi câu trả lời qua Lớp 1 và Lớp 2;
- bấm "Đã ăn" là ghi vào `meal_items` và `daily_nutrition_summary`.

Trang web cũ vẫn ở địa chỉ gốc `/`, trang quản trị ở `/admin.html`.

Thời gian: khoảng 30 phút. Bạn cần các tài khoản GitHub, Render, TiDB Cloud, Groq và Firebase. Bạn đã từng dùng Render (`neutrionai.onrender.com`).

---

## Bước 0 — Đổi mật khẩu TiDB (bắt buộc, làm trước)

Bản `Server/server.js` trước đây **ghi thẳng mật khẩu TiDB trong mã nguồn**. Nếu repo GitHub từng công khai thì coi như mật khẩu đã lộ.

1. Vào TiDB Cloud → chọn cluster → **Connect** → **Reset password**.
2. Ghi lại mật khẩu mới để dùng ở Bước 2.

Mã nguồn mới đã bỏ mật khẩu này. Server giờ **bắt buộc** đọc thông tin kết nối từ biến môi trường, thiếu là dừng ngay.

Nếu repo cũ từng có file `Server/serviceAccount.json` (khóa riêng Firebase), hãy tạo khóa mới rồi xóa khóa cũ:
- Firebase Console → Project settings → **Service accounts** → **Generate new private key**.
- Xóa khóa cũ trong Google Cloud Console → IAM → Service accounts.

## Bước 1 — Đưa mã nguồn lên GitHub

Máy này chưa cài Git, nên dùng cách tải file qua giao diện web.

1. Tạo repo **Private** mới trên GitHub, hoặc mở repo cũ đang nối với Render.
2. Bấm **Add file → Upload files**, kéo vào các thư mục và file sau:
   - `Server/` — chỉ gồm `server.js`, `nutrition_engine.js`, `package.json`, `package-lock.json`, `.env.example` và các thư mục `db/`, `data/`, `scripts/`, `analysis/`
   - `Client/`, `mobile/`, `docs/`
   - `render.yaml`, `.gitignore`, `README.md`
3. **KHÔNG tải lên:**
   - `Server/serviceAccount.json` và `Server/.env`: chứa khóa bí mật. Tải qua web sẽ **không** tự bỏ qua các file trong `.gitignore`.
   - `Server/node_modules`, `Server/database.sqlite`
   - `Ho_So_Dinh_Duong_Ca_Nhan.xlsx`, nếu file này chứa dữ liệu người thật.
4. Bấm **Commit changes**.

## Bước 2 — Tạo dịch vụ trên Render

**Cách A — tạo mới (khuyên dùng):**
1. Render → **New → Blueprint** → chọn repo vừa tải. Render đọc `render.yaml` và tự đặt lệnh build/start.
2. Render hỏi giá trị cho các biến đánh dấu bí mật. Điền:

| Biến | Lấy ở đâu |
|---|---|
| `DB_HOST`, `DB_USER`, `DB_NAME` | TiDB Cloud → Connect (giống trong `.env` cũ) |
| `DB_PASSWORD` | mật khẩu **mới** ở Bước 0 |
| `GROQ_API_KEY` | console.groq.com → API Keys |
| `FIREBASE_SERVICE_ACCOUNT` | mở file JSON khóa Firebase, copy **toàn bộ** nội dung rồi dán vào |
| `ADMIN_EMAIL` | email tài khoản quản trị |
| `EMAIL_USER`, `EMAIL_PASS` | Gmail và App Password (dùng cho email nhắc bữa) |

`JWT_SECRET` do Render tự sinh; `TZ`, `DB_PORT`, `GROQ_MODEL` đã có sẵn.

3. Bấm **Apply** và chờ build xong (khoảng 3–5 phút).

**Cách B — dùng lại dịch vụ cũ:**
1. Settings → **Root Directory** để trống.
2. **Build Command:** `cd Server && npm install`
3. **Start Command:** `cd Server && npm start`
4. Thêm các biến trong bảng trên ở tab **Environment**, kèm `TZ=Asia/Ho_Chi_Minh`.

**Kiểm tra:**
- Tab **Logs** phải có 2 dòng `Connected to MySQL database.` và `Server is running on port …`.
- Mở `https://<tên>.onrender.com/healthz` phải thấy `{"ok":true}`.
- Lần chạy đầu, nếu bảng `foods` còn trống, server tự nạp 621 thực phẩm. Log sẽ in `Bảng foods trống — đang nạp FCDB…`.

## Bước 3 — Cho phép đăng nhập Google trên tên miền mới

Firebase Console → **Authentication → Settings → Authorized domains → Add domain** → nhập `<tên>.onrender.com`.

Bỏ qua bước này thì nút "Tiếp tục với Google" sẽ báo lỗi `auth/unauthorized-domain`. Đăng nhập bằng email vẫn chạy bình thường.

## Bước 4 — Mở trên điện thoại

1. Mở `https://<tên>.onrender.com/app` bằng Chrome (Android) hoặc Safari (iPhone).
2. Chọn **Thêm vào màn hình chính** để dùng như một app.
3. Đăng nhập → app gợi ý liên kết EMR (tính năng dự kiến) → chọn **Nhập thủ công** → điền hồ sơ 5 bước.
4. Hồ sơ được lưu lên máy chủ. Đăng nhập trên máy khác là có ngay.

---

## Lưu ý

- **Gói miễn phí của Render ngủ sau 15 phút không ai truy cập.** Lần mở đầu tiên sau đó mất khoảng 50 giây. Khi server đang ngủ, email nhắc bữa (09:00, 12:00, 18:00 theo `server.js`) **không được gửi**. Muốn nhắc đúng giờ cần gói trả phí hoặc dịch vụ ping định kỳ.
- **Giờ nhắc trong code (9h/12h/18h) khác bài báo (07:00/12:00/19:00).** Sửa ở cuối `Server/server.js`, các dòng `cron.schedule`.
- **"Tạo thực đơn" dùng bộ tính tất định, không gọi AI.** Ứng dụng lấy thực đơn mẫu từ FCDB rồi co giãn theo TDEE, sau đó cân lại cho lệch dưới 50 kcal. Phần gọi AI là chatbot "Hỏi NutriAI".
- **Lớp 2 dùng `max_tokens = 100` như bài báo.** GPT-OSS-120B là mô hình suy luận, nên đôi khi dùng hết số token để suy luận và trả về rỗng. Khi đó app coi như không có cảnh báo; Lớp 1 vẫn luôn chạy.
- **Danh sách món không ăn và món yêu thích chỉ lưu trên từng điện thoại**, vì bảng `users` chưa có cột cho phần này.
- **API kiểm tra email `/api/admin/test-email` giờ cần token admin.** Thêm `?token=<token đăng nhập admin>` vào cuối đường dẫn.

## Gặp lỗi

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Log báo `Thiếu biến môi trường: …` | Chưa điền biến đó trên Render |
| Log báo `Lỗi khởi tạo MySQL: Access denied` | Sai `DB_USER`/`DB_PASSWORD`, hoặc chưa dùng mật khẩu mới |
| Chat báo `Chưa cấu hình GROQ_API_KEY` | Thiếu `GROQ_API_KEY` |
| Google báo `unauthorized-domain` | Chưa làm Bước 3 |
| Google báo `Xác thực Google qua Firebase thất bại` | `FIREBASE_SERVICE_ACCOUNT` sai hoặc dán thiếu |
| Lưu hồ sơ báo lỗi | Xem Logs. Lược đồ được áp tự động khi khởi động, nên lỗi thường do mất kết nối TiDB |
