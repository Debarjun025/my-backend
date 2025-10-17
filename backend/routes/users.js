const express = require('express');
const db = require('../db');
const bcrypt = require('bcrypt');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const saltRounds = 10;

// Public: list all donors
router.get('/donors', (req, res) => {
  db.all(
    `SELECT u.name, d.amount, d.method, d.created_at 
     FROM donations d 
     JOIN users u ON d.user_id = u.id
     ORDER BY d.created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Admin-only: list all members (users)
router.get('/members', authenticateToken, requireRole(['admin', 'top_admin']), (req, res) => {
  db.all(
    'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(rows);
    }
  );
});

// Admin-only: add new member
router.post('/add', authenticateToken, requireRole(['admin', 'top_admin']), async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });

  try {
    const hashed = await bcrypt.hash(password, saltRounds);
    db.run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, 'user'],
      function (err) {
        if (err) return res.status(400).json({ message: err.message });
        res.json({ id: this.lastID, name, email, role: 'user' });
      }
    );
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Admin-only: delete a member
router.delete('/:id', authenticateToken, requireRole(['admin', 'top_admin']), (req, res) => {
  const id = parseInt(req.params.id);
  db.run('DELETE FROM users WHERE id = ? AND role = "user"', [id], function (err) {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

module.exports = router;
