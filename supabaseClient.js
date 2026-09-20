require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL || 'https://mwrvvpjoybhfyaotrdin.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13cnZ2cGpveWJoZnlhb3RyZGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NTU1MDYsImV4cCI6MjEwNTMzMTUwNn0.w_gp3es-xBpnWWE0YQT0mvQAZDsGsL6-ZVpqIBk5av0';

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Upload candidate resume document (PDF/Word) to Supabase Storage ('resumes' bucket)
 */
async function uploadResumeToSupabase(filePath, originalFilename) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`[SUPABASE STORAGE] File path not found on disk: ${filePath}`);
      return null;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const storageFileName = `${Date.now()}-${path.basename(originalFilename || filePath)}`;

    const { data, error } = await supabase.storage
      .from('resumes')
      .upload(storageFileName, fileBuffer, {
        contentType: getContentType(originalFilename || filePath),
        upsert: true
      });

    if (error) {
      console.error('[SUPABASE STORAGE] Upload error:', error.message);
      return null;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('resumes')
      .getPublicUrl(storageFileName);

    const publicUrl = publicUrlData ? publicUrlData.publicUrl : null;
    console.log(`[SUPABASE STORAGE] Resume uploaded successfully: ${publicUrl}`);
    return { storageFileName, publicUrl };
  } catch (err) {
    console.error('[SUPABASE STORAGE] Exception during upload:', err.message);
    return null;
  }
}

/**
 * Save candidate job application + resume details to Supabase 'applications' table
 */
async function saveApplicationToSupabase(appData, filePath) {
  try {
    let uploadRes = null;
    if (filePath && appData.resume_filename) {
      uploadRes = await uploadResumeToSupabase(filePath, appData.resume_filename);
    }

    const resume_url = uploadRes ? uploadRes.publicUrl : null;

    const { data, error } = await supabase
      .from('applications')
      .insert([
        {
          candidate_name: appData.candidate_name,
          candidate_email: appData.candidate_email,
          job_id: appData.job_id ? parseInt(appData.job_id, 10) : null,
          resume_filename: appData.resume_filename,
          resume_url: resume_url,
          message: appData.message || null
        }
      ])
      .select();

    if (error) {
      console.error('[SUPABASE DB] Save application error:', error.message);
      return null;
    }

    console.log('[SUPABASE DB] Application saved successfully:', data);
    return data;
  } catch (err) {
    console.error('[SUPABASE DB] Exception saving application:', err.message);
    return null;
  }
}

/**
 * Save corporate consulting inquiry form data to Supabase 'inquiries' table
 */
async function saveInquiryToSupabase(inquiryData) {
  try {
    const { data, error } = await supabase
      .from('inquiries')
      .insert([
        {
          name: inquiryData.name,
          email: inquiryData.email,
          phone: inquiryData.phone || null,
          company: inquiryData.company || null,
          service_type: inquiryData.service_type,
          message: inquiryData.message || null

        }
      ])
      .select();

    if (error) {
      console.error('[SUPABASE DB] Save inquiry error:', error.message);
      return null;
    }

    console.log('[SUPABASE DB] Corporate inquiry saved successfully:', data);
    return data;
  } catch (err) {
    console.error('[SUPABASE DB] Exception saving inquiry:', err.message);
    return null;
  }
}

/**
 * Save job posting to Supabase 'jobs' table
 */
async function saveJobToSupabase(jobData) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .insert([
        {
          title: jobData.title,
          category: jobData.category,
          description: jobData.description,
          requirements: jobData.requirements || null,
          location: jobData.location
        }
      ])
      .select();

    if (error) {
      console.error('[SUPABASE DB] Save job error:', error.message);
      return null;
    }

    console.log('[SUPABASE DB] Job posting saved successfully:', data);
    return data;
  } catch (err) {
    console.error('[SUPABASE DB] Exception saving job:', err.message);
    return null;
  }
}

/**
 * Sync jobs list from local DB to Supabase 'jobs' table
 */
async function syncJobsToSupabase(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return;
  try {
    const payload = jobs.map(j => ({
      id: j.id,
      title: j.title,
      category: j.category,
      description: j.description,
      requirements: j.requirements || null,
      location: j.location
    }));

    const { data, error } = await supabase
      .from('jobs')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('[SUPABASE DB] Sync jobs error:', error.message);
    } else {
      console.log(`[SUPABASE DB] Synced ${jobs.length} jobs to Supabase successfully.`);
    }
  } catch (err) {
    console.error('[SUPABASE DB] Exception syncing jobs:', err.message);
  }
}

/**
 * Delete job from Supabase 'jobs' table
 */
async function deleteJobFromSupabase(jobId) {
  try {
    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', jobId);


    if (error) console.error('[SUPABASE DB] Delete job error:', error.message);
  } catch (err) {
    console.error('[SUPABASE DB] Exception deleting job:', err.message);
  }
}

/**
 * Delete inquiry from Supabase 'inquiries' table
 */
async function deleteInquiryFromSupabase(inquiryId) {
  try {
    const { error } = await supabase
      .from('inquiries')
      .delete()
      .eq('id', inquiryId);

    if (error) console.error('[SUPABASE DB] Delete inquiry error:', error.message);
  } catch (err) {
    console.error('[SUPABASE DB] Exception deleting inquiry:', err.message);
  }
}

/**
 * Delete application from Supabase 'applications' table
 */
async function deleteApplicationFromSupabase(appId) {
  try {
    const { error } = await supabase
      .from('applications')
      .delete()
      .eq('id', appId);

    if (error) console.error('[SUPABASE DB] Delete application error:', error.message);
  } catch (err) {
    console.error('[SUPABASE DB] Exception deleting application:', err.message);
  }
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.doc') return 'application/msword';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

module.exports = {
  supabase,
  uploadResumeToSupabase,
  saveApplicationToSupabase,
  saveInquiryToSupabase,
  saveJobToSupabase,
  syncJobsToSupabase,
  deleteJobFromSupabase,
  deleteInquiryFromSupabase,
  deleteApplicationFromSupabase
};

