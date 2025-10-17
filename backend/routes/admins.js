const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const jwt = require('jsonwebtoken');
const router = express.Router();
const saltRounds = 10;

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(403).json({ error: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

// Middleware to check role
function requireRole(roles) {
  return (req, res, next) => {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Get all users (admin only)
router.get('/users', authenticateToken, requireRole(['admin', 'top_admin']), (req, res) => {
  db.all('SELECT id, name, email, role, created_at FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

// Get only admins/top_admins
router.get('/admins', authenticateToken, requireRole(['admin', 'top_admin']), (req, res) => {
  db.all(
    "SELECT id, name, email, role, created_at FROM users WHERE role IN ('admin','top_admin')",
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(rows);
    }
  );
});

// Add new admin (top_admin only)
router.post('/add', authenticateToken, requireRole('top_admin'), async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });

  try {
    const hashed = await bcrypt.hash(password, saltRounds);
    db.run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, 'admin'],
      function (err) {
        if (err) return res.status(400).json({ message: err.message });
        res.json({ id: this.lastID, name, email, role: 'admin' });
      }
    );
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Set role for a user (top_admin only)
router.post('/set-role', authenticateToken, requireRole('top_admin'), (req, res) => {
  const { userId, role } = req.body;
  if (!['admin', 'top_admin'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
  if (req.user.id === userId && role !== 'top_admin') {
    return res.status(400).json({ message: 'Top admin cannot demote themselves' });
  }

  db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId], function (err) {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ success: true });
  });
});

// Delete user (top_admin only)
router.delete('/:id', authenticateToken, requireRole('top_admin'), (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ message: 'Cannot delete yourself' });

  db.run('DELETE FROM users WHERE id = ? AND role IN ("admin","top_admin")', [id], function (err) {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

module.exports = router;
