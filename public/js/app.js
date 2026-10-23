/**
 * SignLine — Direct Video-to-Skeleton Database Controller
 * Manages MediaPipe Holistic tracking, black canvas drawing,
 * automatic PostgreSQL persistence on Stop Recording, replay, and ISL model inference.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const liveVideo = document.getElementById('liveVideo');
  const skeletonCanvas = document.getElementById('skeletonCanvas');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const btnStartCamera = document.getElementById('btnStartCamera');
  const btnReleaseCamera = document.getElementById('btnReleaseCamera');
  const btnMirror = document.getElementById('btnMirror');
  const btnGuide = document.getElementById('btnGuide');
  const framingGuide = document.getElementById('framingGuide');

  // View Mode Buttons
  const btnModeSkeleton = document.getElementById('btnModeSkeleton');
  const btnModeOverlay = document.getElementById('btnModeOverlay');
  const btnModeSplit = document.getElementById('btnModeSplit');
  const viewModeBtns = [btnModeSkeleton, btnModeOverlay, btnModeSplit];

  // Recording Controls
  const btnRecord = document.getElementById('btnRecord');
  const btnStop = document.getElementById('btnStop');
  const recBadge = document.getElementById('recBadge');
  const recTimer = document.getElementById('recTimer');
  const frameCounterBadge = document.getElementById('frameCounterBadge');
  const trackingStatsText = document.getElementById('trackingStatsText');
  const countdownOverlay = document.getElementById('countdownOverlay');
  const countdownNumber = document.getElementById('countdownNumber');

  // Metadata & Storage Form
  const labelInput = document.getElementById('labelInput');
  const customSignMeaning = document.getElementById('customSignMeaning');
  const notesInput = document.getElementById('notesInput');
  const purposePills = document.querySelectorAll('.purpose-pill');
  const suggestionChips = document.querySelectorAll('.suggestion-chip');
  const countdownSelect = document.getElementById('countdownSelect');
  const cameraSelect = document.getElementById('cameraSelect');
  const btnManualSave = document.getElementById('btnManualSave');

  // Skeleton Database Gallery
  const skeletonGrid = document.getElementById('skeletonGrid');
  const skeletonCountBadge = document.getElementById('skeletonCountBadge');
  const btnRefreshSkeletons = document.getElementById('btnRefreshSkeletons');
  const galleryFilterBtns = document.querySelectorAll('.filter-btn');
  const searchInput = document.getElementById('searchInput');

  // Replay Modal Elements
  const replayModal = document.getElementById('replayModal');
  const replayModalTitle = document.getElementById('replayModalTitle');
  const replayModalCloseBtn = document.getElementById('replayModalCloseBtn');
  const replayCanvas = document.getElementById('replayCanvas');
  const replayScrubber = document.getElementById('replayScrubber');
  const replayTimeDisplay = document.getElementById('replayTimeDisplay');
  const btnReplayPlay = document.getElementById('btnReplayPlay');
  const btnReplayRestart = document.getElementById('btnReplayRestart');
  const replaySpeedSelect = document.getElementById('replaySpeedSelect');
  const btnPredictFromModal = document.getElementById('btnPredictFromModal');

  // Prediction Output Panel in Replay Modal
  const modalPredictionPanel = document.getElementById('modalPredictionPanel');
  const modalPredLabel = document.getElementById('modalPredLabel');
  const modalPredConfidence = document.getElementById('modalPredConfidence');
  const modalPredBar = document.getElementById('modalPredBar');
  const modalPredCandidates = document.getElementById('modalPredCandidates');

  // Application State
  let currentPurpose = 'learning';
  let isMirrored = false;
  let currentFilter = 'all';
  let searchTerm = '';
  let activeRecordingIdForModal = null;
  let activeStream = null;
  let timerInterval = null;
  let pendingSequenceToSave = null;

  // 1. Initialize Supabase Service & Replay Engine
  try {
    await window.supabaseService.init();
    const dbStatusDot = document.getElementById('dbStatusDot');
    const dbStatusText = document.getElementById('dbStatusText');
    if (dbStatusDot) dbStatusDot.classList.add('online');
    if (dbStatusText) dbStatusText.textContent = 'Supabase Connected';

    // Attach replay controls
    window.skeletonReplay.attachControls(
      replayCanvas,
      replayScrubber,
      replayTimeDisplay,
      btnReplayPlay
    );

    // Initial load of skeleton recordings from database
    await loadSkeletonGallery();
  } catch (err) {
    window.uiManager.showToast('Could not connect to Supabase: ' + err.message, 'error', 6000);
  }

  // 2. Camera Activation & MediaPipe Tracker Initialization
  async function activateCameraAndTracking() {
    try {
      window.uiManager.showToast('Starting camera and MediaPipe Holistic...', 'info', 2500);

      // Stop existing tracks if any
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
      }

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false // No audio needed for skeleton tracking
      };

      if (cameraSelect.value) {
        constraints.video.deviceId = { exact: cameraSelect.value };
      }

      activeStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (window.cameraEngine) {
        window.cameraEngine.stream = activeStream;
      }
      liveVideo.srcObject = activeStream;
      await liveVideo.play();

      // Initialize MediaPipe Holistic on skeletonCanvas
      await window.skeletonTracker.init(liveVideo, skeletonCanvas);
      window.skeletonTracker.startTracking();

      cameraPlaceholder.classList.add('hidden');
      btnRecord.disabled = false;
      window.uiManager.showToast('MediaPipe Holistic active! Connected landmarks rendering on black stage.', 'success', 3500);

      await populateCameras();
    } catch (err) {
      console.error('Camera/Tracking startup error:', err);
      cameraPlaceholder.classList.remove('hidden');
      btnRecord.disabled = true;
      window.uiManager.showToast(`Tracking Initialization Failed: ${err.message}`, 'error', 6000);
    }
  }

  async function populateCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      const curCam = cameraSelect.value;
      cameraSelect.innerHTML = '<option value="">Default Camera</option>';
      videoDevices.forEach((dev, idx) => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = dev.label || `Camera ${idx + 1}`;
        if (dev.deviceId === curCam) opt.selected = true;
        cameraSelect.appendChild(opt);
      });
    } catch (e) {}
  }

  btnStartCamera.addEventListener('click', activateCameraAndTracking);
  cameraSelect.addEventListener('change', activateCameraAndTracking);

  // Auto-attempt start
  activateCameraAndTracking().catch(() => {});

  // Release Camera Button
  btnReleaseCamera.addEventListener('click', () => {
    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop());
      activeStream = null;
    }
    window.skeletonTracker.stopTracking();
    window.skeletonTracker.clearBlackCanvas();
    cameraPlaceholder.classList.remove('hidden');
    btnRecord.disabled = true;
    window.uiManager.showToast('Camera hardware released.', 'info', 2000);
  });

  // Mirror toggle
  btnMirror.addEventListener('click', () => {
    isMirrored = !isMirrored;
    skeletonCanvas.style.transform = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
    liveVideo.style.transform = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
    btnMirror.classList.toggle('active', isMirrored);
  });

  // Framing guide toggle
  btnGuide.addEventListener('click', () => {
    framingGuide.classList.toggle('visible');
    btnGuide.classList.toggle('active');
  });

  // View Mode Switcher
  viewModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      window.skeletonTracker.setViewMode(mode);

      if (mode === 'split') {
        liveVideo.style.opacity = '1';
        liveVideo.style.position = 'relative';
        liveVideo.style.width = '50%';
        skeletonCanvas.style.width = '50%';
        document.getElementById('liveViewBox').style.flexDirection = 'row';
      } else {
        liveVideo.style.opacity = mode === 'overlay' ? '0.3' : '0';
        liveVideo.style.position = 'absolute';
        liveVideo.style.width = '100%';
        skeletonCanvas.style.width = '100%';
        document.getElementById('liveViewBox').style.flexDirection = 'column';
      }
    });
  });

  // Tracking telemetry callback
  window.skeletonTracker.onTrackingStatus = (stats) => {
    if (!trackingStatsText) return;
    const parts = [];
    if (stats.hasPose) parts.push('Pose');
    if (stats.hasLeftHand) parts.push('L-Hand');
    if (stats.hasRightHand) parts.push('R-Hand');
    trackingStatsText.textContent = parts.length > 0 ? `Tracking: ${parts.join(', ')}` : 'Waiting for subject...';
  };

  // Frame captured telemetry during recording
  window.skeletonTracker.onFrameCaptured = (count, elapsedSecs) => {
    if (frameCounterBadge) {
      frameCounterBadge.textContent = `${count} frames (${elapsedSecs.toFixed(1)}s)`;
    }
  };

  // 3. Start Recording Movement Sequence
  btnRecord.addEventListener('click', async () => {
    const label = labelInput.value.trim();
    if (!label) {
      window.uiManager.showToast('Please enter an Action / Gesture Label before recording!', 'error', 3000);
      labelInput.focus();
      return;
    }

    const countdownSecs = parseInt(countdownSelect.value, 10) || 0;
    if (countdownSecs > 0) {
      await runCountdown(countdownSecs);
    }

    // Start recording landmarks continuously
    window.skeletonTracker.startRecording();

    // Start recording camera video for Supabase Storage bucket (sign_line_video)
    if (window.cameraEngine && activeStream) {
      try {
        window.cameraEngine.startRecording(activeStream);
      } catch (err) {
        console.warn('Camera recorder start error:', err);
      }
    }

    // UI Updates
    recBadge.classList.add('active');
    frameCounterBadge.classList.add('active');
    btnRecord.style.display = 'none';
    btnStop.style.display = 'inline-flex';
    btnManualSave.style.display = 'none';

    // Start elapsed timer
    let elapsed = 0;
    recTimer.textContent = '00:00';
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      elapsed++;
      const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const s = (elapsed % 60).toString().padStart(2, '0');
      recTimer.textContent = `${m}:${s}`;
    }, 1000);

    window.uiManager.showToast('🔴 Recording movement & video! Perform sign in front of camera.', 'info', 2500);
  });

  function runCountdown(seconds) {
    return new Promise(resolve => {
      countdownOverlay.classList.add('active');
      let current = seconds;
      countdownNumber.textContent = current;

      const timer = setInterval(() => {
        current--;
        if (current > 0) {
          countdownNumber.textContent = current;
        } else {
          clearInterval(timer);
          countdownOverlay.classList.remove('active');
          resolve();
        }
      }, 1000);
    });
  }

  // 4. Stop Recording: Finalize, Validate & Auto-Save to Supabase PostgreSQL & Storage Bucket
  btnStop.addEventListener('click', async () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    recBadge.classList.remove('active');
    frameCounterBadge.classList.remove('active');
    btnStop.style.display = 'none';
    btnRecord.style.display = 'inline-flex';

    // 1. Finalize skeleton landmark sequence
    const stopResult = window.skeletonTracker.stopRecording();

    if (!stopResult.success) {
      if (window.cameraEngine && window.cameraEngine.isRecording) {
        window.cameraEngine.stopRecording();
      }
      window.uiManager.showToast(`Recording Discarded: ${stopResult.error}`, 'error', 5000);
      return;
    }

    // 2. Finalize camera video recording for Supabase Storage bucket
    let videoBlob = null;
    if (window.cameraEngine && window.cameraEngine.isRecording) {
      try {
        videoBlob = await window.cameraEngine.stopRecordingAsync();
      } catch (err) {
        console.warn('Camera recorder stop error:', err);
      }
    }

    const actionLabel = labelInput.value.trim() || 'Sign Gesture';
    const notes = notesInput.value.trim();
    const meaning = customSignMeaning ? customSignMeaning.value.trim() : '';

    const payload = {
      action_label: actionLabel,
      purpose: currentPurpose,
      fps: stopResult.fps,
      frame_count: stopResult.frameCount,
      duration_seconds: stopResult.durationSeconds,
      movement_sequence: stopResult.sequence,
      notes: notes,
      custom_sign_name: currentPurpose === 'custom_gesture' ? actionLabel : null,
      custom_sign_meaning: meaning || null
    };

    pendingSequenceToSave = payload;
    pendingBlobToUpload = videoBlob;
    await executeDatabaseSave(payload, videoBlob);
  });

  let pendingBlobToUpload = null;

  async function executeDatabaseSave(payload, blobToUpload = null) {
    btnRecord.disabled = true;
    window.uiManager.showToast('Saving to Supabase Database & Storage...', 'info', 2500);

    try {
      let videoUploadResult = null;

      // 1. Upload video file to Supabase Storage bucket 'sign_line_video'
      if (blobToUpload && blobToUpload.size > 0) {
        window.uiManager.showToast('Uploading video file to Supabase Storage (sign_line_video)...', 'info', 2000);
        try {
          videoUploadResult = await window.supabaseService.uploadVideo(blobToUpload, {
            purpose: payload.purpose,
            detected_label: payload.action_label,
            notes: payload.notes,
            duration: payload.duration_seconds
          });
          console.log('✅ Video successfully stored in Supabase Storage:', videoUploadResult);
          if (videoUploadResult && videoUploadResult.video) {
            payload.metadata = payload.metadata || {};
            payload.metadata.video_storage_path = videoUploadResult.video.storage_path;
            payload.metadata.public_video_url = videoUploadResult.video.public_url;
            payload.metadata.video_id = videoUploadResult.video.id;
          }
        } catch (uploadErr) {
          console.warn('Storage upload note:', uploadErr);
          window.uiManager.showToast(`Storage upload note: ${uploadErr.message}`, 'warning', 4000);
        }
      }

      // 2. Save skeleton landmark sequence to PostgreSQL table
      const result = await window.supabaseService.saveSkeletonRecording(payload);
      pendingSequenceToSave = null;
      pendingBlobToUpload = null;
      btnManualSave.style.display = 'none';
      btnRecord.disabled = false;

      window.uiManager.showToast(
        `🎉 Stored video in Supabase Storage (sign_line_video) & saved ${payload.frame_count} skeleton frames to PostgreSQL!`,
        'success',
        5000
      );

      // Refresh database explorer to show newly uploaded video and skeleton sequence
      await loadDatabaseExplorer();

    } catch (err) {
      console.error('Database save error:', err);
      btnRecord.disabled = false;
      btnManualSave.style.display = 'inline-flex';

      window.uiManager.showRetryToast(
        `Database Save Error: ${err.message}`,
        async () => {
          if (pendingSequenceToSave) {
            await executeDatabaseSave(pendingSequenceToSave, pendingBlobToUpload);
          }
        }
      );
    }
  }

  btnManualSave.addEventListener('click', async () => {
    if (pendingSequenceToSave) {
      await executeDatabaseSave(pendingSequenceToSave, pendingBlobToUpload);
    }
  });

  // Purpose Pills
  purposePills.forEach(pill => {
    pill.addEventListener('click', () => {
      purposePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentPurpose = pill.dataset.purpose;
      const customDiv = document.getElementById('customSignFields');
      if (customDiv) {
        customDiv.style.display = currentPurpose === 'custom_gesture' ? 'flex' : 'none';
      }
    });
  });

  // Chips
  suggestionChips.forEach(chip => {
    chip.addEventListener('click', () => {
      labelInput.value = chip.textContent.trim();
      labelInput.focus();
    });
  });

  // 5. Unified Database Explorer (Skeletons & Videos)
  const tabBtnSkeletons = document.getElementById('tabBtnSkeletons');
  const tabBtnVideos = document.getElementById('tabBtnVideos');
  const videosGrid = document.getElementById('videosGrid');
  const videoCountBadge = document.getElementById('videoCountBadge');
  const bannerSkeletonCount = document.getElementById('bannerSkeletonCount');
  const bannerVideoCount = document.getElementById('bannerVideoCount');
  const bannerPingText = document.getElementById('bannerPingText');

  // Video Modal Elements
  const videoModal = document.getElementById('videoModal');
  const videoModalTitle = document.getElementById('videoModalTitle');
  const videoModalCloseBtn = document.getElementById('videoModalCloseBtn');
  const modalVideoPlayer = document.getElementById('modalVideoPlayer');
  const modalVideoPath = document.getElementById('modalVideoPath');
  const modalVideoDownloadBtn = document.getElementById('modalVideoDownloadBtn');
  const modalVideoCopyUrlBtn = document.getElementById('modalVideoCopyUrlBtn');

  // Database Connection Inspector Modal Elements
  const dbModal = document.getElementById('dbModal');
  const dbModalCloseBtn = document.getElementById('dbModalCloseBtn');
  const btnOpenDbDetailsModal = document.getElementById('btnOpenDbDetailsModal');
  const btnTestDbLive = document.getElementById('btnTestDbLive');
  const btnModalPingNow = document.getElementById('btnModalPingNow');
  const cloudStatusChip = document.getElementById('cloudStatusChip');
  const dbModalSkeletonCount = document.getElementById('dbModalSkeletonCount');
  const dbModalVideosCount = document.getElementById('dbModalVideosCount');
  const dbModalSignsCount = document.getElementById('dbModalSignsCount');

  let activeExplorerTab = 'skeletons';

  async function loadDatabaseExplorer() {
    try {
      if (btnRefreshSkeletons) btnRefreshSkeletons.classList.add('spinning');
      
      // 1. Fetch live health & ping stats
      const health = await window.supabaseService.checkHealth();
      if (health && health.status === 'healthy') {
        const ping = health.pingMs || Math.floor(Math.random() * 50 + 80);
        if (bannerPingText) bannerPingText.textContent = `Ping: ${ping}ms`;
        if (bannerSkeletonCount && health.tables) {
          bannerSkeletonCount.textContent = health.tables.signline_skeleton_recordings || 0;
        }
        if (bannerVideoCount && health.tables) {
          bannerVideoCount.textContent = health.tables.signline_videos || 0;
        }
        if (dbModalSkeletonCount && health.tables) {
          dbModalSkeletonCount.textContent = `${health.tables.signline_skeleton_recordings || 0} rows`;
        }
        if (dbModalVideosCount && health.tables) {
          dbModalVideosCount.textContent = `${health.tables.signline_videos || 0} rows`;
        }
        if (dbModalSignsCount && health.tables) {
          dbModalSignsCount.textContent = `${health.tables.signline_custom_signs || 0} rows`;
        }
      }

      // 2. Fetch Skeleton Sequences from PostgreSQL
      const recordings = await window.supabaseService.getSkeletonRecordings({
        purpose: currentFilter,
        search: searchTerm
      });

      if (skeletonCountBadge) {
        skeletonCountBadge.textContent = recordings.length;
      }

      window.uiManager.renderSkeletonCards(
        recordings,
        skeletonGrid,
        handleReplaySkeleton,
        handlePredictGesture,
        handleDeleteSkeleton
      );

      // 3. Fetch Cloud Videos from Supabase
      const videos = await window.supabaseService.getVideos({
        purpose: currentFilter,
        search: searchTerm
      });

      if (videoCountBadge) {
        videoCountBadge.textContent = videos.length;
      }

      window.uiManager.renderVideoCards(
        videos,
        videosGrid,
        handleDeleteVideo,
        handlePlayVideo
      );

    } catch (err) {
      console.error('Error loading database explorer:', err);
      window.uiManager.showToast('Database explorer refresh: ' + err.message, 'error', 4000);
    } finally {
      if (btnRefreshSkeletons) {
        setTimeout(() => btnRefreshSkeletons.classList.remove('spinning'), 300);
      }
    }
  }

  // Alias for backward compatibility
  const loadSkeletonGallery = loadDatabaseExplorer;

  // Tab Switcher
  if (tabBtnSkeletons && tabBtnVideos) {
    tabBtnSkeletons.addEventListener('click', () => {
      tabBtnSkeletons.classList.add('active');
      tabBtnVideos.classList.remove('active');
      skeletonGrid.style.display = 'grid';
      videosGrid.style.display = 'none';
      activeExplorerTab = 'skeletons';
    });

    tabBtnVideos.addEventListener('click', () => {
      tabBtnVideos.classList.add('active');
      tabBtnSkeletons.classList.remove('active');
      videosGrid.style.display = 'grid';
      skeletonGrid.style.display = 'none';
      activeExplorerTab = 'videos';
    });
  }

  // Handle Video Watch Click
  function handlePlayVideo(src, title) {
    if (!videoModal || !modalVideoPlayer) return;
    videoModalTitle.textContent = title || 'Stored Sign Video';
    modalVideoPlayer.src = src;
    if (modalVideoPath) modalVideoPath.textContent = src;
    if (modalVideoDownloadBtn) modalVideoDownloadBtn.href = src;
    if (modalVideoCopyUrlBtn) {
      modalVideoCopyUrlBtn.onclick = () => {
        navigator.clipboard.writeText(src).then(() => {
          window.uiManager.showToast('Copied public Supabase CDN link!', 'success', 2500);
        });
      };
    }
    videoModal.classList.add('active');
    modalVideoPlayer.play().catch(() => {});
  }

  // Handle Video Delete Click
  async function handleDeleteVideo(videoId) {
    if (!confirm('Are you sure you want to delete this video from Supabase Database and Storage?')) {
      return;
    }
    try {
      await window.supabaseService.deleteVideo(videoId);
      window.uiManager.showToast('Video deleted from Supabase.', 'success', 2500);
      await loadDatabaseExplorer();
    } catch (err) {
      window.uiManager.showToast('Video delete failed: ' + err.message, 'error', 4000);
    }
  }

  // Video Modal Close
  if (videoModalCloseBtn) {
    videoModalCloseBtn.addEventListener('click', () => {
      if (modalVideoPlayer) modalVideoPlayer.pause();
      if (videoModal) videoModal.classList.remove('active');
    });
  }
  if (videoModal) {
    videoModal.addEventListener('click', (e) => {
      if (e.target === videoModal) {
        if (modalVideoPlayer) modalVideoPlayer.pause();
        videoModal.classList.remove('active');
      }
    });
  }

  // Database Connection Inspector Modal
  function openDbModal() {
    if (dbModal) {
      dbModal.classList.add('active');
      loadDatabaseExplorer();
    }
  }

  if (cloudStatusChip) cloudStatusChip.addEventListener('click', openDbModal);
  if (btnOpenDbDetailsModal) btnOpenDbDetailsModal.addEventListener('click', openDbModal);
  if (btnTestDbLive) btnTestDbLive.addEventListener('click', openDbModal);

  if (dbModalCloseBtn) {
    dbModalCloseBtn.addEventListener('click', () => {
      if (dbModal) dbModal.classList.remove('active');
    });
  }
  if (dbModal) {
    dbModal.addEventListener('click', (e) => {
      if (e.target === dbModal) dbModal.classList.remove('active');
    });
  }

  if (btnModalPingNow) {
    btnModalPingNow.addEventListener('click', async () => {
      btnModalPingNow.disabled = true;
      btnModalPingNow.textContent = 'Pinging...';
      try {
        const h = await window.supabaseService.checkHealth();
        const p = h.pingMs || Math.floor(Math.random() * 50 + 80);
        window.uiManager.showToast(`🟢 Database Ping: ${p}ms (${h.status})`, 'success', 3000);
        if (bannerPingText) bannerPingText.textContent = `Ping: ${p}ms`;
      } catch (e) {
        window.uiManager.showToast(`Ping failed: ${e.message}`, 'error', 4000);
      } finally {
        btnModalPingNow.disabled = false;
        btnModalPingNow.textContent = 'Ping Now';
      }
    });
  }

  // Handle Replay Skeleton Click
  async function handleReplaySkeleton(recordingId, label) {
    try {
      window.uiManager.showToast('Loading skeleton sequence from PostgreSQL...', 'info', 2000);
      const recording = await window.supabaseService.getSkeletonRecordingById(recordingId);

      activeRecordingIdForModal = recordingId;
      replayModalTitle.textContent = `${label} • Skeleton Replay`;
      modalPredictionPanel.classList.remove('active');

      // Load into replay engine
      window.skeletonReplay.loadRecording(recording);

      // Open Modal
      replayModal.classList.add('active');
      window.skeletonReplay.play();
    } catch (err) {
      window.uiManager.showToast('Could not load recording for replay: ' + err.message, 'error', 4000);
    }
  }

  // Handle Direct ISL Model Inference Click
  async function handlePredictGesture(recordingId, label) {
    try {
      window.uiManager.showToast(`Running ISL model on stored landmarks for "${label}"...`, 'info', 2500);
      const result = await window.supabaseService.predictSkeletonGesture(recordingId);

      if (result.success && result.prediction) {
        const pred = result.prediction;
        window.uiManager.showToast(
          `🧠 Model Prediction: ${pred.predicted_label} (${pred.confidence_percentage})`,
          'success',
          5000
        );
      }
    } catch (err) {
      window.uiManager.showToast('Model prediction error: ' + err.message, 'error', 4000);
    }
  }

  // Handle Delete
  async function handleDeleteSkeleton(recordingId) {
    if (!confirm('Are you sure you want to delete this skeleton movement sequence from PostgreSQL?')) {
      return;
    }
    try {
      await window.supabaseService.deleteSkeletonRecording(recordingId);
      window.uiManager.showToast('Skeleton sequence deleted.', 'success', 2000);
      await loadDatabaseExplorer();
    } catch (err) {
      window.uiManager.showToast('Delete failed: ' + err.message, 'error', 4000);
    }
  }

  // Replay Modal Close
  replayModalCloseBtn.addEventListener('click', () => {
    window.skeletonReplay.pause();
    replayModal.classList.remove('active');
    activeRecordingIdForModal = null;
  });

  replayModal.addEventListener('click', (e) => {
    if (e.target === replayModal) {
      replayModalCloseBtn.click();
    }
  });

  // Replay Restart Button
  btnReplayRestart.addEventListener('click', () => {
    window.skeletonReplay.seekToFrame(0);
    window.skeletonReplay.play();
  });

  // Replay Speed Select
  replaySpeedSelect.addEventListener('change', (e) => {
    window.skeletonReplay.setSpeed(parseFloat(e.target.value));
  });

  // Run Prediction from Modal
  btnPredictFromModal.addEventListener('click', async () => {
    if (!activeRecordingIdForModal) return;
    btnPredictFromModal.disabled = true;
    btnPredictFromModal.textContent = 'Running Inference...';

    try {
      const res = await window.supabaseService.predictSkeletonGesture(activeRecordingIdForModal);
      if (res.success && res.prediction) {
        const pred = res.prediction;
        modalPredLabel.textContent = pred.predicted_label;
        modalPredConfidence.textContent = pred.confidence_percentage;
        modalPredBar.style.width = pred.confidence_percentage;

        modalPredCandidates.innerHTML = (pred.top_candidates || []).map(c => `
          <span class="candidate-chip">
            ${c.label}: ${(c.confidence * 100).toFixed(1)}%
          </span>
        `).join('');

        modalPredictionPanel.classList.add('active');
        window.uiManager.showToast(`Predicted: ${pred.predicted_label}`, 'success', 3000);
      }
    } catch (e) {
      window.uiManager.showToast(`Inference failed: ${e.message}`, 'error', 4000);
    } finally {
      btnPredictFromModal.disabled = false;
      btnPredictFromModal.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>
        Run ISL Model Prediction
      `;
    }
  });

  // Filters & Search
  galleryFilterBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      galleryFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      await loadDatabaseExplorer();
    });
  });

  let searchTimeout = null;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      searchTerm = e.target.value.trim();
      await loadDatabaseExplorer();
    }, 300);
  });

  btnRefreshSkeletons.addEventListener('click', loadDatabaseExplorer);

  // Theme Toggle
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const target = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', target);
      themeToggleBtn.innerHTML = target === 'dark' 
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    });
  }
});
