const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access Denied' });

    try {
        const verified = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET || 'secretkey');
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ message: 'Invalid Token' });
    }
};

const verifyAdmin = (req, res, next) => {
    verifyToken(req, res, () => {
        if (req.user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ message: 'Access Denied: You are not an Admin' });
        }
    });
};

module.exports = { verifyToken, verifyAdmin };
