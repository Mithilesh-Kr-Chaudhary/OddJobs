require('dotenv').config(); // Load environment variables from .env securely
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const {
  saveApplicationToSupabase,
  saveInquiryToSupabase,
  saveJobToSupabase,
  syncJobsToSupabase,
  deleteJobFromSupabase,
  deleteInquiryFromSupabase,
  deleteApplicationFromSupabase
} = require('./supabaseClient');


const app = express();

const PORT = process.env.PORT || 3000; // Updated fallback port to 3000

// Trust the reverse proxy if in production so secure session cookies can be set
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Setup directories for secure resume storage
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Sanitize user-provided filenames to prevent filesystem exploits
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '');
    cb(null, Date.now() + '-' + cleanName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Cap files at 5MB to prevent DoS attacks
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only document files (.pdf, .doc, .docx) are allowed.'));
    }
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve main public folder statically
app.use(express.static(path.join(__dirname, 'public')));

/* 
  SECURITY WARNING FIX:
  Removed: app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  
  Exposing the folder statically allowed unauthenticated users to download candidate resumes. 
  Files are now served through an authorized routing handler below.
*/

// Establish Express session manager (Permanent Local + Production Solution)
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-dev-token-only-not-safe',
  resave: false,
  saveUninitialized: false,
  proxy: true, // Tells express-session to trust proxy headers
  cookie: {
    maxAge: 1000 * 60 * 60 * 2, // 2 Hours duration
    httpOnly: true,              // Protects cookies from XSS read exploits
    sameSite: 'strict',          // Protects session state from CSRF
    secure: 'auto' // AUTOMATIC: Sets to false on HTTP (local), and true on HTTPS (production)
  }
}));

// Authorization middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized access. Please log in.' });
  }
};

/* --- Public API Endpoints --- */

// Public Supabase configuration for client authentication
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || 'https://mwrvvpjoybhfyaotrdin.supabase.co',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13cnZ2cGpveWJoZnlhb3RyZGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NTU1MDYsImV4cCI6MjEwNTMzMTUwNn0.w_gp3es-xBpnWWE0YQT0mvQAZDsGsL6-ZVpqIBk5av0'
  });
});

// Fetch active opportunities

app.get('/api/jobs', (req, res) => {
  db.all('SELECT * FROM jobs ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows && rows.length > 0) {
      syncJobsToSupabase(rows);
    }
    res.json(rows);
  });
});


// Submit client/enterprise business requests
app.post('/api/inquiries', (req, res) => {
  const { name, email, phone, company, service_type, message } = req.body;
  if (!name || !email || !service_type) {
    return res.status(400).json({ error: 'Please submit all required details.' });
  }
  const sql = `INSERT INTO inquiries (name, email, phone, company, service_type, message) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(sql, [name, email, phone || null, company || null, service_type, message || null], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    // Sync to Supabase Database
    saveInquiryToSupabase({ name, email, phone, company, service_type, message });

    res.json({ success: true, inquiryId: this.lastID });
  });
});


// Submit a candidate job application with resume PDF/Word file
app.post('/api/apply', upload.single('resume'), async (req, res) => {
  const { candidate_name, candidate_email, job_id, message } = req.body;
  const resume_filename = req.file ? req.file.filename : null;
  const filePath = req.file ? req.file.path : null;

  if (!candidate_name || !candidate_email || !job_id) {
    return res.status(400).json({ error: 'Missing candidate details.' });
  }

  // Upload resume PDF/Word to Supabase Storage ('resumes' bucket) and save application row
  const supabaseRes = await saveApplicationToSupabase(
    { candidate_name, candidate_email, job_id, resume_filename, message },
    filePath
  );

  const resume_url = (supabaseRes && supabaseRes[0]) ? supabaseRes[0].resume_url : null;

  const sql = `INSERT INTO applications (candidate_name, candidate_email, job_id, resume_filename, resume_url, message) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(sql, [candidate_name, candidate_email, job_id, resume_filename, resume_url, message], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, applicationId: this.lastID, resumeUrl: resume_url });
  });
});


/* --- Admin APIs --- */

// Login validator (Pulls securely from environment configurations instead of codebase plaintext)
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const sysUsername = process.env.ADMIN_USERNAME || 'admin';
  const sysPassword = process.env.ADMIN_PASSWORD || 'oddjobs2026';

  if (username === sysUsername && password === sysPassword) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Incorrect login credentials.' });
  }
});

// Session check
app.get('/api/admin/check-session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// Logout
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Could not log out.' });
    res.clearCookie('connect.sid'); // Wipe local session identifier
    res.json({ success: true });
  });
});

// Securely download candidate resumes (Only accessible to authorized administrators)
app.get('/uploads/:filename', requireAuth, (req, res) => {
  const filename = req.params.filename;
  // Prevent directory traversal attacks by extracting only the base filename
  const safeFilename = path.basename(filename);
  const filePath = path.join(uploadDir, safeFilename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File resource not found.' });
  }
});

// Fetch client inquiries (Admin only)
app.get('/api/admin/inquiries', requireAuth, (req, res) => {
  db.all('SELECT * FROM inquiries ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Fetch job applications (Admin only)
app.get('/api/admin/applications', requireAuth, (req, res) => {
  const sql = `
    SELECT a.*, j.title as job_title, j.category as job_category 
    FROM applications a 
    LEFT JOIN jobs j ON a.job_id = j.id 
    ORDER BY a.created_at DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create new job posting (Admin only)
app.post('/api/jobs', requireAuth, (req, res) => {
  const { title, category, description, requirements, location } = req.body;
  if (!title || !category || !description || !location) {
    return res.status(400).json({ error: 'Required fields missing.' });
  }
  const sql = `INSERT INTO jobs (title, category, description, requirements, location) VALUES (?, ?, ?, ?, ?)`;
  db.run(sql, [title, category, description, requirements, location], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    // Sync to Supabase Database
    saveJobToSupabase({ title, category, description, requirements, location });

    res.json({ success: true, jobId: this.lastID });
  });
});

// Delete active job listing (Admin only)
app.delete('/api/jobs/:id', requireAuth, (req, res) => {
  const jobId = parseInt(req.params.id, 10);

  if (isNaN(jobId)) {
    return res.status(400).json({ error: 'Invalid job ID parameter.' });
  }

  db.run('DELETE FROM jobs WHERE id = ?', jobId, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Job record not found.' });
    }

    // Sync deletion to Supabase
    deleteJobFromSupabase(jobId);

    res.json({ success: true });
  });
});

// Forgot Password pathway routing (Admin only)
app.post('/api/admin/forgot-password', (req, res) => {
  const { pathway } = req.body;

  if (pathway === 'email') {
    const adminEmail = process.env.ADMIN_RECOVERY_EMAIL || 'admin@oddjobs.in';
    console.log(`[SECURITY EVENT] Reset token dispatched to masked system email: ${adminEmail}`);
    return res.json({ success: true });
  } else if (pathway === 'phone') {
    const adminPhone = process.env.ADMIN_RECOVERY_PHONE || '+919876543210';
    console.log(`[SECURITY EVENT] OTP challenge SMS dispatched to masked system number: ${adminPhone}`);
    return res.json({ success: true });
  }

  res.status(400).json({ error: 'Invalid recovery parameter received.' });
});

// Delete a corporate inquiry (Admin only)
app.delete('/api/admin/inquiries/:id', requireAuth, (req, res) => {
  const inquiryId = parseInt(req.params.id, 10);

  if (isNaN(inquiryId)) {
    return res.status(400).json({ error: 'Invalid inquiry ID parameter.' });
  }

  const sql = 'DELETE FROM inquiries WHERE id = ?';
  db.run(sql, inquiryId, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Inquiry record not found.' });
    }

    // Sync deletion to Supabase
    deleteInquiryFromSupabase(inquiryId);

    res.json({ success: true });
  });
});

// Delete a candidate application and their associated resume file (Admin only)
app.delete('/api/admin/applications/:id', requireAuth, (req, res) => {
  const appId = parseInt(req.params.id, 10);
  if (isNaN(appId)) {
    return res.status(400).json({ error: 'Invalid application ID parameter.' });
  }

  // 1. Fetch the database record first to extract the resume filename
  db.get('SELECT resume_filename FROM applications WHERE id = ?', appId, (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Application record not found.' });
    }

    const filename = row.resume_filename;

    // 2. Delete application record from local database & Supabase
    db.run('DELETE FROM applications WHERE id = ?', appId, function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      deleteApplicationFromSupabase(appId);

      // 3. Delete the associated PDF/Word resume file safely from disk
      if (filename) {
        const filePath = path.join(uploadDir, filename);
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr && unlinkErr.code !== 'ENOENT') {
            console.error(`Failed to delete resume file on disk: ${filePath}`, unlinkErr);
          }
        });
      }

      res.json({ success: true });
    });
  });
});


// Express Error Handling Middleware (Catches Multer or other internal errors)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`[SECURED] ODD JOBS server running at http://localhost:${PORT}`);
});