const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// Get Pending Parking Requests
router.get('/pending-locations', verifyToken, verifyAdmin, (req, res) => {
    const sql = `
        SELECT pl.*, u.first_name, u.last_name, u.email 
        FROM parking_locations pl
        JOIN users u ON pl.provider_id = u.id
        WHERE pl.status = 'pending' OR pl.status = 'pending_provider' OR pl.status = '' OR pl.status IS NULL
    `;
    db.query(sql, async (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });

        // Enhance results with Zones and Hours
        const enhancedResults = await Promise.all(results.map(async (location) => {
            // Fetch Zones
            const zones = await new Promise((resolve, reject) => {
                db.query('SELECT * FROM parking_zones WHERE location_id = ?', [location.id], (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });

            // Fetch Hours
            const hours = await new Promise((resolve, reject) => {
                db.query('SELECT * FROM operating_hours WHERE location_id = ?', [location.id], (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });

            return { ...location, zones, hours };
        }));

        res.json(enhancedResults);
    });
});

// Get Location Details (Zones, Hours)
router.get('/location-details/:id', verifyToken, verifyAdmin, (req, res) => {
    const locationId = req.params.id;

    // Parallelize queries
    const sqlZones = `SELECT * FROM parking_zones WHERE location_id = ?`;
    const sqlHours = `SELECT * FROM operating_hours WHERE location_id = ?`;

    db.query(sqlZones, [locationId], (err, zones) => {
        if (err) return res.status(500).json({ message: 'Database error' });

        db.query(sqlHours, [locationId], (err, hours) => {
            if (err) return res.status(500).json({ message: 'Database error' });

            res.json({ zones, hours });
        });
    });
});

// Approve Location
router.put('/approve-location/:id', verifyToken, verifyAdmin, (req, res) => {
    const locationId = req.params.id;
    const sql = `UPDATE parking_locations SET status = 'approved' WHERE id = ?`;

    db.query(sql, [locationId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error' });

        // AUTO-CREATE SLOTS
        const sqlGetZones = "SELECT id, capacity FROM parking_zones WHERE location_id = ?";
        db.query(sqlGetZones, [locationId], (errGetZones, zones) => {
            if (errGetZones) console.error("Error fetching zones for slot creation:", errGetZones);
            else {
                zones.forEach(zone => {
                    createSlotsForZone(zone.id, zone.capacity);
                });
            }
            res.json({ message: 'Parking location approved and slots created' });
        });
    });
});

function createSlotsForZone(zoneId, capacity) {
    if (!capacity || capacity <= 0) return;

    db.query("SELECT COUNT(*) as count FROM parking_slots WHERE zone_id = ?", [zoneId], (err, res) => {
        if (err) return console.error("Error checking slots:", err);
        const currentCount = res[0].count;

        if (currentCount < capacity) {
            const slotsToCreate = [];
            for (let i = currentCount + 1; i <= capacity; i++) {
                const slotNumber = `Z${zoneId}-${i}`;
                slotsToCreate.push([slotNumber, zoneId, 'ยังไม่ติดตั้งแม่เหล็ก']);
            }

            if (slotsToCreate.length > 0) {
                const sqlInsert = "INSERT INTO parking_slots (slot_number, zone_id, spot_status) VALUES ?";
                db.query(sqlInsert, [slotsToCreate], (errInsert) => {
                    if (errInsert) console.error(`Error creating slots for Zone ${zoneId}:`, errInsert);
                    else console.log(`Created ${slotsToCreate.length} slots for Zone ${zoneId}`);
                });
            }
        }
    });
}

// Reject Location
router.put('/reject-location/:id', verifyToken, verifyAdmin, (req, res) => {
    const locationId = req.params.id;
    const sql = `UPDATE parking_locations SET status = 'rejected' WHERE id = ?`;
    db.query(sql, [locationId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json({ message: 'Parking location rejected' });
    });
});

// Update Zone Capacity
router.put('/update-zone/:id', verifyToken, verifyAdmin, (req, res) => {
    const zoneId = req.params.id;
    const { capacity } = req.body;

    if (!capacity || isNaN(capacity)) {
        return res.status(400).json({ message: 'Invalid capacity' });
    }

    const sql = `UPDATE parking_zones SET capacity = ? WHERE id = ?`;
    db.query(sql, [capacity, zoneId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'Zone capacity updated successfully' });
    });
});

// Get All Slots for Admin (Grouped by Location/Zone)
router.get('/all-slots', verifyToken, verifyAdmin, (req, res) => {
    const sql = `
        SELECT ps.*, pz.name as zone_name, pl.name as location_name, pl.id as location_id
        FROM parking_slots ps
        JOIN parking_zones pz ON ps.zone_id = pz.id
        JOIN parking_locations pl ON pz.location_id = pl.id
        ORDER BY pl.name, pz.name, ps.slot_number
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// Map Sensor to Slot
router.put('/map-sensor', verifyToken, verifyAdmin, (req, res) => {
    const { slot_id, sensor_id } = req.body;

    if (!slot_id) return res.status(400).json({ message: 'Slot ID is required' });

    // 1. Clear this sensor_id from any other slot (if sensor_id is provided)
    // If sensor_id is null/empty, we are just unmapping the slot.

    const clearOldSql = `UPDATE parking_slots SET sensor_id = NULL WHERE sensor_id = ?`;

    const proceedToUpdate = () => {
        let updateSql = `UPDATE parking_slots SET sensor_id = ? WHERE id = ?`;
        let params = [sensor_id || null, slot_id];

        // If unlinking (sensor_id is null/empty), reset status to 'ยังไม่ติดตั้งแม่เหล็ก'
        if (!sensor_id) {
            updateSql = `UPDATE parking_slots SET sensor_id = ?, spot_status = 'ยังไม่ติดตั้งแม่เหล็ก' WHERE id = ?`;
            params = [null, slot_id];
        }

        db.query(updateSql, params, (err, result) => {
            if (err) {
                return res.status(500).json({ message: 'Database error', error: err });
            }
            res.json({ message: 'Sensor mapped successfully' });
        });
    };

    if (sensor_id) {
        db.query(clearOldSql, [sensor_id], (err) => {
            if (err) return res.status(500).json({ message: 'Database error clearing old map', error: err });
            proceedToUpdate();
        });
    } else {
        proceedToUpdate();
    }
});

module.exports = router;
