const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const multer = require('multer');
const path = require('path');
const { verifyToken } = require('../middleware/auth');

// Multer setup for image upload
// Multer setup for image upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'id_card_image') {
            cb(null, 'public/provider_idCard/');
        } else if (file.fieldname === 'profile_pic') {
            cb(null, 'public/user_pic/');
        } else if (file.fieldname === 'parkingImage') {
            cb(null, 'public/park_pic/');
        } else {
            cb(null, 'public/uploads/');
        }
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Register User
router.post('/register/user', upload.single('profile_pic'), async (req, res) => {
    const { first_name, last_name, phone, email, password } = req.body;
    const profile_pic = req.file ? 'user_pic/' + req.file.filename : null;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = `INSERT INTO users (first_name, last_name, phone, email, password, profile_pic) VALUES (?, ?, ?, ?, ?, ?)`;
        db.query(sql, [first_name, last_name, phone, email, hashedPassword, profile_pic], (err, result) => {
            if (err) return res.status(400).json({ message: 'Error registering user', error: err });
            res.status(201).json({ message: 'User registered successfully' });
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Upgrade to Provider with Parking (Unified Flow)
router.post('/upgrade-provider-unified', verifyToken, upload.fields([{ name: 'id_card_image', maxCount: 1 }, { name: 'parkingImage', maxCount: 1 }]), async (req, res) => {
    try {
        const { id_card_number, name, lat, lng } = req.body;
        const zones = JSON.parse(req.body.zones || '[]');
        const pricing = JSON.parse(req.body.pricing || '{}');
        const hours = JSON.parse(req.body.hours || '[]');
        const userId = req.user.id;

        const files = req.files || {};
        const id_card_image = files['id_card_image'] ? 'provider_idCard/' + files['id_card_image'][0].filename : null;
        const parking_image_url = files['parkingImage'] ? '/park_pic/' + files['parkingImage'][0].filename : null;

        if (!id_card_image || !id_card_number) {
            return res.status(400).json({ message: 'ID Card number and image are required' });
        }
        if (!name || zones.length === 0) {
            return res.status(400).json({ message: 'Parking Name and Zones are required' });
        }

        // 1. Update User to 'pending'
        const sqlUser = `UPDATE users SET id_card_number = ?, id_card_image = ?, provider_status = 'pending' WHERE id = ?`;
        db.query(sqlUser, [id_card_number, id_card_image, userId], (err) => {
            if (err) return res.status(400).json({ message: 'Error updating user', error: err });

            // 2. Insert Parking Location with status 'pending' (Unified)
            const sqlLoc = `INSERT INTO parking_locations (provider_id, name, lat, lng, price_hourly, price_daily, price_monthly, image_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;
            db.query(sqlLoc, [userId, name, lat, lng, pricing.hourly || 0, pricing.daily || 0, pricing.monthly || 0, parking_image_url], (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ message: 'Error creating parking location' });
                }
                const locationId = result.insertId;

                // 3. Insert Zones
                const zoneValues = zones.map(z => [locationId, z.name, z.capacity]);
                const sqlZones = `INSERT INTO parking_zones (location_id, name, capacity) VALUES ?`;
                db.query(sqlZones, [zoneValues], (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ message: 'Error creating zones' });
                    }

                    // 4. Insert Hours
                    const hourValues = hours.map(h => [
                        locationId,
                        h.day_of_week,
                        h.is_open,
                        h.is_24h,
                        h.is_24h ? null : h.open_time,
                        h.is_24h ? null : h.close_time
                    ]);
                    const sqlHours = `INSERT INTO operating_hours (location_id, day_of_week, is_open, is_24h, open_time, close_time) VALUES ?`;
                    db.query(sqlHours, [hourValues], (err) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({ message: 'Error creating hours' });
                        }
                        res.json({ message: 'Request submitted. Please wait for admin approval.' });
                    });
                });
            });
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Check Admin first
    const adminSql = `SELECT * FROM admins WHERE email = ?`;
    db.query(adminSql, [email], async (err, adminResults) => {
        if (err) return res.status(500).json({ message: 'Database error' });

        if (adminResults.length > 0) {
            const admin = adminResults[0];
            const validPass = await bcrypt.compare(password, admin.password);
            if (!validPass) return res.status(400).json({ message: 'Invalid password' });

            const token = jwt.sign({ id: admin.id, role: 'admin', email: admin.email }, process.env.JWT_SECRET || 'secretkey');
            let responseUser = { ...admin, role: 'admin' };
            delete responseUser.password;
            return res.json({ token, user: responseUser, message: 'Welcome Admin' });
        }

        // If not admin, check Users
        const userSql = `SELECT * FROM users WHERE email = ?`;
        db.query(userSql, [email], async (err, userResults) => {
            if (err) return res.status(500).json({ message: 'Database error' });
            if (userResults.length === 0) return res.status(400).json({ message: 'User not found' });

            const user = userResults[0];
            const validPass = await bcrypt.compare(password, user.password);
            if (!validPass) return res.status(400).json({ message: 'Invalid password' });

            // Check if user is suspended
            if (user.account_status === 'suspended') {
                return res.status(403).json({
                    message: 'Account Suspended',
                    redirect: '/suspended.html',
                    reason: user.suspension_reason,
                    email: user.email
                });
            }

            const token = jwt.sign({
                id: user.id,
                role: 'user',
                email: user.email,
                provider_status: user.provider_status
            }, process.env.JWT_SECRET || 'secretkey');

            let responseUser = { ...user, role: 'user' }; // FE expects role
            delete responseUser.password;

            res.json({ token, user: responseUser, message: 'Logged in successfully' });
        });
    });
});

// Submit Appeal
router.post('/appeal', (req, res) => {
    const { email, appeal_message } = req.body;
    if (!email || !appeal_message) return res.status(400).json({ message: 'Email and appeal message are required' });

    const sql = `UPDATE users SET appeal_message = ? WHERE email = ?`;
    db.query(sql, [appeal_message, email], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'Appeal submitted successfully' });
    });
});

// Logout
router.post('/logout', (req, res) => {
    // In a stateless JWT system, we typically handle logout on client side by deleting token.
    // However, this endpoint can be used for:
    // 1. Setting a short expiry cookie if we used cookies (we don't currently)
    // 2. Logging the logout event
    // 3. Blacklisting the token (if we implement a blacklist)

    // For now, we just return success to acknowledge the request.
    res.status(200).json({ message: 'Logged out successfully' });
});

module.exports = router;
