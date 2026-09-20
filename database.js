const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./odd_jobs.db');

db.serialize(() => {
  // Enable foreign key support in SQLite (disabled by default)
  db.run("PRAGMA foreign_keys = ON");

  // Create table for client service requests/inquiries
  db.run(`CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    service_type TEXT NOT NULL,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migration helper for existing DB installations
  db.run(`ALTER TABLE inquiries ADD COLUMN phone TEXT`, () => {});


  // Create table for jobs offered by ODD JOBS
  db.run(`CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL, -- Internship, Fresher, WFH, Part-time
    description TEXT NOT NULL,
    requirements TEXT,
    location TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create table for candidate job applications
  db.run(`CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_name TEXT NOT NULL,
    candidate_email TEXT NOT NULL,
    job_id INTEGER,
    resume_filename TEXT,
    resume_url TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE SET NULL
  )`);

  // Migration helper for existing DB installations
  db.run(`ALTER TABLE applications ADD COLUMN resume_url TEXT`, () => {});


  // Populate dynamic default job entries
  db.get("SELECT COUNT(*) as count FROM jobs", (err, row) => {
    if (!err && row.count === 0) {
      const stmt = db.prepare("INSERT INTO jobs (title, category, description, requirements, location) VALUES (?, ?, ?, ?, ?)");
     
      stmt.finalize();
      console.log("Database initialized with seed data.");
    }
  });
});

module.exports = db;