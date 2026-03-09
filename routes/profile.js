const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const { verifyToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Multer setup for user profile pic
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/user_pic/');
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Get Profile
router.get('/', verifyToken, (req, res) => {
    const { role, id } = req.user;

    // Admin check or defaulting to users
    if (role === 'admin') {
        // Admins might not have full profile fields, but if needed:
        return res.json({ message: 'Admin profile not fully implemented via this route' });
    }

    // We assume it's a user (since providers are now users)
    const sql = `SELECT first_name, last_name, phone, email, profile_pic FROM users WHERE id = ?`;
    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        if (results.length === 0) return res.status(404).json({ message: 'User not found' });
        res.json(results[0]);
    });
});

// Update Profile
router.put('/', verifyToken, upload.single('profile_pic'), async (req, res) => {
    const { role, id } = req.user;
    const { first_name, last_name, phone } = req.body;

    if (role === 'admin') return res.status(403).json({ message: 'Admin cannot use this route' });

    let sql = '';
    let params = [];

    if (req.file) {
        const profile_pic = 'user_pic/' + req.file.filename;
        sql = `UPDATE users SET first_name = ?, last_name = ?, phone = ?, profile_pic = ? WHERE id = ?`;
        params = [first_name, last_name, phone, profile_pic, id];
    } else {
        sql = `UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?`;
        params = [first_name, last_name, phone, id];
    }

    try {
        db.query(sql, params, (err, result) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.json({ message: 'Profile updated successfully' });
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update Password
router.put('/password', verifyToken, async (req, res) => {
    const { role, id } = req.user;
    const { password } = req.body;

    if (role === 'admin') return res.status(403).json({ message: 'Admin cannot use this route' });

    if (!password || password.trim() === '') {
        return res.status(400).json({ message: 'Password is required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = `UPDATE users SET password = ? WHERE id = ?`;
        db.query(sql, [hashedPassword, id], (err, result) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.json({ message: 'Password updated successfully' });
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
