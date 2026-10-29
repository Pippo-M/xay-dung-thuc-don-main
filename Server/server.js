const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const admin = require('firebase-admin');
const ExcelJS = require('exceljs');
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const engine = require('./nutrition_engine'); // công thức (1)-(10) — nguồn chân lý duy nhất
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Không còn giá trị mặc định cho thông tin bí mật: thiếu biến môi trường thì dừng ngay,
// tránh việc server chạy công khai với mật khẩu/khóa nằm trong mã nguồn.
const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
    console.error(`Thiếu biến môi trường: ${missingEnv.join(', ')}. Xem Server/.env.example.`);
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// Cấu hình kết nối MySQL (Dễ dàng quản lý bằng HeidiSQL)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 4000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
});

// Khởi tạo Firebase Admin
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("Firebase Admin: Khởi tạo qua biến môi trường.");
  } else {
    serviceAccount = require("./serviceAccount.json");
    console.log("Firebase Admin: Khởi tạo qua file serviceAccount.json.");
  }

  initializeApp({
    credential: cert(serviceAccount)
  });
} catch (error) {
  console.error("Lỗi khởi tạo Firebase Admin:", error.message);
}

async function initDB() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('Connected to MySQL database.');
    } catch (err) {
        console.error('Không kết nối được MySQL:', err.message);
        process.exit(1);
    }
    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                age INT,
                gender VARCHAR(10),
                height FLOAT,
                weight FLOAT,
                disease TEXT,
                avatar TEXT,
                role VARCHAR(20) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS schedules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                date VARCHAR(50),
                meal_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await applySchema(connection);

        // CSDL mới chưa có 621 thực phẩm: nạp nền bằng chính script seed (không chặn khởi động)
        const [[{ n }]] = await connection.query('SELECT COUNT(*) AS n FROM foods');
        if (Number(n) === 0) {
            console.log('Bảng foods trống — đang nạp FCDB bằng scripts/02_seed_foods.js...');
            require('child_process').fork(path.join(__dirname, 'scripts', '02_seed_foods.js'));
        }
    } catch (err) {
        console.error('Lỗi khởi tạo MySQL:', err.message);
        await logDbDiagnostics(connection);
        // Thiếu quyền CREATE nhưng bảng đã có sẵn thì vẫn phục vụ được; chưa có bảng thì dừng.
        let ready = false;
        try {
            const [[{ n }]] = await connection.query(
                "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('users', 'schedules')");
            ready = Number(n) === 2;
        } catch (e) { /* bỏ qua, coi như chưa sẵn sàng */ }
        if (!ready) { connection.release(); process.exit(1); }
        console.warn('Bảng users và schedules đã có sẵn — server vẫn chạy, nhưng tài khoản CSDL đang thiếu quyền tạo bảng.');
    }
    connection.release();
}

// In ra tài khoản, database đang dùng và quyền của nó (không chứa mật khẩu) để chẩn đoán lỗi quyền
async function logDbDiagnostics(connection) {
    try {
        const [[who]] = await connection.query('SELECT CURRENT_USER() AS user, DATABASE() AS db');
        console.error(`Chẩn đoán: user = ${who.user}, database = ${JSON.stringify(who.db)}`);
        const [grants] = await connection.query('SHOW GRANTS');
        grants.forEach(g => console.error('  ' + Object.values(g)[0]));
    } catch (e) { console.error('Không đọc được thông tin quyền:', e.message); }
}

// Áp lược đồ db/01_schema_nutriai.sql mỗi lần khởi động (idempotent, giống scripts/01_migrate.js)
async function applySchema(connection) {
    const sql = fs.readFileSync(path.join(__dirname, 'db', '01_schema_nutriai.sql'), 'utf8');
    const stmts = sql.split(/\r?\n/).filter(l => !/^\s*--/.test(l)).join('\n')
        .split(/;\s*(?:\r?\n|$)/).map(s => s.trim()).filter(Boolean);
    const IGNORABLE = new Set(['ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', 'ER_DUP_ENTRY']);
    for (const s of stmts) {
        try { await connection.query(s); }
        catch (e) { if (!IGNORABLE.has(e.code)) console.error('Lược đồ:', e.code, e.message.slice(0, 120)); }
    }
}

// ... (CORS, static, middleware giữ nguyên)
app.use((req, res, next) => {
    const allowedOrigins = ['https://neutrionai2.onrender.com', 'https://neutrionai.onrender.com', 'http://localhost:5500', 'http://127.0.0.1:5500'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../Client')));

app.get('/healthz', (req, res) => res.json({ ok: true }));

// Ứng dụng di động: cùng file với bản Artifact (mobile/NutriAI-App.html), bọc thêm <head>
// và bật chế độ trực tuyến để gọi API của chính server này.
const FIREBASE_WEB_CONFIG = { // giống Client/auth.js
    apiKey: "AIzaSyCpceaN6NCYjF8aBSnAr2oorcc9WpveyoA",
    authDomain: "chat-app-demo-7d5c8.firebaseapp.com",
    projectId: "chat-app-demo-7d5c8",
    appId: "1:447306601552:web:44bd55538f9d245404ad55"
};
// Trình duyệt điện thoại chặn cookie bên thứ ba, nên đăng nhập Google qua chat-app-demo-7d5c8.firebaseapp.com
// hay hỏng (auth/popup-closed-by-user). Cách Firebase khuyến nghị: chuyển tiếp /__/auth/* qua chính tên miền này
// rồi đặt authDomain = tên miền của server. Cần thêm https://<tên miền>/__/auth/handler vào Authorized redirect URIs.
app.use('/__', async (req, res) => {
    try {
        const r = await fetch(`https://${FIREBASE_WEB_CONFIG.authDomain}/__${req.url}`, {
            headers: { 'user-agent': req.get('user-agent') || '', 'accept-language': req.get('accept-language') || '' }
        });
        res.status(r.status);
        const ct = r.headers.get('content-type');
        if (ct) res.type(ct);
        res.send(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
        res.status(502).send('Không chuyển tiếp được tới Firebase Auth.');
    }
});

app.get(['/app', '/app/'], (req, res) => {
    const body = fs.readFileSync(path.join(__dirname, '../mobile/NutriAI-App.html'), 'utf8');
    const host = req.get('host') || '';
    const firebaseCfg = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
        ? FIREBASE_WEB_CONFIG
        : { ...FIREBASE_WEB_CONFIG, authDomain: host };
    res.type('html').send(`<!doctype html>
<html lang="vi"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<style>html,body{margin:0}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box;height:100%}</style>
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-auth-compat.js"></script>
<script>window.NUTRIAI_ONLINE = { api: '', firebase: ${JSON.stringify(firebaseCfg)} };</script>
</head><body>
${body}
</body></html>`);
});

// --- API ROUTES ---

app.post('/api/auth/register', async (req, res) => {
    const { name, password, phone, age, gender } = req.body;
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Vui lòng nhập họ và tên.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email chưa đúng định dạng.' });
    if (String(password || '').length < 6) return res.status(400).json({ error: 'Mật khẩu cần ít nhất 6 ký tự.' });
    try {
        const [existing] = await pool.query('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
        if (existing.length) return res.status(409).json({ error: 'Email này đã có tài khoản.' });
        const role = (email === String(process.env.ADMIN_EMAIL || '').toLowerCase()) ? 'admin' : 'user';
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (name, email, password, phone, age, gender, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [String(name).trim(), email, hashedPassword, phone, age, gender, role]
        );
        res.status(201).json({ message: `Đăng ký thành công với quyền ${role}!` });
    } catch (error) {
        console.error("Register Error:", error);
        res.status(400).json({ error: 'Email đã tồn tại hoặc dữ liệu không hợp lệ.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { password } = req.body;
    // TiDB mặc định so sánh chuỗi phân biệt hoa/thường; bàn phím điện thoại hay tự viết hoa chữ đầu
    const email = String(req.body.email || '').trim();
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
        const user = rows[0];
        if (user && await bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar } });
        } else {
            res.status(401).json({ error: 'Sai email hoặc mật khẩu.' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Lỗi server.' });
    }
});

app.post('/api/auth/google', async (req, res) => {
    const { token } = req.body;
    try {
        const decodedToken = await getAuth().verifyIdToken(token);
        const { email, name, picture } = decodedToken;

        let [rows] = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
        let user = rows[0];
        if (!user) {
            const role = (email === process.env.ADMIN_EMAIL) ? 'admin' : 'user';
            const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
            await pool.query(
                'INSERT INTO users (name, email, password, role, avatar) VALUES (?, ?, ?, ?, ?)',
                [name || email.split('@')[0], email, randomPassword, role, picture]
            );
            [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
            user = rows[0];
        } else if (picture && user.avatar !== picture) {
            await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [picture, user.id]);
            user.avatar = picture;
        }

        const jwtToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token: jwtToken, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar } });
    } catch (error) {
        console.error("Firebase Auth Error:", error);
        res.status(401).json({ error: 'Xác thực Google qua Firebase thất bại.' });
    }
});

app.get('/api/user/profile', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Không có quyền truy cập.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const [rows] = await pool.query('SELECT id, name, email, phone, age, gender, height, weight, disease, avatar, role, activity_pal, pal_label FROM users WHERE id = ?', [decoded.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Người dùng không tồn tại.' });

        // Kèm luôn bộ chỉ tiêu mới nhất (công thức 1-7) để client không phải tự tính lại
        const [t] = await pool.query('SELECT * FROM nutrition_targets WHERE user_id = ? ORDER BY computed_at DESC LIMIT 1', [decoded.id]);
        res.json({ ...rows[0], targets: t[0] || null });
    } catch (err) {
        res.status(401).json({ error: 'Token không hợp lệ.' });
    }
});

app.put('/api/user/profile', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Không có quyền truy cập.' });
    const { name, phone, age, gender, height, weight, disease, avatar, activity_pal, pal_label } = req.body;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        await pool.query(
            'UPDATE users SET name = ?, phone = ?, age = ?, gender = ?, height = ?, weight = ?, disease = ?, avatar = ?, activity_pal = ?, pal_label = ? WHERE id = ?',
            [name, phone, age, gender, height, weight, disease, avatar, activity_pal || null, pal_label || null, decoded.id]
        );
        // Hồ sơ đổi => chỉ tiêu dinh dưỡng phải tính lại và lưu vết (công thức 1-7)
        const targets = await recomputeAndStoreTargets(decoded.id);
        res.json({ message: 'Cập nhật thành công!', targets });
    } catch (err) { res.status(400).json({ error: 'Cập nhật thất bại.' }); }
});

// --- ĐỘNG CƠ SINH TRẮC: tính (1)-(7) từ users và ghi vào nutrition_targets ---
async function recomputeAndStoreTargets(userId) {
    const [rows] = await pool.query('SELECT age, gender, height, weight, activity_pal FROM users WHERE id = ?', [userId]);
    const u = rows[0];
    if (!u || !u.height || !u.weight || !u.age || !u.activity_pal) return null; // chưa đủ đầu vào

    const t = engine.computeTargets({
        height_cm: u.height, weight_kg: u.weight, age: u.age,
        gender: u.gender, activity_pal: u.activity_pal,
    });

    const [r] = await pool.query(
        `INSERT INTO nutrition_targets
         (user_id, height_cm, weight_kg, age, gender, sex_constant, activity_pal, p_ratio,
          bmi, bmi_class, ideal_weight_kg, bmr_kcal, tdee_kcal,
          target_protein_g, target_lipid_g, target_carb_g,
          pct_protein, pct_lipid, pct_carb, ada_compliant, formula_version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [userId, t.height_cm, t.weight_kg, t.age, t.gender, t.sex_constant, t.activity_pal, t.p_ratio,
         t.bmi, t.bmi_class, t.ideal_weight_kg, t.bmr_kcal, t.tdee_kcal,
         t.target_protein_g, t.target_lipid_g, t.target_carb_g,
         t.pct_protein, t.pct_lipid, t.pct_carb, t.ada_compliant, t.formula_version]
    );
    return { id: r.insertId, ...t };
}

// Tính lại chỉ tiêu theo yêu cầu (dùng khi người dùng bấm "Tính chỉ số")
app.post('/api/user/targets', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Không có quyền truy cập.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const targets = await recomputeAndStoreTargets(decoded.id);
        if (!targets) return res.status(400).json({ error: 'Hồ sơ chưa đủ chiều cao / cân nặng / tuổi / mức vận động.' });
        res.json(targets);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// Danh mục thực phẩm lấy TỪ CSDL (kèm GI) — thay cho việc đọc file JSON tĩnh
app.get('/api/foods', async (req, res) => {
    try {
        const { q, low_gi, limit } = req.query;
        const where = [];
        const params = [];
        if (q) { where.push('name LIKE ?'); params.push(`%${q}%`); }
        if (low_gi === '1') { where.push("gi_class = 'low' AND is_contraindicated_dm = 0"); }
        params.push(Math.min(parseInt(limit) || 50, 621));
        const [rows] = await pool.query(
            `SELECT id, food_code, name, kcal_100g, protein_100g, lipid_100g, carb_100g,
                    gi, gi_class, gi_source, is_contraindicated_dm
             FROM foods ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
             ORDER BY is_contraindicated_dm ASC, name ASC LIMIT ?`, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ghi thực đơn CÓ CẤU TRÚC: meal_items + tổng hợp ngày (công thức 9 và 10)
app.post('/api/user/meals', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Không có quyền truy cập.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { log_date, items, schedule_id } = req.body; // items: [{food_id|food_name_raw, grams, meal_slot, origin}]
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items rỗng.' });
        const day = log_date || new Date().toISOString().slice(0, 10);

        const [tRows] = await pool.query('SELECT * FROM nutrition_targets WHERE user_id = ? ORDER BY computed_at DESC LIMIT 1', [decoded.id]);
        const target = tRows[0];
        if (!target) return res.status(400).json({ error: 'Chưa có chỉ tiêu dinh dưỡng — gọi POST /api/user/targets trước.' });

        const scaled = [];
        for (const it of items) {
            let food = null;
            if (it.food_id) {
                const [f] = await pool.query('SELECT * FROM foods WHERE id = ?', [it.food_id]);
                food = f[0];
            } else if (it.food_name_raw) {
                const [f] = await pool.query('SELECT * FROM foods WHERE name = ?', [it.food_name_raw]);
                food = f[0];
            }
            const grams = Number(it.grams) || 0;
            const s = food
                ? engine.scaleFood(food, grams)
                : { grams, kcal: Number(it.kcal) || 0, protein_g: Number(it.protein_g) || 0,
                    lipid_g: Number(it.lipid_g) || 0, carb_g: Number(it.carb_g) || 0, gi: null, gl: null };

            await pool.query(
                `INSERT INTO meal_items
                 (schedule_id, user_id, log_date, meal_slot, food_id, food_name_raw, grams,
                  kcal, protein_g, lipid_g, carb_g, gi, gl, origin, replaced_food_id, guardrail_flag)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [schedule_id || null, decoded.id, day, it.meal_slot || 'trua',
                 food ? food.id : null, it.food_name_raw || (food && food.name) || 'Không rõ', s.grams,
                 s.kcal, s.protein_g, s.lipid_g, s.carb_g, s.gi, s.gl,
                 it.origin || 'user', it.replaced_food_id || null, it.guardrail_flag || 'none']
            );
            scaled.push(s);
        }

        // Tổng hợp lại CẢ NGÀY từ meal_items (không chỉ các món vừa thêm)
        const [dayItems] = await pool.query(
            'SELECT kcal, protein_g, lipid_g, carb_g, gl FROM meal_items WHERE user_id = ? AND log_date = ?',
            [decoded.id, day]
        );
        const sum = engine.summarizeDay(dayItems, target);

        await pool.query(
            `INSERT INTO daily_nutrition_summary
             (user_id, log_date, target_id, kcal_consumed, protein_g, lipid_g, carb_g,
              gl_total, kcal_remaining, energy_gap_abs, within_50kcal, gl_risk_class)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE target_id=VALUES(target_id), kcal_consumed=VALUES(kcal_consumed),
              protein_g=VALUES(protein_g), lipid_g=VALUES(lipid_g), carb_g=VALUES(carb_g),
              gl_total=VALUES(gl_total), kcal_remaining=VALUES(kcal_remaining),
              energy_gap_abs=VALUES(energy_gap_abs), within_50kcal=VALUES(within_50kcal),
              gl_risk_class=VALUES(gl_risk_class)`,
            [decoded.id, day, target.id, sum.kcal_consumed, sum.protein_g, sum.lipid_g, sum.carb_g,
             sum.gl_total, sum.kcal_remaining, sum.energy_gap_abs, sum.within_50kcal, sum.gl_risk_class]
        );

        res.json({ message: 'Đã ghi thực đơn.', inserted: scaled.length, summary: sum, target_id: target.id });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/user/schedules', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Không có quyền truy cập.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const [rows] = await pool.query('SELECT * FROM schedules WHERE user_id = ? ORDER BY created_at DESC', [decoded.id]);
        res.json(rows);
    } catch (err) { res.status(401).json({ error: 'Token không hợp lệ.' }); }
});

app.post('/api/user/schedules', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Không có quyền truy cập.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { date, meal_data } = req.body;
        await pool.query('INSERT INTO schedules (user_id, date, meal_data) VALUES (?, ?, ?)', [decoded.id, date || new Date().toISOString(), meal_data]);
        res.json({ message: 'Đã lưu lịch ăn!' });
    } catch (err) { res.status(401).json({ error: 'Token không hợp lệ.' }); }
});

app.delete('/api/user/schedules/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Không có quyền truy cập.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        await pool.query('DELETE FROM schedules WHERE id = ? AND user_id = ?', [req.params.id, decoded.id]);
        res.json({ message: 'Đã xóa lịch ăn!' });
    } catch (err) { res.status(401).json({ error: 'Token không hợp lệ.' }); }
});

// --- DANH MỤC TƯƠNG KHẮC BỆNH LÝ (Bảng 3 cho báo cáo) ---
const CONTRAINDICATIONS = {
    "Gout": ["thịt bò", "thịt chó", "hải sản", "nội tạng", "bia", "rượu", "tôm", "cua", "ghẹ"],
    "Tiểu đường": ["đường", "kẹo", "nước ngọt", "bánh mì trắng", "mật ong", "chè", "sữa đặc"],
    "Cao huyết áp": ["muối", "dưa muối", "mắm", "mỡ động vật", "cà phê"],
    "Gan nhiễm mỡ": ["mỡ lợn", "nội tạng", "đồ chiên", "rượu", "bia", "đồ nướng"],
    "Dạ dày": ["ớt", "tiêu", "rượu", "bia", "chanh", "quất", "đồ chua"]
};

const WARNING_REASONS = {
    "Gout": "Việc tiêu thụ thực phẩm này có thể làm tăng axit uric trong máu, gây đau khớp cấp",
    "Tiểu đường": "Đây là nhóm thực phẩm GI cao gây tăng đường huyết đột ngột",
    "Cao huyết áp": "Chứa nhiều Natri hoặc chất kích thích gây tăng huyết áp",
    "Gan nhiễm mỡ": "Chứa nhiều cholesterol xấu, đồ dầu mỡ làm tăng gánh nặng cho gan",
    "Dạ dày": "Gây kích ứng niêm mạc, làm trầm trọng thêm tình trạng viêm loét"
};

// Biến toàn cục để lưu trữ trạng thái Rate Limit của Groq
let groqRateLimits = {
    limitRequests: 'Unknown',
    remainingRequests: 'Unknown',
    limitTokens: 'Unknown',
    remainingTokens: 'Unknown',
    resetTime: 'Unknown'
};

// --- API CHAT AI ---
app.post('/api/chat/generate', async (req, res) => {
    // temperature/max_tokens cho phép client chọn: Menu Generation dùng 0.7,
    // Guardrail Lớp 2 (AI Verification) dùng tau = 0.1 và max_tokens = 100 đúng như bài báo.
    const { messages, systemPrompt, disease, temperature, max_tokens } = req.body;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
        return res.status(500).json({ error: 'Chưa cấu hình GROQ_API_KEY trong .env' });
    }

    const foodListStr = foodData.slice(0, 100).map(f => `${f.TenThucPham} (${f.Kcal}kcal, P:${f.Protid_g}g, L:${f.Lipid_g}g, C:${f.Carb_g}g)`).join(', ');
    
    let prohibitedFoodsList = [];
    let diseaseMap = {}; // mapping food -> disease
    if (disease && disease !== 'Không có') {
        for (let key in CONTRAINDICATIONS) {
            if (disease.toLowerCase().includes(key.toLowerCase())) {
                CONTRAINDICATIONS[key].forEach(food => {
                    prohibitedFoodsList.push(food);
                    diseaseMap[food] = key;
                });
            }
        }
    }

    const enrichedSystemPrompt = `${systemPrompt}
Dưới đây là danh sách thực phẩm chuẩn (tĩnh) bạn CẦN ưu tiên sử dụng để đề xuất thực đơn:
${foodListStr}... (và nhiều thực phẩm khác).

LƯU Ý VỀ AN TOÀN Y TẾ:
1. Bệnh nhân có bệnh nền là: "${disease || 'Không có'}".
${prohibitedFoodsList.length > 0 ? `2. CẤM TUYỆT ĐỐI sử dụng các loại thực phẩm sau: ${prohibitedFoodsList.join(', ')}.` : ''}
3. Luôn ưu tiên các thực phẩm lành mạnh và trả về cấu trúc bữa ăn rõ ràng.`;

    try {
        const modelToUse = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: modelToUse,
                messages: [
                    { role: "system", content: enrichedSystemPrompt },
                    ...messages
                ],
                temperature: (typeof temperature === 'number') ? temperature : 0.7,
                ...(max_tokens ? { max_tokens } : {})
            })
        });

        // Capture Rate Limit Headers từ Groq
        if (response.headers) {
            groqRateLimits.limitRequests = response.headers.get('x-ratelimit-limit-requests') || groqRateLimits.limitRequests;
            groqRateLimits.remainingRequests = response.headers.get('x-ratelimit-remaining-requests') || groqRateLimits.remainingRequests;
            groqRateLimits.limitTokens = response.headers.get('x-ratelimit-limit-tokens') || groqRateLimits.limitTokens;
            groqRateLimits.remainingTokens = response.headers.get('x-ratelimit-remaining-tokens') || groqRateLimits.remainingTokens;
            groqRateLimits.resetTime = response.headers.get('x-ratelimit-reset-tokens') || groqRateLimits.resetTime;
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Lỗi API Groq');
        
        let botReply = data.choices[0].message.content;

        let foundViolations = {};
        if (prohibitedFoodsList.length > 0) {
            const lines = botReply.split('\n');
            prohibitedFoodsList.forEach(food => {
                const isActuallyInMenu = lines.some(line => {
                    const l = line.toLowerCase();
                    const isMenuLine = l.includes('bữa') || l.trim().startsWith('*') || l.trim().startsWith('-') || l.includes('gam') || l.includes('kcal');
                    const isNegation = l.includes('không') || l.includes('tránh') || l.includes('cấm') || l.includes('hạn chế') || l.includes('thay thế') || l.includes('loại bỏ');
                    return isMenuLine && l.includes(food.toLowerCase()) && !isNegation;
                });
                
                if (isActuallyInMenu) {
                    const dis = diseaseMap[food];
                    if (!foundViolations[dis]) foundViolations[dis] = [];
                    if (!foundViolations[dis].includes(food)) foundViolations[dis].push(food);
                }
            });
        }

        let warningKeys = Object.keys(foundViolations);
        if (warningKeys.length > 0) {
            let isMulti = warningKeys.length > 1;
            let warningTitle = isMulti ? "CẢNH BÁO Y TẾ TỔNG HỢP" : "CẢNH BÁO Y TẾ";
            
            let warningHTML = `<div class="warning-box" style="background-color: #FFEBEE; border-left: 4px solid #D32F2F; padding: 12px; border-radius: 4px; margin-bottom: 15px; color: #B71C1C; font-family: Roboto, sans-serif;">
<strong style="display: flex; align-items: center; gap: 5px; font-size: 15px; margin-bottom: 5px;"><i class="fa-solid fa-triangle-exclamation"></i> ${warningTitle}</strong>
Hệ thống phát hiện thực đơn yêu cầu chứa thực phẩm có hại:<br><br>`;
            
            warningKeys.forEach(dis => {
                warningHTML += `- Người bệnh <b>${dis}</b> cần tránh: [<b>${foundViolations[dis].join(', ')}</b>]. ${WARNING_REASONS[dis]}.<br>`;
            });
            
            warningHTML += `<br>NutriAI đã tự động điều chỉnh món ăn an toàn hơn cho bạn.</div>\n<p style="margin: 0 0 10px 0; font-weight: 500; color: #00796B;">Gợi ý thực đơn thay thế:</p>\n\n`;
            
            data.choices[0].message.content = warningHTML + botReply;
        }
        
        res.json(data);
    } catch (error) {
        console.error("AI Chat Error:", error);
        res.status(500).json({ error: error.message });
    }
});


app.post('/api/export-excel', async (req, res) => {
    const { meal_data, user_info } = req.body;
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Hồ Sơ Dinh Dưỡng');

        // Định dạng độ rộng cột
        worksheet.columns = [
            { width: 3 },  // Cột A: Khoảng trống
            { width: 20 }, // Cột B: BỮA ĂN
            { width: 35 }, // Cột C: MÓN ĂN
            { width: 15 }, // Cột D: KHỐI LƯỢNG (g)
            { width: 10 }, // Cột E: KCAL
            { width: 15 }, // Cột F: PROTEIN (g)
            { width: 15 }, // Cột G: LIPID (g)
            { width: 15 }  // Cột H: CARB (g)
        ];

        // --- PHẦN 1: HEADER (Tiêu đề) ---
        worksheet.mergeCells('B1:H1');
        const titleCell = worksheet.getCell('B1');
        titleCell.value = "THỰC ĐƠN DINH DƯỠNG CÁ NHÂN";
        titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00796B' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

        worksheet.getCell('B2').value = "Ngày lập:";
        worksheet.getCell('C2').value = new Date().toLocaleDateString('vi-VN');
        worksheet.getCell('B2').font = { bold: true };

        // --- PHẦN 2: THÔNG TIN CÁ NHÂN (Nếu Client gửi lên) ---
        let currentRow = 4;
        if (user_info) {
            worksheet.getCell(`B${currentRow}`).value = "--- HỒ SƠ CÁ NHÂN ---";
            worksheet.getCell(`B${currentRow}`).font = { bold: true, color: { argb: 'FF00796B' } };
            currentRow++;

            worksheet.getCell(`B${currentRow}`).value = "Họ và tên:";
            worksheet.getCell(`C${currentRow}`).value = user_info.name || "Khách";
            currentRow++;

            worksheet.getCell(`B${currentRow}`).value = "Giới tính:";
            worksheet.getCell(`C${currentRow}`).value = user_info.gender === 'nu' ? 'Nữ' : 'Nam';
            worksheet.getCell(`D${currentRow}`).value = "Tuổi:";
            worksheet.getCell(`E${currentRow}`).value = user_info.age || "";
            currentRow++;

            worksheet.getCell(`B${currentRow}`).value = "Chiều cao (cm):";
            worksheet.getCell(`C${currentRow}`).value = user_info.height || "";
            worksheet.getCell(`D${currentRow}`).value = "Cân nặng (kg):";
            worksheet.getCell(`E${currentRow}`).value = user_info.weight || "";
            currentRow++;

            worksheet.getCell(`B${currentRow}`).value = "Bệnh nền:";
            worksheet.getCell(`C${currentRow}`).value = user_info.disease || "Không có";
            currentRow += 2;
        }

        // --- PHẦN 3: BẢNG THỰC ĐƠN ---
        // Header bảng
        const tableHeaderRow = worksheet.getRow(currentRow);
        tableHeaderRow.values = [null, "BỮA ĂN", "MÓN ĂN", "KHỐI LƯỢNG (g)", "KCAL", "PROTEIN (g)", "LIPID (g)", "CARB (g)"];
        tableHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        tableHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
        
        ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
            const cell = worksheet.getCell(`${col}${currentRow}`);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004D40' } };
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        });
        currentRow++;

        // Parsing meal_data
        const lines = meal_data.split('\n');
        let currentMeal = "";

        lines.forEach(line => {
            const cleanLine = line.replace(/\*\*/g, '').replace(/\[Gợi ý:.*?\]/g, '').trim();
            if (!cleanLine) return;

            // Bắt Header Bữa Ăn (Bữa Sáng, Bữa Trưa, Bữa Tối, Thứ 2, Thứ 3...)
            if (cleanLine.toLowerCase().includes('bữa') || cleanLine.toLowerCase().includes('ngày') || cleanLine.toLowerCase().includes('thứ')) {
                currentMeal = cleanLine.replace(':', '');
                
                // Thêm dòng ngăn cách nhạt màu cho Bữa ăn
                const mealRow = worksheet.getRow(currentRow);
                worksheet.mergeCells(`B${currentRow}:H${currentRow}`);
                mealRow.getCell('B').value = currentMeal.toUpperCase();
                mealRow.font = { bold: true, color: { argb: 'FF00796B' } };
                mealRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2F1' } };
                mealRow.getCell('B').border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                currentRow++;
            } 
            // Bắt Món Ăn (Các dòng bắt đầu bằng -, *, hoặc số)
            else if (cleanLine.startsWith('-') || cleanLine.startsWith('*') || /^\d+\./.test(cleanLine)) {
                // Logic bóc tách "Tên món ăn (Khối lượng g, Kcal, P, L, C)"
                // AI Llama-3 thường trả về: - Cơm gạo lứt (150g, 166.5kcal, P: 3.9g, L: 1.3g, C: 34.3g)
                let foodName = cleanLine.replace(/^[-*\d.]+\s*/, '').trim();
                let weight = "", kcal = "", protein = "", lipid = "", carb = "";

                // Thử Regex trích xuất (nếu AI trả đúng format)
                const regex = /\((.*?)\)/;
                const match = foodName.match(regex);
                
                if (match) {
                    const detailsStr = match[1];
                    foodName = foodName.replace(regex, '').trim(); // Tách tên món ra khỏi ()

                    const details = detailsStr.split(',');
                    details.forEach(item => {
                        const str = item.toLowerCase().trim();
                        if (str.includes('g') && !str.includes('kcal') && !str.includes('p') && !str.includes('l') && !str.includes('c') && !weight) weight = str.replace(/[a-z]/g, '').trim();
                        if (str.includes('kcal')) kcal = str.replace(/[a-z]/gi, '').trim();
                        if (str.includes('p') || str.includes('protein')) protein = str.replace(/[^0-9.]/g, '').trim();
                        if (str.includes('l') || str.includes('lipid')) lipid = str.replace(/[^0-9.]/g, '').trim();
                        if (str.includes('c') || str.includes('carb')) carb = str.replace(/[^0-9.]/g, '').trim();
                    });
                }

                const dataRow = worksheet.getRow(currentRow);
                dataRow.values = [null, "", foodName, weight, kcal, protein, lipid, carb];
                
                // Định dạng borders cho dòng dữ liệu
                ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
                    const cell = dataRow.getCell(col);
                    cell.border = { top: {style:'thin', color: {argb: 'FFEEEEEE'}}, left: {style:'thin', color: {argb: 'FFEEEEEE'}}, bottom: {style:'thin', color: {argb: 'FFEEEEEE'}}, right: {style:'thin', color: {argb: 'FFEEEEEE'}} };
                    if (col !== 'C') cell.alignment = { horizontal: 'center' };
                });
                currentRow++;
            }
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=' + 'Thuc_Don_NutriAI.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) { 
        console.error("Excel Error:", error);
        res.status(500).json({ error: 'Lỗi tạo file Excel' }); 
    }
});

// Admin APIs...
app.get('/api/admin/users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Không đủ quyền.' });
        const [users] = await pool.query('SELECT id, name, email, role, created_at FROM users');
        res.json(users);
    } catch (err) { res.status(401).json({ error: 'Token không hợp lệ.' }); }
});

app.get('/api/admin/stats', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Không đủ quyền.' });
        
        const [[usersCount]] = await pool.query('SELECT COUNT(*) as count FROM users');
        const [[schedulesCount]] = await pool.query('SELECT COUNT(*) as count FROM schedules');
        
        const [growthData] = await pool.query(`
            SELECT DATE(created_at) as date, COUNT(*) as count 
            FROM users 
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `);

        const [users] = await pool.query('SELECT disease FROM users');
        const diseaseStats = {};
        users.forEach(u => {
            const diseases = u.disease ? u.disease.split('\n') : ['Không có'];
            diseases.forEach(d => {
                const cleanD = d.trim() || 'Không có';
                diseaseStats[cleanD] = (diseaseStats[cleanD] || 0) + 1;
            });
        });

        res.json({ 
            totalUsers: usersCount.count, 
            totalSchedules: schedulesCount.count,
            growthData,
            diseaseStats,
            groqLimits: groqRateLimits // Include Groq limits in stats
        });
    } catch (err) { res.status(401).json({ error: 'Token không hợp lệ.' }); }
});

// --- API TEST GỬI EMAIL NGAY LẬP TỨC (Dành cho Admin/Dev) ---
app.get('/api/admin/test-email', async (req, res) => {
    // Chỉ admin: token qua header Authorization hoặc ?token=... (để vẫn test được trên trình duyệt)
    try {
        const token = req.headers.authorization?.split(' ')[1] || req.query.token;
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Không đủ quyền.' });
    } catch (e) { return res.status(401).json({ error: 'Cần token admin.' }); }
    try {
        const userId = req.query.uid || 1; // Mặc định lấy User ID 1 nếu không truyền vào
        const [users] = await pool.query('SELECT name, email FROM users WHERE id = ?', [userId]);
        
        if (users.length === 0) {
            return res.status(404).json({ error: `Không tìm thấy user với ID = ${userId}` });
        }
        
        const user = users[0];
        
        // Gọi thẳng hàm gửi mail với bữa ăn giả lập là Bữa Trưa
        await sendReminderEmail(user.email, user.name, 'Bữa Trưa', userId);
        
        return res.json({ 
            message: `Đã gửi lệnh bắn Email test đến ${user.email}`,
            note: "Hãy kiểm tra hộp thư (cả mục Spam/Promotions). Nếu không thấy, kiểm tra log console của Server."
        });
    } catch (err) {
        console.error("Test Email Error:", err);
        return res.status(500).json({ error: err.message });
    }
});

// Reminder Jobs...
async function sendReminderEmail(to, name, mealTime, userId) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
    
    let fullScheduleHTML = "<p style='text-align: center; color: #888; font-style: italic;'>Vui lòng đăng nhập ứng dụng và lưu một lịch trình để hiển thị tại đây.</p>";
    
    try {
        const [rows] = await pool.query('SELECT meal_data, date FROM schedules WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]);
        if (rows.length > 0) {
            const data = rows[0].meal_data;
            const createdDate = new Date(rows[0].date).toLocaleDateString('vi-VN');
            
            // Format toàn bộ thực đơn thành HTML list chuyên nghiệp
            const lines = data.split('\n');
            let formattedMeals = '';
            
            lines.forEach(line => {
                let cleanLine = line.replace(/\*\*/g, '').replace(/\[Gợi ý:.*?\]/g, '').trim();
                if (!cleanLine) return;

                if (cleanLine.toLowerCase().includes('bữa') || cleanLine.toLowerCase().includes('ngày') || cleanLine.toLowerCase().includes('thứ')) {
                    formattedMeals += `<h3 style="color: #00796B; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; font-size: 16px;">${cleanLine.toUpperCase()}</h3>`;
                } else if (cleanLine.startsWith('-') || cleanLine.startsWith('*') || /^\d+\./.test(cleanLine)) {
                    formattedMeals += `<p style="margin: 5px 0 5px 15px; font-size: 14px; color: #444; line-height: 1.5;">${cleanLine}</p>`;
                } else {
                    formattedMeals += `<p style="margin: 5px 0; font-size: 14px; color: #555;">${cleanLine}</p>`;
                }
            });

            fullScheduleHTML = formattedMeals;
        }
    } catch (e) {
        console.error("Lấy chi tiết thực đơn thất bại:", e);
    }

    const mailOptions = { 
        from: `"Hệ thống NutriAI" <${process.env.EMAIL_USER}>`, 
        to, 
        subject: `[NutriAI] Cập nhật Lịch trình Dinh dưỡng Cá nhân - ${mealTime}`, 
        html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
                
                <!-- HEADER -->
                <div style="background-color: #f8f9fa; padding: 25px 30px; text-align: center; border-bottom: 3px solid #00796B;">
                    <h2 style="color: #333; margin: 0; font-size: 22px; font-weight: 600;">HỆ THỐNG TƯ VẤN DINH DƯỠNG NUTRIAI</h2>
                    <p style="color: #666; margin: 5px 0 0 0; font-size: 14px; font-style: italic;">Personalized Nutrition Assistant</p>
                </div>

                <!-- CONTENT -->
                <div style="padding: 30px;">
                    <p style="font-size: 15px; color: #333; line-height: 1.6; margin-bottom: 20px;">
                        Kính chào Quý khách <strong>${name}</strong>,<br><br>
                        NutriAI xin trân trọng gửi đến Quý khách chi tiết lịch trình dinh dưỡng đã được thiết lập. Để đảm bảo hiệu quả sức khỏe và đạt được mục tiêu đề ra, Quý khách vui lòng tham khảo chi tiết thực đơn dưới đây:
                    </p>

                    <div style="background-color: #fbfbfc; border: 1px solid #e9ecef; border-radius: 6px; padding: 20px; margin-bottom: 25px;">
                        <div style="text-align: center; margin-bottom: 15px;">
                            <span style="background-color: #00796B; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">CHI TIẾT THỰC ĐƠN</span>
                        </div>
                        ${fullScheduleHTML}
                    </div>

                    <p style="font-size: 14px; color: #555; line-height: 1.6;">
                        <strong>Lưu ý:</strong> Thực đơn này được thiết kế riêng cho Quý khách dựa trên phân tích chỉ số sinh trắc học và bệnh lý (nếu có). Quý khách có thể truy cập ứng dụng NutriAI để điều chỉnh hoặc xem các cảnh báo y tế chi tiết.
                        <br><i>This menu is tailored specifically for you based on biometric and medical analysis.</i>
                    </p>
                </div>

                <!-- FOOTER -->
                <div style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #888; line-height: 1.5; text-align: justify;">
                    Đây là email tự động từ hệ thống NutriAI. Quý khách vui lòng không phản hồi (reply) email này. Nếu cần hỗ trợ thêm về chuyên môn, vui lòng liên hệ đội ngũ bác sĩ thông qua chức năng Chat trên ứng dụng.
                    <br><br>
                    <i>This is an automated email. Please do not reply to this email. For further assistance, please use the Chat function on the application.</i>
                </div>
            </div>
        ` 
    };
    try { await transporter.sendMail(mailOptions); } catch (e) { console.error("Lỗi gửi mail:", e); }
}

cron.schedule('0 9 * * *', async () => { 
    const [users] = await pool.query('SELECT id, name, email FROM users'); 
    users.forEach(u => sendReminderEmail(u.email, u.name, 'Bữa Sáng', u.id)); 
});
cron.schedule('0 12 * * *', async () => { 
    const [users] = await pool.query('SELECT id, name, email FROM users'); 
    users.forEach(u => sendReminderEmail(u.email, u.name, 'Bữa Trưa', u.id)); 
});
cron.schedule('0 18 * * *', async () => { 
    const [users] = await pool.query('SELECT id, name, email FROM users'); 
    users.forEach(u => sendReminderEmail(u.email, u.name, 'Bữa Tối', u.id)); 
});

// Load food data...
let foodData = [];
try {
    const foodDataPath = path.join(__dirname, '../Client/food_data.json');
    if (fs.existsSync(foodDataPath)) foodData = JSON.parse(fs.readFileSync(foodDataPath, 'utf8'));
} catch (e) {}

// Fix lỗi ENETUNREACH (IPv6) trên Render
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const transporter = nodemailer.createTransport({ 
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    family: 4, // ép dùng IPv4 - tránh lỗi ENETUNREACH với IPv6 trên Render
    auth: { 
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS 
    },
    tls: {
        rejectUnauthorized: false
    }
});

async function start() {
    try {
        await initDB();
        app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
    } catch (err) { console.error("Lỗi khởi động Server:", err); }
}
start();