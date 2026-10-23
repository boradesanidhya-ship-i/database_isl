/**
 * SignLine Video Studio - Supabase & API Client
 */

class SupabaseService {
  constructor() {
    this.config = null;
    this.isReady = false;
  }

  async init() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Failed to load server configuration');
      this.config = await res.json();
      this.isReady = true;
      console.log('✅ Supabase configuration loaded:', {
        url: this.config.supabaseUrl,
        bucket: this.config.bucket,
        defaultUserId: this.config.defaultUserId
      });
      return this.config;
    } catch (err) {
      console.error('Initialization error:', err);
      throw err;
    }
  }

  async checkHealth() {
    try {
      const res = await fetch('/api/health');
      return await res.json();
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }

  async getVideos(filter = {}) {
    try {
      const params = new URLSearchParams();
      if (filter.purpose && filter.purpose !== 'all') {
        params.append('purpose', filter.purpose);
      }
      if (filter.search) {
        params.append('search', filter.search);
      }

      const url = `/api/videos${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch videos');
      }
      return await res.json();
    } catch (err) {
      console.error('getVideos error:', err);
      throw err;
    }
  }

  async uploadVideo(blob, metadata, onProgress) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const filename = `recording_${Date.now()}.${ext}`;

      formData.append('video', blob, filename);
      formData.append('purpose', metadata.purpose || 'learning');
      formData.append('detected_label', metadata.detected_label || 'Sign Gesture');
      formData.append('notes', metadata.notes || '');
      formData.append('duration', metadata.duration || 0);
      if (metadata.user_id) {
        formData.append('user_id', metadata.user_id);
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent, e.loaded, e.total);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            resolve({ success: true, message: 'Upload succeeded' });
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error || `Upload failed with status ${xhr.status}`));
          } catch (e) {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during video upload'));
      };

      xhr.send(formData);
    });
  }

  async deleteVideo(videoId) {
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete video');
      }
      return await res.json();
    } catch (err) {
      console.error('deleteVideo error:', err);
      throw err;
    }
  }

  // =========================================================================
  // SAFE RESPONSE PARSER (Guarantees clean error messages)
  // =========================================================================
  async parseResponse(res, defaultError = 'Request failed') {
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {
      if (!res.ok) {
        const cleanMsg = text.replace(/<[^>]*>/g, '').trim();
        throw new Error(cleanMsg || `${defaultError} (${res.status})`);
      }
      return text;
    }

    if (!res.ok) {
      throw new Error(json.error || `${defaultError} (${res.status})`);
    }
    return json;
  }

  // =========================================================================
  // SKELETON RECORDINGS DATABASE METHODS
  // =========================================================================

  async getSkeletonRecordings(filter = {}) {
    try {
      const params = new URLSearchParams();
      if (filter.purpose && filter.purpose !== 'all') {
        params.append('purpose', filter.purpose);
      }
      if (filter.search) {
        params.append('search', filter.search);
      }

      const url = `/api/skeleton/recordings${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      return await this.parseResponse(res, 'Failed to fetch skeleton recordings');
    } catch (err) {
      console.error('getSkeletonRecordings error:', err);
      throw err;
    }
  }

  async getSkeletonRecordingById(id) {
    try {
      const res = await fetch(`/api/skeleton/recordings/${id}`);
      return await this.parseResponse(res, 'Failed to fetch skeleton sequence');
    } catch (err) {
      console.error('getSkeletonRecordingById error:', err);
      throw err;
    }
  }

  async saveSkeletonRecording(payload) {
    try {
      const res = await fetch('/api/skeleton/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await this.parseResponse(res, 'Failed to save skeleton sequence to database');
    } catch (err) {
      console.error('saveSkeletonRecording error:', err);
      throw err;
    }
  }

  async deleteSkeletonRecording(id) {
    try {
      const res = await fetch(`/api/skeleton/recordings/${id}`, {
        method: 'DELETE'
      });
      return await this.parseResponse(res, 'Failed to delete recording');
    } catch (err) {
      console.error('deleteSkeletonRecording error:', err);
      throw err;
    }
  }

  async predictSkeletonGesture(id) {
    try {
      const res = await fetch(`/api/skeleton/recordings/${id}/predict`, {
        method: 'POST'
      });
      return await this.parseResponse(res, 'Prediction failed');
    } catch (err) {
      console.error('predictSkeletonGesture error:', err);
      throw err;
    }
  }
}

window.supabaseService = new SupabaseService();

