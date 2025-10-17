const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const db = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const saltRounds = 10;

// ----------------------
// Register
// ----------------------
router.post("/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  db.get("SELECT id FROM users WHERE email = ?", [email], async (err, existing) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (existing) return res.status(400).json({ message: "Email already exists" });

    const hash = await bcrypt.hash(password, saltRounds);
    db.run(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      [name, email, hash, "user"], // default role = "user"
      function (err) {
        if (err) return res.status(500).json({ message: "Register failed" });

        const token = jwt.sign({ id: this.lastID }, JWT_SECRET, { expiresIn: "1h" });

        db.get("SELECT id, name, email, role FROM users WHERE id = ?", [this.lastID], (err, row) => {
          if (err) return res.status(500).json({ message: "DB error" });
          res.json({ user: row, token });
        });
      }
    );
  });
});

// ----------------------
// Login
// ----------------------
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "1h" });
    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token,
    });
  });
});

// ----------------------
// Forgot Password
// ----------------------
router.post("/forgot-password", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  db.get("SELECT id, name, email FROM users WHERE email = ?", [email], (err, user) => {
    if (err) return res.status(500).json({ message: "Server error" });

    // Always return generic success
    if (!user) {
      return res.json({ success: true, message: "If that email exists, a reset link has been sent." });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "15m" });
    const resetLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password/${token}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    const mailOptions = {
      from: `"Vivekananda Club" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Reset your Vivekananda Club account password",
      html: `
        <p>Hello <b>${user.name || user.email}</b>,</p>
        <p>We received a request to reset your password.</p>
        <p><a href="${resetLink}">Reset your password</a></p>
        <p>If you didn’t request this, please ignore this email.</p>
      `,
    };

    transporter.sendMail(mailOptions).catch(err => console.error("Mail error:", err));

    res.json({ success: true, message: "If that email exists, a reset link has been sent." });
  });
});

// ----------------------
// Reset Password
// ----------------------
router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password) return res.status(400).json({ message: "Password is required" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const hash = await bcrypt.hash(password, saltRounds);

    db.run("UPDATE users SET password = ? WHERE id = ?", [hash, decoded.id], function (err) {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json({ success: true, message: "Password reset successful" });
    });
  } catch (e) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }
});

module.exports = router;
