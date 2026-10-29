// Kết nối TiDB Cloud dùng chung cho mọi script trong thư mục này.
// Ưu tiên biến môi trường (Server/.env). Không hardcode mật khẩu ở đây.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

function cfg() {
    const need = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    const missing = need.filter(k => !process.env[k]);
    if (missing.length) {
        throw new Error(
            `Thiếu biến môi trường: ${missing.join(', ')}.\n` +
            `Tạo file Server/.env theo mẫu Server/.env.example rồi chạy lại.`
        );
    }
    return {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT) || 4000,
        ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
        multipleStatements: false,
        waitForConnections: true,
        connectionLimit: 5,
    };
}

async function getConn() {
    return mysql.createConnection(cfg());
}

module.exports = { getConn, cfg };
