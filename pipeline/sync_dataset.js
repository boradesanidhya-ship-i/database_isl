/**
 * SignLine - Database to Pipeline Sync & Dataset Builder
 * Downloads recorded videos from Supabase Storage and generates training manifests.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from parent .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://slrfvhkzbpersshiogpm.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'sign_line_video';

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const DATASET_DIR = path.join(__dirname, '..', 'dataset');
const VIDEOS_DIR = path.join(DATASET_DIR, 'raw_videos');
const MANIFEST_PATH = path.join(DATASET_DIR, 'dataset_manifest.json');
const CSV_PATH = path.join(DATASET_DIR, 'annotations.csv');

// Ensure directories exist
[DATASET_DIR, VIDEOS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

async function syncAndPrepareDataset(onlyNew = false) {
  console.log('====================================================');
  console.log('🔄 SignLine Dataset & Pipeline Sync Engine');
  console.log(`🌐 Supabase URL: ${SUPABASE_URL}`);
  console.log(`📦 Storage Bucket: ${SUPABASE_BUCKET}`);
  console.log(`📁 Local Dataset Dir: ${DATASET_DIR}`);
  console.log('====================================================\n');

  try {
    // 1. Query videos from Supabase table
    console.log('📡 Querying signline_videos from database...');
    let query = supabase
      .from('signline_videos')
      .select('*')
      .order('created_at', { ascending: false });

    if (onlyNew) {
      query = query.eq('status', 'uploaded');
    }

    const { data: videos, error } = await query;
    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    if (!videos || videos.length === 0) {
      console.log('ℹ️  No videos found matching criteria.');
      return { total: 0, downloaded: 0 };
    }

    console.log(`✅ Found ${videos.length} video records in Supabase database.`);

    const manifest = [];
    const csvRows = ['id,label,purpose,file_path,storage_path,mime_type,size_bytes,created_at'];
    let downloadCount = 0;

    for (let i = 0; i < videos.length; i++) {
      const vid = videos[i];
      const label = (vid.detected_label || 'unlabeled').replace(/[^a-zA-Z0-9_\-\s]/g, '_').trim();
      const labelDir = path.join(VIDEOS_DIR, label);

      if (!fs.existsSync(labelDir)) {
        fs.mkdirSync(labelDir, { recursive: true });
      }

      // Generate local filename
      const ext = vid.mime_type && vid.mime_type.includes('mp4') ? 'mp4' : 'webm';
      const localFilename = `${vid.id}_${vid.purpose}.${ext}`;
      const localFilePath = path.join(labelDir, localFilename);
      const relFilePath = path.relative(DATASET_DIR, localFilePath);

      // Download file from Supabase storage if not already cached locally
      if (!fs.existsSync(localFilePath) || fs.statSync(localFilePath).size === 0) {
        console.log(`⬇️  [${i + 1}/${videos.length}] Downloading: ${vid.storage_path} -> ${label}/${localFilename}`);
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(SUPABASE_BUCKET)
          .download(vid.storage_path);

        if (downloadError) {
          console.warn(`⚠️  Failed to download ${vid.storage_path}: ${downloadError.message}`);
        } else {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          fs.writeFileSync(localFilePath, buffer);
          downloadCount++;
        }
      } else {
        console.log(`⚡ [${i + 1}/${videos.length}] Local copy up-to-date: ${label}/${localFilename}`);
      }

      // Add to manifest
      manifest.push({
        id: vid.id,
        label: vid.detected_label,
        purpose: vid.purpose,
        local_path: relFilePath,
        storage_path: vid.storage_path,
        mime_type: vid.mime_type,
        size_bytes: vid.size_bytes,
        status: vid.status,
        result_json: vid.result_json,
        created_at: vid.created_at
      });

      csvRows.push(`"${vid.id}","${vid.detected_label}","${vid.purpose}","${relFilePath.replace(/\\/g, '/')}","${vid.storage_path}","${vid.mime_type}",${vid.size_bytes},"${vid.created_at}"`);

      // Update status in database to 'completed'
      if (vid.status === 'uploaded') {
        await supabase
          .from('signline_videos')
          .update({ 
            status: 'completed',
            updated_at: new Date().toISOString(),
            result_json: {
              ...(vid.result_json || {}),
              synced_to_pipeline_at: new Date().toISOString(),
              local_dataset_path: relFilePath
            }
          })
          .eq('id', vid.id);
      }
    }

    // Save manifest files
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
    fs.writeFileSync(CSV_PATH, csvRows.join('\n'), 'utf-8');

    console.log('\n====================================================');
    console.log('🎉 Dataset Sync Complete!');
    console.log(`📊 Total Videos Cataloged: ${manifest.length}`);
    console.log(`📥 Newly Downloaded: ${downloadCount}`);
    console.log(`📄 Manifest JSON: ${MANIFEST_PATH}`);
    console.log(`📑 Annotations CSV: ${CSV_PATH}`);
    console.log('====================================================\n');

    return { total: manifest.length, downloaded: downloadCount, manifestPath: MANIFEST_PATH };

  } catch (err) {
    console.error('❌ Pipeline Sync Failed:', err.message);
    process.exit(1);
  }
}

// Execute if run directly from command line
if (require.main === module) {
  const onlyNew = process.argv.includes('--new');
  syncAndPrepareDataset(onlyNew);
}

module.exports = { syncAndPrepareDataset };
