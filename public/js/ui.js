/**
 * SignLine Video Studio - UI Utilities & Toast Components
 */

class UIManager {
  constructor() {
    this.toastContainer = null;
    this.ensureToastContainer();
  }

  ensureToastContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    this.toastContainer = container;
  }

  showToast(message, type = 'info', duration = 4000) {
    this.ensureToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    // Use popover="manual" as recommended in modern web guidance
    try {
      toast.setAttribute('popover', 'manual');
    } catch (e) {}

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      ${iconSvg}
      <span class="toast-msg">${message}</span>
      <button class="toast-close" aria-label="Close notification">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    const dismiss = () => {
      toast.classList.add('hiding');
      setTimeout(() => {
        if (toast.parentElement) {
          toast.remove();
        }
      }, 250);
    };

    closeBtn.addEventListener('click', dismiss);
    this.toastContainer.appendChild(toast);

    if (toast.showPopover) {
      try { toast.showPopover(); } catch (e) {}
    }

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatDate(dateString) {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  renderVideoCards(videos, container, onDeleteClick, onPlayClick) {
    if (!videos || videos.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </div>
          <h3>No Recorded Videos Found</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 340px;">
            Start recording your camera above to capture sign gestures and store them directly in Supabase!
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = videos.map(video => {
      const purpose = video.purpose || 'learning';
      const sizeStr = this.formatBytes(video.size_bytes);
      const dateStr = this.formatDate(video.created_at);
      const label = video.detected_label || 'Unnamed Gesture';
      const videoSrc = video.public_url;

      return `
        <div class="video-card" data-id="${video.id}">
          <div class="card-video-preview">
            <span class="card-purpose-tag ${purpose}">${purpose.replace('_', ' ')}</span>
            <video src="${videoSrc}" preload="metadata" muted playsinline></video>
          </div>
          <div class="card-body">
            <div class="card-label-title">${label}</div>
            <div class="card-meta-row">
              <span>📅 ${dateStr}</span>
              <span>💾 ${sizeStr}</span>
            </div>
            <div class="card-path" title="${video.storage_path}">
              📂 ${video.storage_path}
            </div>
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary action-btn btn-play" data-src="${videoSrc}" data-title="${label}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              Watch
            </button>
            <button class="btn btn-outline action-btn btn-copy" data-url="${videoSrc}" title="Copy Public Supabase URL">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy Link
            </button>
            <button class="btn btn-outline action-btn delete btn-delete" data-id="${video.id}" title="Delete Video from DB & Storage">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    container.querySelectorAll('.btn-play').forEach(btn => {
      btn.addEventListener('click', () => {
        onPlayClick(btn.dataset.src, btn.dataset.title);
      });
    });

    container.querySelectorAll('.btn-copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const url = btn.dataset.url;
        try {
          await navigator.clipboard.writeText(url);
          this.showToast('Copied Supabase CDN URL to clipboard!', 'success', 2500);
        } catch (e) {
          this.showToast(`URL: ${url}`, 'info', 4000);
        }
      });
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        onDeleteClick(btn.dataset.id);
      });
    });
  }

  // Render Skeleton Sequence Cards from signline_skeleton_recordings
  renderSkeletonCards(recordings, container, onReplayClick, onPredictClick, onDeleteClick) {
    if (!recordings || recordings.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" style="background: rgba(99, 102, 241, 0.15); color: #818cf8;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="5" r="3"></circle>
              <line x1="12" y1="8" x2="12" y2="15"></line>
              <line x1="12" y1="11" x2="7" y2="9"></line>
              <line x1="12" y1="11" x2="17" y2="9"></line>
              <line x1="12" y1="15" x2="8" y2="21"></line>
              <line x1="12" y1="15" x2="16" y2="21"></line>
            </svg>
          </div>
          <h3>No Skeleton Recordings In Database</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 360px;">
            Click <strong>Start Recording</strong> above. When you click <strong>Stop Recording</strong>, your skeleton movement sequence will be automatically extracted and stored in Supabase PostgreSQL without saving any video file.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = recordings.map(rec => {
      const purpose = rec.purpose || 'learning';
      const dateStr = this.formatDate(rec.created_at);
      const label = rec.action_label || 'Unnamed Sign';
      const frameCount = rec.frame_count || 0;
      const durationSecs = (rec.duration_seconds || 0).toFixed(1);
      const fps = rec.fps || 30;

      return `
        <div class="video-card skeleton-card" data-id="${rec.id}">
          <div class="card-video-preview" style="background: #03050a; display: flex; align-items: center; justify-content: center;">
            <span class="card-purpose-tag ${purpose}">${purpose.replace('_', ' ')}</span>
            
            <!-- Skeleton Visual Badge -->
            <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: #38bdf8;">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="4" r="2.5"></circle>
                <line x1="12" y1="6.5" x2="12" y2="14"></line>
                <line x1="12" y1="9" x2="7" y2="11"></line>
                <line x1="12" y1="9" x2="17" y2="11"></line>
                <line x1="12" y1="14" x2="8" y2="20"></line>
                <line x1="12" y1="14" x2="16" y2="20"></line>
              </svg>
              <span style="font-size: 0.72rem; font-family: var(--font-mono); color: #94a3b8;">SKELETON DATA</span>
            </div>

            <!-- Zero Video Badge -->
            <div style="position: absolute; bottom: 8px; right: 8px; font-size: 0.65rem; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; padding: 2px 6px; border-radius: 4px;">
              ⚡ Zero Video Stored
            </div>
          </div>

          <div class="card-body">
            <div class="card-label-title">${label}</div>
            <div class="card-meta-row">
              <span>📅 ${dateStr}</span>
              <span>⏱️ ${durationSecs}s (${frameCount} frames)</span>
            </div>
            <div class="card-path" title="PostgreSQL ID: ${rec.id}">
              🗄️ ${rec.id}
            </div>
          </div>

          <div class="card-actions">
            <button class="btn btn-primary action-btn btn-replay-skeleton" data-id="${rec.id}" data-label="${label}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              Replay
            </button>
            <button class="btn btn-outline action-btn btn-predict-gesture" data-id="${rec.id}" data-label="${label}" title="Classify sign directly from stored landmarks">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>
              Predict
            </button>
            <button class="btn btn-outline action-btn delete btn-delete-skeleton" data-id="${rec.id}" title="Delete from Database">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    container.querySelectorAll('.btn-replay-skeleton').forEach(btn => {
      btn.addEventListener('click', () => {
        onReplayClick(btn.dataset.id, btn.dataset.label);
      });
    });

    container.querySelectorAll('.btn-predict-gesture').forEach(btn => {
      btn.addEventListener('click', () => {
        onPredictClick(btn.dataset.id, btn.dataset.label);
      });
    });

    container.querySelectorAll('.btn-delete-skeleton').forEach(btn => {
      btn.addEventListener('click', () => {
        onDeleteClick(btn.dataset.id);
      });
    });
  }

  showRetryToast(message, onRetry) {
    this.ensureToastContainer();

    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.setAttribute('popover', 'manual');

    toast.innerHTML = `
      <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
      <div style="flex: 1;">
        <div class="toast-msg">${message}</div>
      </div>
      <button class="retry-save-btn" id="toastRetryBtn">Retry Save</button>
      <button class="toast-close" aria-label="Close">&times;</button>
    `;

    const retryBtn = toast.querySelector('#toastRetryBtn');
    const closeBtn = toast.querySelector('.toast-close');

    const dismiss = () => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 250);
    };

    closeBtn.addEventListener('click', dismiss);
    retryBtn.addEventListener('click', () => {
      dismiss();
      if (onRetry) onRetry();
    });

    this.toastContainer.appendChild(toast);
    if (toast.showPopover) {
      try { toast.showPopover(); } catch (e) {}
    }
  }
}

window.uiManager = new UIManager();

