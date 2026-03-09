const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path')
dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')))



// ให้ไฟล์ใน uploads ถูกเข้าถึงเป็น static
app.use('/uploads', express.static('uploads')); //เก็บรูปภาพ

// routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const adminParkingRoutes = require('./routes/admin_parking');
const profileRoutes = require('./routes/profile');
const parkingRoutes = require('./routes/parking');
const providerRoutes = require('./routes/provider');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin-parking', adminParkingRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/parking', parkingRoutes);
app.use('/api/provider', providerRoutes);
const ticketRoutes = require('./routes/tickets');
app.use('/api/tickets', ticketRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
