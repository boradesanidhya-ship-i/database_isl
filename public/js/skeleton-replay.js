/**
 * SignLine - Skeleton Replay Engine & ISL Model Prediction
 * Reconstructs skeleton motion frame-by-frame on a black background canvas from stored database landmarks.
 */

class SkeletonReplayEngine {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.recordingData = null;
    this.frames = [];
    this.currentFrameIdx = 0;
    this.isPlaying = false;
    this.isLooping = true;
    this.playbackSpeed = 1.0;
    this.animFrameId = null;
    this.lastFrameTime = 0;

    // Bone connection definitions
    this.poseConnections = [
      [11, 12], // shoulders
      [11, 13], [13, 15], // left arm
      [12, 14], [14, 16], // right arm
      [11, 23], [12, 24], // torso
      [23, 24], // hips
      [0, 1], [1, 2], [2, 3], [3, 7], // face contour / nose to ears
      [0, 4], [4, 5], [5, 6], [6, 8]
    ];

    this.handConnections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // index
      [5, 9], [9, 10], [10, 11], [11, 12], // middle
      [9, 13], [13, 14], [14, 15], [15, 16], // ring
      [13, 17], [17, 18], [18, 19], [19, 20], [0, 17] // pinky
    ];

    // UI elements hooks
    this.scrubberEl = null;
    this.timeDisplayEl = null;
    this.playBtnEl = null;
  }

  attachControls(canvasEl, scrubberEl, timeDisplayEl, playBtnEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.scrubberEl = scrubberEl;
    this.timeDisplayEl = timeDisplayEl;
    this.playBtnEl = playBtnEl;

    this.canvas.width = 1280;
    this.canvas.height = 720;

    if (this.scrubberEl) {
      this.scrubberEl.addEventListener('input', (e) => {
        const idx = parseInt(e.target.value, 10);
        this.seekToFrame(idx);
      });
    }

    if (this.playBtnEl) {
      this.playBtnEl.addEventListener('click', () => {
        if (this.isPlaying) {
          this.pause();
        } else {
          this.play();
        }
      });
    }
  }

  loadRecording(recording) {
    this.pause();
    this.recordingData = recording;
    const seq = recording.movement_sequence;
    this.frames = (seq && seq.frames) ? seq.frames : (Array.isArray(seq) ? seq : []);
    this.currentFrameIdx = 0;

    if (this.scrubberEl) {
      this.scrubberEl.max = Math.max(0, this.frames.length - 1);
      this.scrubberEl.value = 0;
    }

    this.renderFrame(0);
    this.updateTimeDisplay();
  }

  play() {
    if (this.frames.length === 0) return;
    this.isPlaying = true;
    if (this.playBtnEl) {
      this.playBtnEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Pause`;
    }

    this.lastFrameTime = performance.now();
    this.animationLoop();
  }

  pause() {
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.playBtnEl) {
      this.playBtnEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Play`;
    }
  }

  setSpeed(speed) {
    this.playbackSpeed = speed;
  }

  setLoop(loop) {
    this.isLooping = loop;
  }

  seekToFrame(idx) {
    if (idx < 0 || idx >= this.frames.length) return;
    this.currentFrameIdx = idx;
    this.renderFrame(idx);
    this.updateTimeDisplay();
  }

  animationLoop() {
    if (!this.isPlaying) return;

    const now = performance.now();
    const targetFps = (this.recordingData?.fps || 30) * this.playbackSpeed;
    const frameIntervalMs = 1000 / targetFps;

    if (now - this.lastFrameTime >= frameIntervalMs) {
      this.currentFrameIdx++;
      if (this.currentFrameIdx >= this.frames.length) {
        if (this.isLooping) {
          this.currentFrameIdx = 0;
        } else {
          this.currentFrameIdx = this.frames.length - 1;
          this.pause();
          return;
        }
      }

      this.renderFrame(this.currentFrameIdx);
      if (this.scrubberEl) {
        this.scrubberEl.value = this.currentFrameIdx;
      }
      this.updateTimeDisplay();
      this.lastFrameTime = now;
    }

    this.animFrameId = requestAnimationFrame(() => this.animationLoop());
  }

  updateTimeDisplay() {
    if (!this.timeDisplayEl || this.frames.length === 0) return;
    const curFrame = this.frames[this.currentFrameIdx];
    const curSecs = curFrame ? (curFrame.t / 1000).toFixed(2) : '0.00';
    const totalSecs = (this.recordingData?.duration_seconds || (this.frames.length / 30)).toFixed(2);
    this.timeDisplayEl.textContent = `${curSecs}s / ${totalSecs}s [${this.currentFrameIdx + 1}/${this.frames.length}]`;
  }

  renderFrame(frameIdx) {
    if (!this.ctx || !this.frames[frameIdx]) return;
    const frame = this.frames[frameIdx];
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Pure Black Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // 2. Draw Body Pose (Cyan bones & joints)
    if (frame.pose && frame.pose.length > 0) {
      this.drawBones(ctx, frame.pose, this.poseConnections, '#06b6d4', 3, w, h);
      this.drawJoints(ctx, frame.pose, '#22d3ee', '#0891b2', 4, w, h);
    }

    // 3. Draw Left Hand (Emerald neon)
    const lh = frame.lh || frame.left_hand;
    if (lh && lh.length > 0) {
      this.drawBones(ctx, lh, this.handConnections, '#10b981', 2.5, w, h);
      this.drawJoints(ctx, lh, '#34d399', '#059669', 3.5, w, h);
    }

    // 4. Draw Right Hand (Violet neon)
    const rh = frame.rh || frame.right_hand;
    if (rh && rh.length > 0) {
      this.drawBones(ctx, rh, this.handConnections, '#8b5cf6', 2.5, w, h);
      this.drawJoints(ctx, rh, '#a78bfa', '#7c3aed', 3.5, w, h);
    }

    // 5. Draw Facial Keypoints (Amber nodes)
    if (frame.face && frame.face.length > 0) {
      this.drawJoints(ctx, frame.face, '#f59e0b', '#d97706', 2.5, w, h);
    }

    // Overlay watermark / frame badge
    ctx.save();
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText(`SignLine Replay • Frame ${frameIdx + 1}/${this.frames.length} (${(frame.t / 1000).toFixed(2)}s)`, 20, h - 20);
    ctx.restore();
  }

  drawBones(ctx, points, connections, color, lineWidth, w, h) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    connections.forEach(([i, j]) => {
      const p1 = points[i];
      const p2 = points[j];
      if (p1 && p2 && (p1.v === undefined || p1.v > 0.3) && (p2.v === undefined || p2.v > 0.3)) {
        ctx.beginPath();
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  drawJoints(ctx, points, strokeColor, fillColor, radius, w, h) {
    ctx.save();
    points.forEach(p => {
      if (p && (p.v === undefined || p.v > 0.3)) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
    ctx.restore();
  }
}

window.skeletonReplay = new SkeletonReplayEngine();
