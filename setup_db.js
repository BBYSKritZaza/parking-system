const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 3306
};

const dbName = process.env.DB_NAME || 'parking_db';

async function setupDatabase() {
    let connection;
    try {
        // 1. Connect to MySQL server
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to MySQL server');

        // 2. Create and Select Database
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        console.log(`✅ Database "${dbName}" created or exists`);

        await connection.changeUser({ database: dbName });
        console.log(`✅ Switched to database "${dbName}"`);

        // 3. Create Tables
        const tables = [
            `CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                id_card_number VARCHAR(20),
                id_card_image VARCHAR(255),
                provider_status ENUM('none', 'pending', 'approved', 'rejected') DEFAULT 'none',
                profile_pic VARCHAR(255),
                account_status ENUM('active', 'suspended') DEFAULT 'active',
                suspension_reason TEXT,
                appeal_message TEXT
            )`,
            `CREATE TABLE IF NOT EXISTS admins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS parking_locations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                provider_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                lat DECIMAL(10, 8),
                lng DECIMAL(11, 8),
                price_hourly DECIMAL(10, 2) DEFAULT 0,
                price_daily DECIMAL(10, 2) DEFAULT 0,
                price_monthly DECIMAL(10, 2) DEFAULT 0,
                status ENUM('pending', 'approved', 'rejected', 'maintenance', 'suspended') DEFAULT 'pending',
                image_url VARCHAR(255),
                details TEXT,
                FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS parking_zones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                location_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                capacity INT DEFAULT 0,
                FOREIGN KEY (location_id) REFERENCES parking_locations(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS operating_hours (
                id INT AUTO_INCREMENT PRIMARY KEY,
                location_id INT NOT NULL,
                day_of_week VARCHAR(10) NOT NULL,
                is_open BOOLEAN DEFAULT TRUE,
                is_24h BOOLEAN DEFAULT FALSE,
                open_time TIME,
                close_time TIME,
                FOREIGN KEY (location_id) REFERENCES parking_locations(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS parking_slots (
                id INT AUTO_INCREMENT PRIMARY KEY,
                zone_id INT,
                slot_number VARCHAR(10) NOT NULL,
                spot_status ENUM('ว่าง', 'มีรถเล็ก', 'มีรถใหญ่', 'ไม่ใช่รถ', 'ยังไม่ติดตั้งแม่เหล็ก') DEFAULT 'ว่าง',
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (zone_id) REFERENCES parking_zones(id) ON DELETE SET NULL
            )`,
            `CREATE TABLE IF NOT EXISTS support_tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                role ENUM('user', 'provider') NOT NULL,
                ticket_type VARCHAR(50) NOT NULL,
                description TEXT NOT NULL,
                status ENUM('processing', 'completed') DEFAULT 'processing',
                admin_reply TEXT,
                is_read_by_user BOOLEAN DEFAULT FALSE,
                parking_location_id INT NULL,
                parking_zone_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`
        ];

        for (const sql of tables) {
            await connection.query(sql);
        }
        console.log('✅ All tables created or checked');

        // 4. Run Migrations (Add missing columns)
        const migrations = [
            // Users table
            "ALTER TABLE users ADD COLUMN id_card_number VARCHAR(20)",
            "ALTER TABLE users ADD COLUMN id_card_image VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN provider_status ENUM('none', 'pending', 'approved', 'rejected') DEFAULT 'none'",
            "ALTER TABLE users ADD COLUMN profile_pic VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN account_status ENUM('active', 'suspended') DEFAULT 'active'",
            "ALTER TABLE users ADD COLUMN suspension_reason TEXT",
            "ALTER TABLE users ADD COLUMN appeal_message TEXT",

            // Parking Locations table
            "ALTER TABLE parking_locations ADD COLUMN details TEXT",

            // Parking Slots table
            "ALTER TABLE parking_slots ADD COLUMN zone_id INT",
            "ALTER TABLE parking_slots ADD COLUMN spot_status ENUM('ว่าง', 'มีรถเล็ก', 'มีรถใหญ่', 'ไม่ใช่รถ', 'ยังไม่ติดตั้งแม่เหล็ก') DEFAULT 'ว่าง'",
            "ALTER TABLE parking_slots DROP COLUMN is_occupied",
            "ALTER TABLE parking_slots DROP COLUMN is_car",

            // Support Tickets table - status update
            "ALTER TABLE support_tickets MODIFY COLUMN status ENUM('processing', 'completed') DEFAULT 'processing'"
        ];

        for (const query of migrations) {
            try {
                await connection.query(query);
            } catch (err) {
                // Ignore 'Duplicate column name' error (code 1060)
                if (err.errno !== 1060) {
                    console.warn(`⚠️ Migration warning: ${err.message}`);
                }
            }
        }
        console.log('✅ Schema migrations verified');

        // 5. Data Fixes (from update_db.js and others)
        const dataUpdates = [
            "UPDATE parking_locations SET image_url = REPLACE(image_url, '/uploads/park_pic/', '/park_pic/') WHERE image_url LIKE '/uploads/park_pic/%'",
            "UPDATE support_tickets SET status = 'processing' WHERE status IN ('sent', 'read')",
            "UPDATE support_tickets SET status = 'completed' WHERE status = 'rejected'"
        ];

        for (const query of dataUpdates) {
            await connection.query(query);
        }
        console.log('✅ Data updates applied');

        // 6. Seed Initial Data
        // Default Admin
        const adminEmail = 'admin@example.com';
        const adminPassword = 'adminpassword';
        const [admins] = await connection.query('SELECT * FROM admins WHERE email = ?', [adminEmail]);

        if (admins.length === 0) {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await connection.query('INSERT INTO admins (email, password) VALUES (?, ?)', [adminEmail, hashedPassword]);
            console.log(`✅ Default admin created: ${adminEmail} / ${adminPassword}`);
        } else {
            console.log('ℹ️ Admin already exists');
        }

        // Default Parking Slot
        await connection.query("INSERT IGNORE INTO parking_slots (slot_number, spot_status) VALUES ('Slot 1', 'ว่าง')");
        console.log('✅ Initial parking slot ensured');

        // Cleanup deprecated tables
        await connection.query("DROP TABLE IF EXISTS providers");
        console.log('✅ Deprecated tables cleaned up');

        console.log('🎉 Database setup completed successfully!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Database setup failed:', err);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

setupDatabase();
