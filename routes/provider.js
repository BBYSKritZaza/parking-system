const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

const multer = require('multer');
const path = require('path');

// Configure Multer for Parking Images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/park_pic/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Add Parking Location with Image
router.post('/add-location', verifyToken, upload.single('parkingImage'), async (req, res) => {
    try {
        // Parse JSON data which comes as string if multipart/form-data
        // Because formData sends everything as strings, we need to parse arrays/objects
        const zones = JSON.parse(req.body.zones);
        const pricing = JSON.parse(req.body.pricing);
        const hours = JSON.parse(req.body.hours);
        const { name, lat, lng, details } = req.body;
        const provider_id = req.user.id;
        const image_url = req.file ? '/park_pic/' + req.file.filename : null;

        if (req.user.provider_status !== 'approved') {
            return res.status(403).json({ message: 'Only approved providers can add parking locations' });
        }

        if (!name || !zones || zones.length === 0) {
            return res.status(400).json({ message: 'Name and at least one zone are required' });
        }

        // 1. Insert Location
        const sqlLoc = `INSERT INTO parking_locations (provider_id, name, lat, lng, price_hourly, price_daily, price_monthly, image_url, details, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;
        db.query(sqlLoc, [provider_id, name, lat, lng, pricing.hourly || 0, pricing.daily || 0, pricing.monthly || 0, image_url, details], (err, result) => {
            if (err) throw err;
            const locationId = result.insertId;

            // 2. Insert Zones
            const zoneValues = zones.map(z => [locationId, z.name, z.capacity]);
            const sqlZones = `INSERT INTO parking_zones (location_id, name, capacity) VALUES ?`;
            db.query(sqlZones, [zoneValues], (err, zoneRes) => {
                if (err) throw err;

                // 3. Insert Operating Hours
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
                    if (err) throw err;
                    res.status(201).json({ message: 'Parking location submitted for approval' });
                });
            });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Get My Dashboard Data
router.get('/my-dashboard-data', verifyToken, async (req, res) => {
    const provider_id = req.user.id;

    try {
        // 1. Get Locations
        const sqlLoc = `SELECT * FROM parking_locations WHERE provider_id = ?`;
        db.query(sqlLoc, [provider_id], (err, locations) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            if (locations.length === 0) return res.json([]);

            const dashboardData = [];
            let processed = 0;

            locations.forEach(loc => {
                // 2. Get Zones and Occupancy
                // Join slots to count occupied. LEFT JOIN to ensure zones with 0 slots show up.
                // We need to count is_occupied=1.
                // "Occupied/Total" -> Total is Capacity. Occupied is count of slots?
                // Or provider sets capacity, and sensors update slots. 
                // Let's assume Occupied count comes from `parking_slots` table linked to zone.
                const sqlZones = `
                    SELECT pz.id, pz.name, pz.capacity, 
                    (SELECT COUNT(*) FROM parking_slots ps WHERE ps.zone_id = pz.id AND ps.spot_status IN ('มีรถเล็ก', 'มีรถใหญ่')) as occupied
                    FROM parking_zones pz 
                    WHERE pz.location_id = ?
                `;

                db.query(sqlZones, [loc.id], (err, zones) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ message: 'Error fetching zones' });
                    }

                    // 3. Get Hours to determine Open/Closed
                    const sqlHours = `SELECT * FROM operating_hours WHERE location_id = ?`;
                    db.query(sqlHours, [loc.id], (err, hours) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({ message: 'Error fetching hours' });
                        }

                        // Determine Status
                        let status = 'ปิด'; // Default Closed
                        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const now = new Date();
                        const todayName = days[now.getDay()];

                        // Check explicit status first
                        if (loc.status === 'maintenance') status = 'ปิดปรับปรุง';
                        else if (loc.status === 'suspended') status = 'ถูกระงับการใช้งาน';
                        else if (loc.status === 'pending' || loc.status === 'pending_provider' || !loc.status) status = 'รอการอนุมัติ';
                        else if (loc.status === 'rejected') status = 'ไม่อนุมัติ';
                        else if (loc.status === 'approved') {
                            // Check Operating Hours
                            const todayHours = hours.find(h => h.day_of_week === todayName);
                            if (todayHours && todayHours.is_open) {
                                if (todayHours.is_24h) {
                                    status = 'เปิด';
                                } else {
                                    // Compare time
                                    const open = new Date('1970-01-01T' + todayHours.open_time);
                                    const close = new Date('1970-01-01T' + todayHours.close_time);
                                    const current = new Date('1970-01-01T' + now.toTimeString().split(' ')[0]);
                                    if (current >= open && current <= close) {
                                        status = 'เปิด';
                                    } else {
                                        status = 'ปิด';
                                    }
                                }
                            } else {
                                status = 'ปิด';
                            }
                        }

                        dashboardData.push({
                            id: loc.id,
                            name: loc.name,
                            zones: zones,
                            status: status
                        });

                        processed++;
                        if (processed === locations.length) {
                            res.json(dashboardData);
                        }
                    });
                });
            });
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Helper for Get My Locations (Legacy or Edit usage)
router.get('/my-locations', verifyToken, (req, res) => {
    const provider_id = req.user.id;
    const sql = `SELECT * FROM parking_locations WHERE provider_id = ?`;
    db.query(sql, [provider_id], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json(results);
    });
});

module.exports = router;
