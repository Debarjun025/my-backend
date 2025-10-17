require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer'); // ✅ added

// Auth middleware (in case you need it at app-level later)
const { authenticateToken, requireRole } = require('./middleware/auth');

const app = express();

// ----------------- Middleware -----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Allow multiple frontend origins (React dev servers)
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin.startsWith("http://localhost")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// ----------------- DB Setup / Migrations -----------------
const dbPath = path.join(__dirname, 'pandal.db');
if (!fs.existsSync(dbPath)) {
  const migrationsPath = path.join(__dirname, 'migrations.sql');
  if (fs.existsSync(migrationsPath)) {
    const migrations = fs.readFileSync(migrationsPath, 'utf8');
    db.exec(migrations, (err) => {
      if (err) console.error('❌ DB migration error:', err);
      else console.log('✅ DB created & migrated');
    });
  } else {
    console.error('❌ migrations.sql not found!');
  }
}

// ----------------- Static Uploads -----------------
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Serve proof/image uploads at http://localhost:4000/uploads/<filename>
app.use('/uploads', express.static(uploadDir));

// ----------------- Email Transporter (for forgot password) -----------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // use App Password for Gmail
  },
});

// make transporter accessible in routes
app.set("mailer", transporter);

// ----------------- Routes -----------------
app.get('/', (req, res) => {
  res.json({ message: '🎉 Pandal backend running' });
});

// ✅ Mount routes (includes forgot/reset password inside auth.js)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/donors', require('./routes/donors'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admins', require('./routes/admins'));
app.use('/api/donate', require('./routes/donate')); // donation handling

// ----------------- 404 Handler -----------------
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ----------------- Start Server -----------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
