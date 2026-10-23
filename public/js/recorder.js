/**
 * SignLine Video Studio - Camera & MediaRecorder Engine
 */

class CameraRecorderEngine {
  constructor() {
    this.stream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordedBlob = null;
    this.recordingStartTime = 0;
    this.recordingTimerInterval = null;
    this.elapsedSeconds = 0;
    this.isRecording = false;
    this.isPaused = false;

    // Audio Analysis
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.audioAnimFrame = null;

    // Callback Hooks
    this.onTimerUpdate = null;
    this.onAudioLevel = null;
    this.onRecordingStart = null;
    this.onRecordingStop = null;
    this.onRecordingPause = null;
    this.onRecordingResume = null;
  }

  async getAvailableDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      const audioDevices = devices.filter(d => d.kind === 'audioinput');
      return { videoDevices, audioDevices };
    } catch (err) {
      console.warn('Could not enumerate media devices:', err);
      return { videoDevices: [], audioDevices: [] };
    }
  }

  getOptimalMimeType() {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/webm',
      'video/mp4'
    ];

    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return '';
  }

  async startCamera(constraints = {}) {
    this.stopCamera();

    const defaultConstraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: true
    };

    const finalConstraints = {
      video: constraints.video || defaultConstraints.video,
      audio: constraints.audio !== undefined ? constraints.audio : defaultConstraints.audio
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(finalConstraints);
      this.initAudioVisualizer(this.stream);
      return this.stream;
    } catch (err) {
      console.error('Failed to get camera access:', err);
      throw err;
    }
  }

  initAudioVisualizer(stream) {
    try {
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) return;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;

      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const volumePercent = Math.min(100, Math.round((average / 128) * 100));

        if (this.onAudioLevel) {
          this.onAudioLevel(volumePercent);
        }

        this.audioAnimFrame = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('Audio visualizer not supported or failed:', e);
    }
  }

  stopAudioVisualizer() {
    if (this.audioAnimFrame) {
      cancelAnimationFrame(this.audioAnimFrame);
      this.audioAnimFrame = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;
    this.microphone = null;
  }

  stopCamera() {
    this.stopAudioVisualizer();
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  startRecording(stream = null) {
    if (stream) {
      this.stream = stream;
    }
    if (!this.stream) {
      throw new Error('Camera is not active. Please start camera first.');
    }

    this.recordedChunks = [];
    this.recordedBlob = null;
    this.elapsedSeconds = 0;

    const mimeType = this.getOptimalMimeType();
    const options = mimeType ? { mimeType } : {};

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, options);
    } catch (e) {
      console.warn('Fallback to default MediaRecorder options:', e);
      this.mediaRecorder = new MediaRecorder(this.stream);
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.stopTimer();
      this.isRecording = false;
      this.isPaused = false;

      const finalType = this.mediaRecorder.mimeType || 'video/webm';
      this.recordedBlob = new Blob(this.recordedChunks, { type: finalType });

      if (this.onRecordingStop) {
        this.onRecordingStop(this.recordedBlob, this.elapsedSeconds);
      }
    };

    // Request data in chunks of 500ms for responsiveness
    this.mediaRecorder.start(500);
    this.isRecording = true;
    this.isPaused = false;
    this.startTimer();

    if (this.onRecordingStart) {
      this.onRecordingStart();
    }
  }

  pauseRecording() {
    if (this.mediaRecorder && this.isRecording && !this.isPaused) {
      this.mediaRecorder.pause();
      this.isPaused = true;
      this.stopTimer();
      if (this.onRecordingPause) {
        this.onRecordingPause();
      }
    }
  }

  resumeRecording() {
    if (this.mediaRecorder && this.isRecording && this.isPaused) {
      this.mediaRecorder.resume();
      this.isPaused = false;
      this.startTimer();
      if (this.onRecordingResume) {
        this.onRecordingResume();
      }
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
  }

  stopRecordingAsync() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        return resolve(this.recordedBlob);
      }
      const existingHandler = this.mediaRecorder.onstop;
      this.mediaRecorder.onstop = (e) => {
        if (existingHandler) existingHandler.call(this.mediaRecorder, e);
        resolve(this.recordedBlob);
      };
      this.mediaRecorder.stop();
    });
  }

  startTimer() {
    const startTime = Date.now() - (this.elapsedSeconds * 1000);
    this.recordingTimerInterval = setInterval(() => {
      const now = Date.now();
      this.elapsedSeconds = Math.floor((now - startTime) / 1000);
      if (this.onTimerUpdate) {
        this.onTimerUpdate(this.elapsedSeconds);
      }
    }, 500);
  }

  stopTimer() {
    if (this.recordingTimerInterval) {
      clearInterval(this.recordingTimerInterval);
      this.recordingTimerInterval = null;
    }
  }

  formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  getRecordedBlob() {
    return this.recordedBlob;
  }
}

window.cameraEngine = new CameraRecorderEngine();
