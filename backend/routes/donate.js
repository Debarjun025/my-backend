// routes/donate.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const db = require("../db");  // ✅ Import DB
const jwt = require("jsonwebtoken");

// File upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads")),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Middleware to check logged in user (optional)
function verifyUser(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(403).json({ error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = decoded;
    next();
  });
}

// Donation route (guest / logged-in user)
router.post("/", upload.single("proof"), (req, res) => {
  const { name, phone, email, amount, payment_mode, note } = req.body;
  const proofPath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !phone || !email || !amount || !payment_mode) {
    return res.status(400).json({ error: "All fields are required." });
  }

  db.run(
    `INSERT INTO donors (name, phone, email, amount, payment_mode, note, proof)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, phone, email, Number(amount), payment_mode, note || null, proofPath],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        id: this.lastID,
        name,
        phone,
        email,
        amount: Number(amount),
        payment_mode,
        proof: proofPath,
        note: note || null
      });
    }
  );
});

module.exports = router;
