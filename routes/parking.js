const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/parking/update - Update parking slot status
// Expects JSON: { "slot_number": "Slot 1", "spot_status": "ว่าง" } OR { "sensor_id": "SENSOR_01", "spot_status": "..." }
// spot_status ENUM('ว่าง', 'มีรถเล็ก', 'มีรถใหญ่', 'ไม่ใช่รถ', 'ยังไม่ติดตั้งแม่เหล็ก')
router.post('/update', (req, res) => {
    let { slot_number, sensor_id, spot_status } = req.body;

    if ((!slot_number && !sensor_id) || !spot_status) {
        return res.status(400).json({ error: 'Missing slot_number/sensor_id or spot_status' });
    }

    const validStatuses = ['ว่าง', 'มีรถเล็ก', 'มีรถใหญ่', 'ไม่ใช่รถ', 'ยังไม่ติดตั้งแม่เหล็ก', 'ถูกจอง'];
    if (!validStatuses.includes(spot_status)) {
        return res.status(400).json({ error: 'Invalid spot_status. Must be one of: ' + validStatuses.join(', ') });
    }

    const performUpdate = (targetSlot) => {
        // Check current status first to handle reservation logic
        db.query("SELECT spot_status FROM parking_slots WHERE slot_number = ?", [targetSlot], (err, results) => {
            if (err) return res.status(500).json({ error: 'Database checking error' });
            if (results.length === 0) return res.status(404).json({ error: 'Slot not found' });

            const currentStatus = results[0].spot_status;

            // Rule: If current status is 'ถูกจอง' (Reserved) AND sensor says 'ว่าง' (Empty),
            // IGNORE the update. The user hasn't arrived yet.
            if (currentStatus === 'ถูกจอง' && spot_status === 'ว่าง') {
                return res.json({ message: 'Slot is reserved, ignoring empty signal', slot: targetSlot });
            }

            // Otherwise, update normally (e.g. car arrives -> 'มีรถ...', or 'ว่าง' -> 'ว่าง')
            const updateQuery = 'UPDATE parking_slots SET spot_status = ?, last_updated = NOW() WHERE slot_number = ?';
            db.query(updateQuery, [spot_status, targetSlot], (err, result) => {
                if (err) return res.status(500).json({ error: 'Database update error' });

                console.log(`Updated ${targetSlot}: Status=${spot_status}`);
                res.json({ message: 'Slot updated successfully', slot: targetSlot, status: spot_status });
            });
        });
    };

    if (sensor_id) {
        // Look up slot_number by sensor_id
        db.query("SELECT slot_number FROM parking_slots WHERE sensor_id = ?", [sensor_id], (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (results.length === 0) return res.status(404).json({ error: 'Sensor ID not mapped to any slot' });

            performUpdate(results[0].slot_number);
        });
    } else {
        performUpdate(slot_number);
    }
});

// POST /api/parking/reserve - Reserve a spot in a zone
router.post('/reserve', (req, res) => {
    const { zone_id, user_id } = req.body; // user_id for future tracking

    if (!zone_id) return res.status(400).json({ message: 'Zone ID is required' });

    // Find a free slot
    const findSlotSql = `SELECT id, slot_number FROM parking_slots WHERE zone_id = ? AND spot_status = 'ว่าง' LIMIT 1`;

    db.query(findSlotSql, [zone_id], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });

        if (results.length === 0) {
            return res.status(400).json({ message: 'ไม่พบที่จอดรถว่างในโซนนี้ (No available slots)' });
        }

        const slot = results[0];

        // Reserve it
        const updateSql = `UPDATE parking_slots SET spot_status = 'ถูกจอง', last_updated = NOW() WHERE id = ?`;
        db.query(updateSql, [slot.id], (upErr, upRes) => {
            if (upErr) return res.status(500).json({ message: 'Update error', error: upErr });

            res.json({
                message: 'จองที่จอดรถสำเร็จ (Reservation Successful)',
                slot_number: slot.slot_number,
                status: 'ถูกจอง'
            });
        });
    });
});

// GET /api/parking/status - Get all slots status
router.get('/status', (req, res) => {
    const query = 'SELECT * FROM parking_slots';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching parking status:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// GET /api/parking/status/:zone_id - Get slots for a specific zone
router.get('/status/:zone_id', (req, res) => {
    const zoneId = req.params.zone_id;
    const query = 'SELECT * FROM parking_slots WHERE zone_id = ?';
    db.query(query, [zoneId], (err, results) => {
        if (err) {
            console.error('Error fetching zone status:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// GET /api/parking/search - Search approved locations
router.get('/search', (req, res) => {
    const sql = `SELECT * FROM parking_locations WHERE status = 'approved'`;
    db.query(sql, (err, locations) => {
        if (err) return res.status(500).json({ message: 'Database error' });

        if (locations.length === 0) {
            return res.json([]);
        }

        // Get operating hours for these locations
        const locationIds = locations.map(l => l.id);
        const hoursSql = `SELECT * FROM operating_hours WHERE location_id IN (?)`;

        db.query(hoursSql, [locationIds], (err, hours) => {
            if (err) {
                console.error('Error fetching operating hours:', err);
                // Return locations without hours if error, or specific error? 
                // Let's return locations but logged error.
                return res.json(locations);
            }

            // Map hours to locations
            const locationsWithHours = locations.map(loc => {
                const locHours = hours.filter(h => h.location_id === loc.id);
                return { ...loc, operating_hours: locHours };
            });

            res.json(locationsWithHours);
        });
    });
});

// GET /api/parking/zones/:location_id - Get zones for a location with availability
router.get('/zones/:location_id', (req, res) => {
    const locId = req.params.location_id;
    const sql = `
        SELECT pz.id, pz.name, 
        (SELECT COUNT(*) FROM parking_slots ps WHERE ps.zone_id = pz.id AND ps.spot_status = 'ว่าง') as available_slots 
        FROM parking_zones pz 
        WHERE pz.location_id = ?
    `;
    db.query(sql, [locId], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

module.exports = router;
