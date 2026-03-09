const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, verifyAdmin, verifyProvider } = require('../middleware/auth');

// Create Ticket
router.post('/create', verifyToken, (req, res) => {
    const { role, ticket_type, description, parking_location_id, parking_zone_id } = req.body;
    const userId = req.user.id; // From valid token

    // Basic validation
    if (!ticket_type || !description) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const sql = `INSERT INTO support_tickets (user_id, role, ticket_type, description, parking_location_id, parking_zone_id) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(sql, [userId, role, ticket_type, description, parking_location_id || null, parking_zone_id || null], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'Ticket created successfully', ticketId: result.insertId });
    });
});

// Get My Tickets
router.get('/my-tickets', verifyToken, (req, res) => {
    const userId = req.user.id;
    const role = req.query.role; // 'user' or 'provider' context

    if (!role) return res.status(400).json({ message: 'Role query parameter required' });

    let sql = `SELECT * FROM support_tickets WHERE user_id = ? AND role = ? ORDER BY created_at DESC`;
    db.query(sql, [userId, role], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// Admin: Get Tickets by Role
router.get('/admin/list', verifyToken, verifyAdmin, (req, res) => {
    const role = req.query.role; // 'user' or 'provider'
    if (!role) return res.status(400).json({ message: 'Role parameter required' });

    // Join with users and parking_locations for better context
    let sql = `
        SELECT t.*, u.first_name, u.last_name, u.email, u.phone, 
               pl.name as parking_name, pz.name as zone_name
        FROM support_tickets t
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN parking_locations pl ON t.parking_location_id = pl.id
        LEFT JOIN parking_zones pz ON t.parking_zone_id = pz.id
        WHERE t.role = ?
        ORDER BY t.created_at DESC
    `;

    db.query(sql, [role], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// Admin: Update Status & Reply
router.put('/admin/update/:id', verifyToken, verifyAdmin, (req, res) => {
    const { status, admin_reply } = req.body;
    const ticketId = req.params.id;

    // "is_read_by_user" should be reset to FALSE when admin replies/updates, so user sees it as "unread" or updated?
    // Requirement: "2.1 ยังไม่อ่าน (user ยังไม่ได้อ่าน)" -> This usually means the user receives a reply. 
    // Let's assume sending a reply makes it unread for the user.

    let sql = `UPDATE support_tickets SET status = ?, admin_reply = ?, is_read_by_user = FALSE WHERE id = ?`;
    db.query(sql, [status, admin_reply, ticketId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'Ticket updated' });
    });
});

// User/Provider: Mark as Read
router.put('/mark-read/:id', verifyToken, (req, res) => {
    const ticketId = req.params.id;
    const userId = req.user.id;

    // Verify ownership
    db.query('UPDATE support_tickets SET is_read_by_user = TRUE WHERE id = ? AND user_id = ?', [ticketId, userId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'Marked as read' });
    });
});

module.exports = router;
