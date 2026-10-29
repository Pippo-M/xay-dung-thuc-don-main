# 🌱 Hệ thống Tư vấn Dinh dưỡng Cá nhân hóa - NutriAI

Chào mừng bạn đến với **NutriAI**! Đây là một dự án ứng dụng Trí tuệ Nhân tạo (LLM) kết hợp với kiến thức y khoa để tự động hóa việc tính toán sinh trắc học, lập thực đơn cá nhân hóa và quản lý nhắc nhở dinh dưỡng qua email.

---

## 🚀 1. Hướng dẫn Cài đặt & Khởi động Server (Local)

Để chạy dự án này trên máy tính cá nhân của bạn, vui lòng thực hiện theo các bước sau:

### Yêu cầu hệ thống:
- Đã cài đặt **Node.js** (Phiên bản 18.x trở lên).
- Có tài khoản Gmail (để tạo App Password gửi mail).
- Có tài khoản TiDB Cloud hoặc MySQL Local.

### Bước 1: Cài đặt thư viện
Mở Terminal (hoặc Git Bash), di chuyển vào thư mục `Server` và cài đặt các gói phụ thuộc:
```bash
cd Server
npm install
```

### Bước 2: Cấu hình Biến môi trường (.env)
Tạo một file có tên `.env` bên trong thư mục `Server` và điền các thông số sau:

```env
# 1. Cấu hình Cổng & Bảo mật
PORT=5000
JWT_SECRET=nutri_secret_key_123_very_secure

# 2. Cấu hình Cơ sở dữ liệu (TiDB Cloud / MySQL)
DB_HOST=gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com
DB_USER=1eL7eJEUbMWenqV.root
DB_PASSWORD=your_tidb_password
DB_NAME=test
DB_PORT=4000

# 3. Cấu hình AI Engine (Groq)
GROQ_API_KEY=gsk_your_groq_api_key_here

# 4. Cấu hình Email Nhắc lịch (Nodemailer)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password

# 5. Cấu hình Phân quyền
ADMIN_EMAIL=minhdzquaa@gmail.com
```

### Bước 3: Khởi động Server
Tại thư mục `Server`, chạy lệnh:
```bash
npm start
```
Nếu Terminal hiển thị dòng chữ:
- `Connected to MySQL database.`
- `Server is running on port 5000`

=> **Thành công!** Bạn có thể mở trình duyệt và truy cập: `http://localhost:5000` (hoặc mở trực tiếp file `Client/index.html`).

---

## 🎯 2. Trải nghiệm Toàn bộ Chức năng Hệ thống

Dưới đây là "Kịch bản Trải nghiệm" (User Journey) để bạn test toàn bộ sức mạnh của NutriAI:

### 🌟 Tính năng 1: Phân tích Sinh trắc học & Khởi tạo Hồ sơ
1. Truy cập trang chủ, nhấn **Đăng nhập với Google** hoặc tạo tài khoản mới.
2. Di chuyển đến phần "Tính BMI & Calo".
3. Nhập các thông số: Tuổi, Giới tính, Chiều cao, Cân nặng.
4. **Quan trọng:** Ghi **"Gout"** hoặc **"Tiểu đường"** vào ô Bệnh nền.
5. Nhấn "Tính toán ngay" để xem hệ thống phân loại thể trạng và tự động gán lượng Calo mục tiêu.

### 🤖 Tính năng 2: Chatbot AI & Cảnh báo Y khoa (Safety Guard)
1. Mở khung chat (biểu tượng 💬 góc phải dưới).
2. Nhấn nút "Thực đơn 7 ngày" hoặc chat: *"Hãy lên cho tôi thực đơn tuần này."*
3. **TEST CẢNH BÁO:** Nếu bạn đã điền bệnh nền là "Gout", hãy chat câu lệnh "gài bẫy": *"Lên cho tôi thực đơn bữa trưa có món thịt bò xào."*
4. **Kết quả:** Hệ thống sẽ ngay lập tức bắt lỗi, chèn một **Hộp Cảnh Báo Đỏ** từ chối cung cấp thịt bò, giải thích lý do y khoa (gây tăng axit uric) và đề xuất món ăn an toàn hơn (ví dụ: Ức gà).

### 💾 Tính năng 3: Quản lý Lịch trình & Xuất bản Dữ liệu
1. Sau khi AI đưa ra một thực đơn ưng ý, ở cuối tin nhắn sẽ có 2 nút.
2. Nhấn **Tải (Excel)**: Trình duyệt sẽ tải về file `Ho_So_Dinh_Duong_NutriAI.xlsx` với định dạng bảng biểu y tế chuẩn, chia cột rõ ràng.
3. Nhấn **Lưu hồ sơ**: Hệ thống sẽ ghi nhận thực đơn này vào cơ sở dữ liệu đám mây.

### 📧 Tính năng 4: Hệ thống Nhắc lịch Tự động (Cron Job Email)
*Hệ thống được thiết lập chạy ngầm để gửi mail vào 3 khung giờ (7h, 12h, 19h). Để test nhanh mà không cần chờ đợi:*
1. Mở tab trình duyệt mới, gõ đường dẫn: `http://localhost:5000/api/admin/test-email?uid=1` (Thay số 1 bằng User ID của bạn nếu cần).
2. Kiểm tra hộp thư Gmail.
3. Bạn sẽ nhận được một Email có thiết kế chuyên nghiệp (chuẩn form ngân hàng), chứa ĐẦY ĐỦ các món ăn mà bạn đã "Lưu hồ sơ" ở bước trước.

### 👑 Tính năng 5: Bảng điều khiển Quản trị (Admin Dashboard)
1. Đăng nhập bằng tài khoản có email là `ADMIN_EMAIL` (cấu hình trong `.env`).
2. Nhấp vào tên tài khoản trên thanh điều hướng, chọn **Admin Panel** (Hoặc truy cập `admin.html`).
3. Trải nghiệm giao diện quản trị:
   - Theo dõi biểu đồ số lượng người dùng mới (Line chart) và tỉ lệ bệnh lý (Doughnut chart).
   - Xem bảng thông số API Token còn lại của Groq theo thời gian thực (Real-time limits).
   - Quản lý danh sách người dùng (Chức năng Xóa tài khoản).

---
*Phát triển bởi đội ngũ NutriAI - Hệ thống được bảo lưu bản quyền.*
