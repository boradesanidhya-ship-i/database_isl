/**
 * SignLine - Real-Time MediaPipe Holistic Skeleton Tracker
 * Tracks hand, pose, and face landmarks, draws on a pure black canvas,
 * and collects temporal landmark sequences for direct Supabase PostgreSQL storage.
 */

class SkeletonTracker {
  constructor() {
    this.videoElement = null;
    this.canvasElement = null;
    this.canvasCtx = null;
    this.holistic = null;
    this.camera = null;

    // View mode: 'skeleton' (black bg), 'split', 'overlay'
    this.viewMode = 'skeleton';
    this.isTracking = false;
    this.isRecording = false;

    // Temporal Sequence Recording
    this.recordingStartTime = 0;
    this.recordedFrames = [];
    this.lastSavedSequence = null;

    // Callbacks
    this.onFrameCaptured = null;
    this.onTrackingStatus = null;
  }

  async init(videoEl, canvasEl) {
    this.videoElement = videoEl;
    this.canvasElement = canvasEl;
    this.canvasCtx = canvasEl.getContext('2d');

    // Set canvas internal resolution to match video aspect ratio (1280x720)
    this.canvasElement.width = 1280;
    this.canvasElement.height = 720;

    // Clear black
    this.clearBlackCanvas();

    console.log('⏳ Initializing MediaPipe Holistic solution...');
    if (typeof Holistic === 'undefined') {
      console.warn('MediaPipe Holistic library not yet loaded from CDN. Will wait...');
      await this.waitForMediaPipe();
    }

    try {
      this.holistic = new Holistic({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
      });

      this.holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        refineFaceLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.holistic.onResults((results) => this.onResults(results));
      console.log('✅ MediaPipe Holistic initialized successfully.');
      return true;
    } catch (err) {
      console.error('Failed to initialize MediaPipe Holistic:', err);
      throw err;
    }
  }

  waitForMediaPipe() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (typeof Holistic !== 'undefined') {
          clearInterval(interval);
          resolve();
        } else if (attempts > 50) {
          clearInterval(interval);
          reject(new Error('MediaPipe script failed to load from CDN.'));
        }
      }, 100);
    });
  }

  clearBlackCanvas() {
    if (!this.canvasCtx) return;
    this.canvasCtx.save();
    this.canvasCtx.fillStyle = '#03050a';
    this.canvasCtx.fillRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    this.canvasCtx.restore();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    console.log('View mode set to:', mode);
  }

  async startTracking() {
    if (!this.holistic || !this.videoElement) return;

    this.isTracking = true;

    // Use MediaPipe Camera helper or requestVideoFrameCallback / requestAnimationFrame
    const processFrame = async () => {
      if (!this.isTracking) return;

      if (this.videoElement.readyState >= 2 && !this.videoElement.paused) {
        try {
          await this.holistic.send({ image: this.videoElement });
        } catch (e) {
          // ignore transient frame send errors
        }
      }

      if ('requestVideoFrameCallback' in this.videoElement) {
        this.videoElement.requestVideoFrameCallback(processFrame);
      } else {
        requestAnimationFrame(processFrame);
      }
    };

    if ('requestVideoFrameCallback' in this.videoElement) {
      this.videoElement.requestVideoFrameCallback(processFrame);
    } else {
      requestAnimationFrame(processFrame);
    }
  }

  stopTracking() {
    this.isTracking = false;
  }

  onResults(results) {
    const ctx = this.canvasCtx;
    const w = this.canvasElement.width;
    const h = this.canvasElement.height;

    // 1. Clear background
    ctx.save();
    if (this.viewMode === 'overlay') {
      // Draw dimmed camera video
      ctx.globalAlpha = 0.25;
      ctx.drawImage(results.image, 0, 0, w, h);
      ctx.globalAlpha = 1.0;
    } else {
      // Pure black background as required
      ctx.fillStyle = '#03050a';
      ctx.fillRect(0, 0, w, h);
    }

    // 2. Draw Connected Landmark Nodes
    // Draw Body Pose (Cyan lines, bright joints)
    if (results.poseLandmarks && typeof drawConnectors !== 'undefined') {
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: '#06b6d4',
        lineWidth: 3
      });
      drawLandmarks(ctx, results.poseLandmarks, {
        color: '#22d3ee',
        fillColor: '#0891b2',
        lineWidth: 1.5,
        radius: 4
      });
    }

    // Draw Left Hand (Emerald neon)
    if (results.leftHandLandmarks && typeof drawConnectors !== 'undefined') {
      drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, {
        color: '#10b981',
        lineWidth: 2.5
      });
      drawLandmarks(ctx, results.leftHandLandmarks, {
        color: '#34d399',
        fillColor: '#059669',
        lineWidth: 1,
        radius: 3.5
      });
    }

    // Draw Right Hand (Violet / Purple neon)
    if (results.rightHandLandmarks && typeof drawConnectors !== 'undefined') {
      drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, {
        color: '#8b5cf6',
        lineWidth: 2.5
      });
      drawLandmarks(ctx, results.rightHandLandmarks, {
        color: '#a78bfa',
        fillColor: '#7c3aed',
        lineWidth: 1,
        radius: 3.5
      });
    }

    // Draw Facial Landmarks (Amber lines for lips, eyebrows, and eye contours)
    if (results.faceLandmarks && typeof drawConnectors !== 'undefined') {
      // Draw lips contour (critical for sign lip movements)
      if (typeof FACEMESH_LIPS !== 'undefined') {
        drawConnectors(ctx, results.faceLandmarks, FACEMESH_LIPS, {
          color: '#f59e0b',
          lineWidth: 2
        });
      }
      // Draw eyebrows
      if (typeof FACEMESH_LEFT_EYEBROW !== 'undefined') {
        drawConnectors(ctx, results.faceLandmarks, FACEMESH_LEFT_EYEBROW, {
          color: '#fbbf24',
          lineWidth: 1.5
        });
      }
      if (typeof FACEMESH_RIGHT_EYEBROW !== 'undefined') {
        drawConnectors(ctx, results.faceLandmarks, FACEMESH_RIGHT_EYEBROW, {
          color: '#fbbf24',
          lineWidth: 1.5
        });
      }
    }

    ctx.restore();

    // 3. Status Telemetry
    const poseCount = results.poseLandmarks ? results.poseLandmarks.length : 0;
    const lhCount = results.leftHandLandmarks ? results.leftHandLandmarks.length : 0;
    const rhCount = results.rightHandLandmarks ? results.rightHandLandmarks.length : 0;

    if (this.onTrackingStatus) {
      this.onTrackingStatus({
        hasPose: poseCount > 0,
        hasLeftHand: lhCount > 0,
        hasRightHand: rhCount > 0,
        totalPoints: poseCount + lhCount + rhCount
      });
    }

    // 4. Record Temporal Sequence if recording active
    if (this.isRecording) {
      const now = performance.now();
      const elapsedMs = Math.round(now - this.recordingStartTime);

      // Extract relevant facial landmark subset (lips, brows, nose tip: ~40 points instead of 468)
      const keyFace = this.extractKeyFacePoints(results.faceLandmarks);

      const frameData = {
        t: elapsedMs,
        pose: results.poseLandmarks ? results.poseLandmarks.map(p => ({
          x: +p.x.toFixed(4),
          y: +p.y.toFixed(4),
          z: +p.z.toFixed(4),
          v: +(p.visibility || 1).toFixed(2)
        })) : null,
        lh: results.leftHandLandmarks ? results.leftHandLandmarks.map(p => ({
          x: +p.x.toFixed(4),
          y: +p.y.toFixed(4),
          z: +p.z.toFixed(4)
        })) : null,
        rh: results.rightHandLandmarks ? results.rightHandLandmarks.map(p => ({
          x: +p.x.toFixed(4),
          y: +p.y.toFixed(4),
          z: +p.z.toFixed(4)
        })) : null,
        face: keyFace
      };

      this.recordedFrames.push(frameData);

      if (this.onFrameCaptured) {
        this.onFrameCaptured(this.recordedFrames.length, elapsedMs / 1000);
      }
    }
  }

  extractKeyFacePoints(faceLandmarks) {
    if (!faceLandmarks || faceLandmarks.length === 0) return null;
    // Indices for lips (outer & inner) and eyebrows
    const keyIndices = [
      0, 13, 14, 17, 61, 291, 78, 308, // lips
      70, 63, 105, 66, 107,            // left eyebrow
      300, 293, 334, 296, 336,         // right eyebrow
      1, 4                             // nose tip
    ];

    const extracted = [];
    keyIndices.forEach(idx => {
      if (faceLandmarks[idx]) {
        extracted.push({
          i: idx,
          x: +faceLandmarks[idx].x.toFixed(4),
          y: +faceLandmarks[idx].y.toFixed(4),
          z: +faceLandmarks[idx].z.toFixed(4)
        });
      }
    });
    return extracted;
  }

  startRecording() {
    this.recordedFrames = [];
    this.recordingStartTime = performance.now();
    this.isRecording = true;
    console.log('🔴 Started recording temporal skeleton landmark sequence.');
  }

  stopRecording() {
    this.isRecording = false;
    const totalDurationSecs = (performance.now() - this.recordingStartTime) / 1000;
    const frameCount = this.recordedFrames.length;

    console.log(`⏹️ Stopped recording: ${frameCount} frames captured across ${totalDurationSecs.toFixed(2)}s.`);

    // Sequence Validation
    const validation = this.validateSequence(this.recordedFrames);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.reason,
        frames: this.recordedFrames
      };
    }

    const fps = frameCount > 0 && totalDurationSecs > 0 
      ? +(frameCount / totalDurationSecs).toFixed(1) 
      : 30;

    const sequencePayload = {
      fps,
      total_frames: frameCount,
      duration_seconds: +totalDurationSecs.toFixed(2),
      frames: this.recordedFrames
    };

    this.lastSavedSequence = sequencePayload;

    return {
      success: true,
      sequence: sequencePayload,
      frameCount,
      durationSeconds: +totalDurationSecs.toFixed(2),
      fps
    };
  }

  validateSequence(frames) {
    if (!frames || frames.length < 5) {
      return {
        isValid: false,
        reason: `Movement sequence is too short (${frames ? frames.length : 0} frames). Please hold the sign for at least 1-2 seconds.`
      };
    }

    // Verify that at least pose or hand was detected in at least 30% of frames
    let validDetections = 0;
    frames.forEach(f => {
      if (f.pose || f.lh || f.rh) validDetections++;
    });

    if (validDetections < frames.length * 0.3) {
      return {
        isValid: false,
        reason: 'No clear body or hand landmarks were detected. Please ensure you are visible in the camera frame.'
      };
    }

    return { isValid: true };
  }

  getLastSequence() {
    return this.lastSavedSequence;
  }
}

window.skeletonTracker = new SkeletonTracker();
