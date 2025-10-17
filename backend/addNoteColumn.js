const db = require("./db");

db.run(`ALTER TABLE donations ADD COLUMN note TEXT`, (err) => {
  if (err) {
    console.log("Column might already exist or error:", err.message);
  } else {
    console.log("Column 'note' added successfully!");
  }
});
