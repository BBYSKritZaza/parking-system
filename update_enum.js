const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parking_db'
};

async function updateEnum() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to database');

        const sql = "ALTER TABLE parking_slots MODIFY COLUMN spot_status ENUM('ว่าง', 'มีรถเล็ก', 'มีรถใหญ่', 'ไม่ใช่รถ', 'ยังไม่ติดตั้งแม่เหล็ก', 'ถูกจอง') DEFAULT 'ว่าง'";

        await connection.query(sql);
        console.log('✅ Updated spot_status ENUM to include "ถูกจอง"');

        process.exit(0);
    } catch (err) {
        console.error('❌ Update failed:', err);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

updateEnum();
