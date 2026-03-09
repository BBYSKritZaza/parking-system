const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// Get All Users (including Providers)
router.get('/users', verifyToken, verifyAdmin, (req, res) => {
    // Select all users with provider_status
    const sql = `SELECT id, first_name, last_name, email, phone, provider_status, account_status, suspension_reason, appeal_message FROM users`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// Get Approved Providers
router.get('/providers', verifyToken, verifyAdmin, (req, res) => {
    // Logic: users with provider_status = 'approved'
    const sql = `SELECT id, first_name, last_name, email, phone FROM users WHERE provider_status = 'approved'`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// Get Pending Providers
router.get('/pending-providers', verifyToken, verifyAdmin, (req, res) => {
    // Join with parking locations to see if there is a pending application parking
    const sql = `
        SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.id_card_number, u.id_card_image,
               pl.id as parking_id, pl.name as parking_name, pl.lat, pl.lng, pl.image_url as parking_image_url,
               pl.price_hourly, pl.price_daily, pl.price_monthly
        FROM users u
        LEFT JOIN parking_locations pl ON u.id = pl.provider_id AND (pl.status = 'pending_provider' OR pl.status = 'pending' OR pl.status = '' OR pl.status IS NULL)
        WHERE u.provider_status = 'pending'
    `;
    db.query(sql, async (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });

        // Enhance results with Zones and Hours
        const enhancedResults = await Promise.all(results.map(async (provider) => {
            if (!provider.parking_id) return provider;

            // Fetch Zones
            const zones = await new Promise((resolve, reject) => {
                db.query('SELECT * FROM parking_zones WHERE location_id = ?', [provider.parking_id], (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });

            // Fetch Hours
            const hours = await new Promise((resolve, reject) => {
                db.query('SELECT * FROM operating_hours WHERE location_id = ?', [provider.parking_id], (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });

            return { ...provider, zones, hours };
        }));

        res.json(enhancedResults);
    });
});

// All Parking Update: Filter out pending_provider?
// router.get('/all-parking'...) usually selects all. It might show the pending one. That's fine.

// Get All Parking Locations
router.get('/all-parking', verifyToken, verifyAdmin, (req, res) => {
    const sql = `
        SELECT pl.*, u.first_name, u.last_name, u.email, u.phone 
        FROM parking_locations pl
        LEFT JOIN users u ON pl.provider_id = u.id
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// Approve Provider
// Approve Provider
router.put('/approve-provider/:id', verifyToken, verifyAdmin, (req, res) => {
    const providerId = req.params.id;
    // Transaction-like approach
    db.query("UPDATE users SET provider_status = 'approved' WHERE id = ?", [providerId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });

        // Also approve any 'pending_provider' parking for this user (or empty status)
        const sqlApproveParking = "UPDATE parking_locations SET status = 'approved' WHERE provider_id = ? AND (status = 'pending_provider' OR status = 'pending' OR status = '' OR status IS NULL)";
        db.query(sqlApproveParking, [providerId], (errLoc, resultLoc) => {
            if (errLoc) console.error("Error approving parking:", errLoc);

            // AUTO-CREATE SLOTS LOGIC
            // Find all locations that were just approved (or all approved locations for this provider to be safe/idempotent)
            const sqlGetLocations = "SELECT id FROM parking_locations WHERE provider_id = ? AND status = 'approved'";
            db.query(sqlGetLocations, [providerId], (errGetLoc, locations) => {
                if (errGetLoc) return res.json({ message: 'Provider approved, but error fetching locations for slot creation' });

                if (locations.length > 0) {
                    const locationIds = locations.map(l => l.id);
                    // Find zones for these locations
                    const sqlGetZones = "SELECT id, capacity FROM parking_zones WHERE location_id IN (?)";
                    db.query(sqlGetZones, [locationIds], (errGetZones, zones) => {
                        if (errGetZones) return res.json({ message: 'Provider approved, but error fetching zones' });

                        // Create slots for each zone
                        zones.forEach(zone => {
                            createSlotsForZone(zone.id, zone.capacity);
                        });

                        res.json({ message: 'Provider and associated parking approved successfully. Slots created.' });
                    });
                } else {
                    res.json({ message: 'Provider approved successfully (No parking locations found).' });
                }
            });
        });
    });
});

function createSlotsForZone(zoneId, capacity) {
    if (!capacity || capacity <= 0) return;

    // Check existing slots to avoid duplicates/overwrite if already exists
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

// Delete User (Full delete)
router.delete('/user/:id', verifyToken, verifyAdmin, (req, res) => {
    const userId = req.params.id;
    db.query('DELETE FROM users WHERE id = ?', [userId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'User deleted successfully' });
    });
});

// Delete Provider (Demote to normal user) - Legacy route, keeping if needed
router.delete('/provider/:id', verifyToken, verifyAdmin, (req, res) => {
    const providerId = req.params.id;
    db.query("UPDATE users SET provider_status = 'none' WHERE id = ?", [providerId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'Provider removed (demoted to user) successfully' });
    });
});

// Delete Parking
router.delete('/parking/:id', verifyToken, verifyAdmin, (req, res) => {
    const locationId = req.params.id;

    // First, find all zones for this location to delete their slots
    const getZonesSql = `SELECT id FROM parking_zones WHERE location_id = ?`;
    db.query(getZonesSql, [locationId], (err, zones) => {
        if (err) return res.status(500).json({ message: 'Database error finding zones', error: err });

        const zoneIds = zones.map(z => z.id);

        // If there are zones, delete their slots
        if (zoneIds.length > 0) {
            const deleteSlotsSql = `DELETE FROM parking_slots WHERE zone_id IN (?)`;
            db.query(deleteSlotsSql, [zoneIds], (err, result) => {
                if (err) return res.status(500).json({ message: 'Database error deleting slots', error: err });

                // Now delete the location (cascades to zones)
                deleteLocation(locationId, res);
            });
        } else {
            // No zones, just delete location
            deleteLocation(locationId, res);
        }
    });
});

function deleteLocation(locationId, res) {
    const sql = `DELETE FROM parking_locations WHERE id = ?`;
    db.query(sql, [locationId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error deleting location', error: err });
        res.json({ message: 'Parking location and associated data deleted' });
    });
}

// Suspend Parking
router.put('/suspend-parking/:id', verifyToken, verifyAdmin, (req, res) => {
    const sql = `UPDATE parking_locations SET status = 'suspended' WHERE id = ?`;
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'Parking suspended' });
    });
});

// Suspend User
router.put('/suspend-user/:id', verifyToken, verifyAdmin, (req, res) => {
    const userId = req.params.id;
    const { reason } = req.body;

    if (!reason) return res.status(400).json({ message: 'Suspension reason is required' });

    const sql = `UPDATE users SET account_status = 'suspended', suspension_reason = ? WHERE id = ?`;
    db.query(sql, [reason, userId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'User suspended successfully' });
    });
});

// Unsuspend User
router.put('/unsuspend-user/:id', verifyToken, verifyAdmin, (req, res) => {
    const userId = req.params.id;
    const sql = `UPDATE users SET account_status = 'active', suspension_reason = NULL, appeal_message = NULL WHERE id = ?`;
    db.query(sql, [userId], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'User unsuspended successfully' });
    });
});

module.exports = router;
