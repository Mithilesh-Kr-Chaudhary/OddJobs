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
    category TEXT NOT NULL, -- Internship, WFH, On-Site jobs
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


  // Populate dynamic default job entries from pre-built templates
  db.get("SELECT COUNT(*) as count FROM jobs", (err, row) => {
    if (!err && row.count === 0) {
      const defaultSeedJobs = [
        {
          title: "Permanent Hiring",
          category: "Recruitment & Hiring",
          location: "Pan India / Hybrid",
          requirements: "Full-cycle recruitment, Candidate screening, Skill assessment, Talent mapping",
          description: "End-to-end permanent recruitment solution for technical, operational, and managerial talent. Sourcing, multi-round screening, background reference checks, and offer negotiation."
        },
        {
          title: "Executive Search",
          category: "Recruitment & Hiring",
          location: "Pan India / Global",
          requirements: "C-suite headhunting, Executive evaluation, Confidential candidate engagement",
          description: "Specialized executive headhunting and leadership placement for Director, VP, and CXO level roles with discrete talent mapping and leadership competency evaluations."
        },
        {
          title: "Payroll Management",
          category: "HR Services",
          location: "Remote / Pan India",
          requirements: "Payroll processing, Statutory tax compliance (PF, ESI, TDS), Salary slip generation",
          description: "Turnkey payroll processing management ensuring timely salary disbursement, statutory deductions (PF, ESI, LWF, TDS), automated payslip distribution, and comprehensive financial reports."
        },
        {
          title: "Training & Development",
          category: "HR Services",
          location: "On-Site / Virtual",
          requirements: "Skill gap analysis, Curriculum design, Soft skills, Leadership & interview workshops",
          description: "Custom corporate training and skill development initiatives including soft skills, interview coaching, corporate workshops, and leadership development."
        },
        {
          title: "Labour Law Compliance",
          category: "Compliance Services",
          location: "Pan India / Regional Audit",
          requirements: "PF, ESI, Factories Act, Minimum Wages Act, Shops & Establishment filings",
          description: "Comprehensive labour law compliance audit and statutory maintenance covering Factories Act, Shops & Establishments, Minimum Wages, PF/ESI registers, and periodic government filings."
        }
      ];

      const stmt = db.prepare("INSERT INTO jobs (title, category, description, requirements, location) VALUES (?, ?, ?, ?, ?)");
      defaultSeedJobs.forEach(job => {
        stmt.run(job.title, job.category, job.description, job.requirements, job.location);
      });
      stmt.finalize();
      console.log("Database initialized with HR & Recruitment seed templates.");
    }
  });
});

module.exports = db;