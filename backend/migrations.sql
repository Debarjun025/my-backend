-- ==========================
-- Pandal Database Migrations (Improved)
-- ==========================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user', -- possible values: 'user' | 'admin' | 'top_admin'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Donations table
CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL, -- store in paise/cents to avoid floating point issues
  method TEXT NOT NULL, -- 'online' | 'cash'
  proof TEXT, -- uploaded payment proof file path
  status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Insert a default admin (only if not exists)
INSERT INTO users (name, email, password, role)
SELECT 'Admin', 'admin@pandal.com', '$2b$12$4Ot3MvgUUoxOqn454wyIAee8aHaPYm3BTU5D4m545YNF/ruvRoG5K', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@pandal.com');
