const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://slrfvhkzbpersshiogpm.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_a2ZHMrpSLQpHI8dymFCTqw_oQrUOroL';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'sign_line_video';
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || 'b69c50d6-f794-4129-ae8b-f96af77d98f2';

// Initialize Supabase Admin client with service key for reliable server-side DB & Storage operations
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

// Configure Multer for in-memory handling of video uploads (up to 150MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }
});

// Middleware - configured with 50mb limit for dense temporal skeleton coordinate sequences
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Public client config
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
    bucket: SUPABASE_BUCKET,
    defaultUserId: DEFAULT_USER_ID
  });
});

// Health & Database Inspector endpoint verifying Supabase connectivity & counts
app.get('/api/health', async (req, res) => {
  const startTime = Date.now();
  try {
    const { data: buckets, error: bucketError } = await supabaseAdmin.storage.listBuckets();
    
    // Count videos
    const { count: videosCount, error: vError } = await supabaseAdmin
      .from('signline_videos')
      .select('*', { count: 'exact', head: true });

    // Count skeleton recordings
    const { count: skeletonCount, error: sError } = await supabaseAdmin
      .from('signline_skeleton_recordings')
      .select('*', { count: 'exact', head: true });

    // Count custom signs
    const { count: signsCount, error: cError } = await supabaseAdmin
      .from('signline_custom_signs')
      .select('*', { count: 'exact', head: true });

    const pingMs = Date.now() - startTime;

    if (bucketError || vError || sError) {
      return res.status(500).json({
        status: 'degraded',
        storage: bucketError ? bucketError.message : 'connected',
        database: (vError || sError) ? (vError?.message || sError?.message) : 'connected',
        bucket: SUPABASE_BUCKET,
        supabaseUrl: SUPABASE_URL,
        pingMs
      });
    }

    res.json({
      status: 'healthy',
      storage: 'connected',
      database: 'connected',
      supabaseUrl: SUPABASE_URL,
      bucket: SUPABASE_BUCKET,
      defaultUserId: DEFAULT_USER_ID,
      pingMs,
      tables: {
        signline_skeleton_recordings: skeletonCount || 0,
        signline_videos: videosCount || 0,
        signline_custom_signs: signsCount || 0
      },
      totalVideosInDb: videosCount || 0,
      totalSkeletonsInDb: skeletonCount || 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// List all recorded videos from database
app.get('/api/videos', async (req, res) => {
  try {
    const { purpose, search } = req.query;
    let query = supabaseAdmin
      .from('signline_videos')
      .select('*')
      .order('created_at', { ascending: false });

    if (purpose && purpose !== 'all') {
      query = query.eq('purpose', purpose);
    }

    if (search) {
      query = query.ilike('detected_label', `%${search}%`);
    }

    const { data: videos, error } = await query;

    if (error) {
      console.error('Error fetching videos from DB:', error);
      return res.status(500).json({ error: error.message });
    }

    // Attach public URL and signed URL helper for each video
    const enhancedVideos = (videos || []).map(video => {
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${video.storage_path}`;
      return {
        ...video,
        public_url: publicUrl
      };
    });

    res.json(enhancedVideos);
  } catch (err) {
    console.error('Server error fetching videos:', err);
    res.status(500).json({ error: err.message });
  }
});

// Upload video file & record metadata in database
app.post('/api/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const file = req.file;
    const body = req.body || {};
    
    // Validate purpose against check constraint: ['learning', 'communication', 'custom_gesture']
    const validPurposes = ['learning', 'communication', 'custom_gesture'];
    const purpose = validPurposes.includes(body.purpose) ? body.purpose : 'learning';
    
    const detectedLabel = (body.detected_label || body.label || 'Sign Gesture').trim();
    const userId = body.user_id || DEFAULT_USER_ID;
    const notes = body.notes || '';
    const duration = parseFloat(body.duration) || 0;

    // Generate sanitized storage path: videos/{purpose}/{timestamp}_{random}.{ext}
    const ext = file.mimetype.includes('mp4') ? 'mp4' : 'webm';
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 9);
    const storagePath = `videos/${purpose}/${timestamp}_${randomSuffix}.${ext}`;

    console.log(`Uploading ${file.size} bytes to Supabase Storage: ${storagePath}`);

    // 1. Upload video buffer to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError);
      return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });
    }

    // Direct public URL
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${storagePath}`;

    // 2. Insert metadata row into `signline_videos` table
    const dbPayload = {
      user_id: userId,
      purpose: purpose,
      detected_label: detectedLabel,
      storage_path: storagePath,
      mime_type: file.mimetype || 'video/webm',
      size_bytes: file.size,
      status: 'uploaded',
      result_json: {
        original_name: file.originalname,
        duration_seconds: duration,
        notes: notes,
        uploaded_via: 'SignLine Web Studio',
        public_url: publicUrl
      }
    };

    const { data: dbData, error: dbError } = await supabaseAdmin
      .from('signline_videos')
      .insert([dbPayload])
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Attempt storage rollback if DB insert fails
      await supabaseAdmin.storage.from(SUPABASE_BUCKET).remove([storagePath]);
      return res.status(500).json({ error: `Database insert failed: ${dbError.message}` });
    }

    console.log(`Video saved successfully! DB ID: ${dbData.id}`);

    res.status(201).json({
      success: true,
      message: 'Video uploaded and saved to database successfully',
      video: {
        ...dbData,
        public_url: publicUrl
      }
    });

  } catch (err) {
    console.error('Error during video upload:', err);
    res.status(500).json({ error: err.message || 'Internal server error during upload' });
  }
});

// Delete video from both DB and Storage
app.delete('/api/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch video row to get storage_path
    const { data: video, error: findError } = await supabaseAdmin
      .from('signline_videos')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // 1. Delete from Supabase Storage
    if (video.storage_path) {
      const { error: storageDelError } = await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .remove([video.storage_path]);
      if (storageDelError) {
        console.warn('Warning: Could not remove file from storage:', storageDelError.message);
      }
    }

    // 2. Delete row from DB
    const { error: dbDelError } = await supabaseAdmin
      .from('signline_videos')
      .delete()
      .eq('id', id);

    if (dbDelError) {
      return res.status(500).json({ error: dbDelError.message });
    }

    res.json({ success: true, message: 'Video deleted successfully from database and storage' });
  } catch (err) {
    console.error('Error deleting video:', err);
    res.status(500).json({ error: err.message });
  }
});

// Trigger Dataset Sync & Retraining Pipeline
app.post('/api/pipeline/sync', async (req, res) => {
  try {
    const { syncAndPrepareDataset } = require('./pipeline/sync_dataset');
    const result = await syncAndPrepareDataset(false);
    res.json({
      success: true,
      message: 'Dataset synced from Supabase successfully',
      result
    });
  } catch (err) {
    console.error('Error in pipeline sync endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// SKELETON-TRACKING DATABASE & REPLAY ENDPOINTS
// =========================================================================

// List skeleton recordings (lightweight summary without heavy sequences)
app.get('/api/skeleton/recordings', async (req, res) => {
  try {
    const { purpose, search, user_id } = req.query;
    let query = supabaseAdmin
      .from('signline_skeleton_recordings')
      .select('id, user_id, action_label, purpose, fps, frame_count, duration_seconds, metadata, status, custom_sign_id, created_at')
      .order('created_at', { ascending: false });

    if (purpose && purpose !== 'all') {
      query = query.eq('purpose', purpose);
    }
    if (search) {
      query = query.ilike('action_label', `%${search}%`);
    }
    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (err) {
    console.error('Error listing skeleton recordings:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single skeleton recording with full temporal movement sequence for replay
app.get('/api/skeleton/recordings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('signline_skeleton_recordings')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Skeleton recording not found' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error fetching skeleton recording:', err);
    res.status(500).json({ error: err.message });
  }
});

// Save new skeleton sequence directly to Supabase PostgreSQL (Zero video saved)
app.post('/api/skeleton/recordings', async (req, res) => {
  try {
    const body = req.body || {};
    const actionLabel = (body.action_label || body.label || '').trim();
    const sequence = body.movement_sequence;
    const userId = body.user_id || DEFAULT_USER_ID;
    const purpose = ['learning', 'communication', 'custom_gesture'].includes(body.purpose) 
      ? body.purpose 
      : 'learning';

    // 1. Validation
    if (!actionLabel) {
      return res.status(400).json({ error: 'Action label is required' });
    }

    const frames = Array.isArray(sequence?.frames) 
      ? sequence.frames 
      : (Array.isArray(sequence) ? sequence : []);

    if (frames.length === 0) {
      return res.status(400).json({ error: 'Movement sequence is empty or invalid. Record movement before saving.' });
    }

    const durationSeconds = parseFloat(body.duration_seconds) || (frames.length / 30.0);
    const fps = parseFloat(body.fps) || 30.0;

    // Check if custom sign should be preserved
    let customSignId = body.custom_sign_id || null;
    if (body.custom_sign_name || body.custom_sign_meaning) {
      const signName = body.custom_sign_name || actionLabel;
      const signMeaning = body.custom_sign_meaning || actionLabel;
      const signDesc = body.custom_sign_description || body.notes || '';
      const commText = body.communication_text || signMeaning;

      const { data: customSign, error: csErr } = await supabaseAdmin
        .from('signline_custom_signs')
        .insert([{
          user_id: userId,
          name: signName,
          meaning: signMeaning,
          description: signDesc,
          communication_text: commText,
          is_active: true
        }])
        .select()
        .single();

      if (!csErr && customSign) {
        customSignId = customSign.id;
      }
    }

    // 2. Insert into signline_skeleton_recordings
    const dbPayload = {
      user_id: userId,
      action_label: actionLabel,
      purpose: purpose,
      fps: fps,
      frame_count: frames.length,
      duration_seconds: +durationSeconds.toFixed(2),
      movement_sequence: {
        fps: fps,
        total_frames: frames.length,
        duration_seconds: +durationSeconds.toFixed(2),
        frames: frames
      },
      metadata: {
        source: 'MediaPipe Holistic',
        device: body.metadata?.device || 'Webcam',
        resolution: body.metadata?.resolution || '720p',
        notes: body.notes || '',
        recorded_at: new Date().toISOString(),
        zero_video_storage: true
      },
      status: 'completed',
      custom_sign_id: customSignId
    };

    console.log(`💾 Storing ${frames.length} skeleton frames in PostgreSQL for "${actionLabel}"...`);

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('signline_skeleton_recordings')
      .insert([dbPayload])
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error for skeleton sequence:', insertError);
      return res.status(500).json({ error: `Failed to store skeleton sequence: ${insertError.message}` });
    }

    console.log(`✅ Skeleton sequence saved! ID: ${inserted.id}`);

    // If customSign was created, link back skeleton_id
    if (customSignId) {
      await supabaseAdmin
        .from('signline_custom_signs')
        .update({ skeleton_id: inserted.id })
        .eq('id', customSignId);
    }

    res.status(201).json({
      success: true,
      message: 'Skeleton movement sequence stored in Supabase PostgreSQL successfully',
      recording: {
        id: inserted.id,
        action_label: inserted.action_label,
        frame_count: inserted.frame_count,
        duration_seconds: inserted.duration_seconds,
        purpose: inserted.purpose,
        created_at: inserted.created_at
      }
    });

  } catch (err) {
    console.error('Error during skeleton sequence storage:', err);
    res.status(500).json({ error: err.message || 'Internal error saving skeleton sequence' });
  }
});

// Delete skeleton recording
app.delete('/api/skeleton/recordings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin
      .from('signline_skeleton_recordings')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, message: 'Skeleton recording deleted successfully' });
  } catch (err) {
    console.error('Error deleting skeleton recording:', err);
    res.status(500).json({ error: err.message });
  }
});

// Run ISL model inference directly on stored landmark sequence
app.post('/api/skeleton/recordings/:id/predict', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: recording, error } = await supabaseAdmin
      .from('signline_skeleton_recordings')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !recording) {
      return res.status(404).json({ error: 'Skeleton recording not found' });
    }

    // Run inference logic directly from stored movement_sequence
    const { classifySkeletonSequence } = require('./pipeline/infer_skeleton_js');
    const prediction = classifySkeletonSequence(
      recording.movement_sequence,
      recording.action_label
    );

    res.json({
      success: true,
      recording_id: id,
      action_label: recording.action_label,
      prediction
    });
  } catch (err) {
    console.error('Error running skeleton inference:', err);
    res.status(500).json({ error: err.message });
  }
});

// Direct training on all skeleton sequences in PostgreSQL
app.post('/api/pipeline/train-skeletons', async (req, res) => {
  try {
    const { trainFromSkeletons } = require('./pipeline/train_from_skeletons');
    const result = await trainFromSkeletons();
    res.json({
      success: true,
      message: 'Model trained directly from database skeleton sequences',
      result
    });
  } catch (err) {
    console.error('Error in skeleton training endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

// 404 Handler: Return JSON for API routes, index.html for SPA page routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global Express error handler - guarantees JSON response, never raw HTML
app.use((err, req, res, next) => {
  console.error('Express error intercepted:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error occurred'
  });
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 SignLine Video Studio & Recorder Running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🗄️  Supabase URL: ${SUPABASE_URL}`);
  console.log(`📦 Storage Bucket: ${SUPABASE_BUCKET}`);
  console.log(`===============================================`);
});
