const db = require('./db');

const resetQuery = "UPDATE parking_slots SET spot_status = 'ยังไม่ติดตั้งแม่เหล็ก'";

db.query(resetQuery, (err, result) => {
    if (err) {
        console.error('❌ Error resetting parking statuses:', err);
    } else {
        console.log(`✅ Successfully reset ${result.affectedRows} parking slots to 'ยังไม่ติดตั้งแม่เหล็ก'.`);
    }
    db.end();
});
