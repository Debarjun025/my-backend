const express = require('express');
const db = require('../db');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth'); // 👈 removed requireRole
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// ----------------- Multer Configuration -----------------
const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  },
});

// ----------------- USER DONATIONS -----------------
router.post('/donate', authenticateToken, upload.single('proof'), (req, res) => {
  const { amount, method, note } = req.body;
  const proofPath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!amount || !method) {
    return res.status(400).json({ success: false, error: 'Amount and method are required.' });
  }

  if (method === 'online' && !proofPath) {
    return res.status(400).json({ success: false, error: 'Payment proof is required for online donations.' });
  }

  db.run(
    `INSERT INTO donations (user_id, amount, method, proof, note) VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, Number(amount), method.trim(), proofPath, note || null],
    function (err) {
      if (err) return res.status(500).json({ success: false, error: err.message });

      res.json({
        success: true,
        message: 'Donation recorded successfully',
        donation: {
          id: this.lastID,
          user_id: req.user.id,
          amount: Number(amount),
          method: method.trim(),
          proof: proofPath,
          note: note || null,
        },
      });
    }
  );
});

// ----------------- GET USER DONATIONS -----------------
router.get('/donate/my', authenticateToken, (req, res) => {
  db.all(
    `SELECT * FROM donations WHERE user_id = ? ORDER BY created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, donations: rows });
    }
  );
});

// ----------------- GUEST / RECORDED DONORS -----------------
router.post('/', upload.single('proof'), (req, res) => {
  const { name, phone, email, amount, payment_mode, note } = req.body;
  const proofPath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !phone || !email || !amount || !payment_mode) {
    return res.status(400).json({ success: false, error: 'All fields (name, phone, email, amount, payment_mode) are required.' });
  }

  // Optional recorded_by if token present
  let recorded_by = null;
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      recorded_by = decoded.id;
    } catch {
      recorded_by = null;
    }
  }

  db.run(
    `INSERT INTO donors (name, phone, email, amount, payment_mode, note, recorded_by, proof)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name.trim(),
      phone.trim(),
      email.trim(),
      Number(amount),
      payment_mode.trim(),
      note?.trim() || '',
      recorded_by,
      proofPath,
    ],
    function (err) {
      if (err) return res.status(500).json({ success: false, error: err.message });

      res.json({
        success: true,
        message: `Donor ${name.trim()} added successfully`,
        donor: {
          id: this.lastID,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          amount: Number(amount),
          payment_mode: payment_mode.trim(),
          proof: proofPath,
          recorded_by,
        },
      });
    }
  );
});

// ----------------- ADMIN-ONLY CASH DONATIONS -----------------
router.post(
  '/cash',
  authenticateToken,
  (req, res) => {
    const { name, phone, email, amount, note } = req.body;
    if (!name || !phone || !email || !amount) {
      return res.status(400).json({ success: false, error: 'All fields required.' });
    }

    const recorded_by = req.user.id;

    db.run(
      `INSERT INTO donors (name, phone, email, amount, payment_mode, note, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), phone.trim(), email.trim(), Number(amount), 'cash', note?.trim() || '', recorded_by],
      function (err) {
        if (err) return res.status(500).json({ success: false, error: err.message });

        res.json({
          success: true,
          message: `Cash donor ${name.trim()} added successfully`,
          donor: {
            id: this.lastID,
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            amount: Number(amount),
            payment_mode: 'cash',
            recorded_by,
          },
        });
      }
    );
  }
);

// ----------------- SEARCH & RECENT -----------------
router.get('/search', authenticateToken, (req, res) => {
  const q = req.query.q || '';
  db.all(
    `SELECT d.*, u.name as recorded_by_name 
     FROM donors d 
     LEFT JOIN users u ON d.recorded_by = u.id 
     WHERE d.name LIKE ? 
     ORDER BY d.created_at DESC`,
    [`%${q}%`],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, donors: rows });
    }
  );
});

router.get('/recent', (req, res) => {
  db.all(
    `SELECT d.*, u.name as recorded_by_name 
     FROM donors d 
     LEFT JOIN users u ON d.recorded_by = u.id 
     ORDER BY d.created_at DESC 
     LIMIT 100`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, donors: rows });
    }
  );
});

// ----------------- DELETE DONOR -----------------
router.delete(
  '/:id',
  authenticateToken, // 👈 removed requireRole
  (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM donors WHERE id = ?`, [id], function (err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({
        success: true,
        message: `Donor with ID ${id} deleted`,
        deleted: this.changes,
      });
    });
  }
);

module.exports = router;
