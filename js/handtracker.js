const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17]
];

const TIPS = [4, 8, 12, 16, 20];
const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20]
];

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(min, max, value) {
  const t = clamp((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function angleBetween(a, b) {
  const lengthA = Math.hypot(a.x, a.y, a.z || 0);
  const lengthB = Math.hypot(b.x, b.y, b.z || 0);
  if (!lengthA || !lengthB) return 0;
  const dot = (a.x * b.x + a.y * b.y + (a.z || 0) * (b.z || 0)) / (lengthA * lengthB);
  return Math.acos(clamp(dot, -1, 1));
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
}

function averagePoints(points) {
  const result = { x: 0, y: 0, z: 0 };
  for (const p of points) {
    result.x += p.x;
    result.y += p.y;
    result.z += p.z || 0;
  }
  result.x /= points.length;
  result.y /= points.length;
  result.z /= points.length;
  return result;
}

/**
 * Derives a continuous 0..1 openness value from the 21 MediaPipe landmarks.
 * The value is designed to behave well for both a selfie-mirrored and a
 * directly-facing hand: a fist settles near 0, an open palm near 1.
 */
export function readGesture(landmarks) {
  const wrist = landmarks[0];
  const palmSize = Math.max(0.035, distance(wrist, landmarks[9]));

  const fingers = FINGERS.map(([mcp, pip, tip]) => {
    const ratio = distance(landmarks[tip], wrist) / Math.max(0.01, distance(landmarks[pip], wrist));
    const straightness = angleBetween(
      sub(landmarks[pip], landmarks[mcp]),
      sub(landmarks[tip], landmarks[pip])
    );
    const ratioOpen = smoothstep(0.93, 1.26, ratio);
    const angleOpen = 1 - smoothstep(0.42, 1.55, straightness);
    return clamp(ratioOpen * 0.58 + angleOpen * 0.42);
  });

  const thumbTip = landmarks[4];
  const thumbStretch = distance(thumbTip, landmarks[17]) / palmSize;
  const thumbAngle = angleBetween(
    sub(landmarks[3], landmarks[2]),
    sub(thumbTip, landmarks[3])
  );
  const thumbOpen = clamp(
    smoothstep(0.98, 1.55, thumbStretch) * 0.55 +
    (1 - smoothstep(0.35, 1.4, thumbAngle)) * 0.45
  );

  const rawOpenness = clamp(
    (fingers[0] + fingers[1] + fingers[2] + fingers[3]) / 4 * 0.84 +
    thumbOpen * 0.16
  );

  let openness = smoothstep(0.16, 0.78, rawOpenness);
  const extendedCount = fingers.filter((value) => value > 0.5).length;
  if (extendedCount <= 1) openness = Math.min(openness, 0.08);
  if (extendedCount === 2) openness = Math.min(openness, 0.22);
  if (extendedCount === 3) openness = Math.min(openness, 0.48);

  return {
    openness,
    fingers,
    thumbOpen,
    rawOpenness,
    handState: openness < 0.24 ? "fist" : openness > 0.58 ? "open" : "half"
  };
}

/**
 * Wraps MediaPipe's HandLandmarker, smooths the 21 landmarks, derives a
 * continuous "openness" value and mirrors the preview for a natural selfie view.
 */
export class HandTracker {
  constructor({ video, canvas, onFrame, onStatus, onError } = {}) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onFrame = onFrame || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onError = onError || (() => {});

    this.running = false;
    this.ready = false;
    this.stream = null;
    this.landmarker = null;
    this.raf = 0;
    this.lastVideoTime = -1;
    this.lastTimestamp = 0;
    this.lastDetectAt = 0;
    this.lastFrameAt = performance.now();
    this.lastSeenAt = 0;
    this.presence = 0;
    this.smoothLandmarks = null;
    this.smoothOpen = 0;
    this.hadHand = false;
    this.lastLandmarks = null;
    this.status = "idle";
    this.error = null;
    this._resizeCanvas();
    window.addEventListener("resize", () => this._resizeCanvas(), { passive: true });
  }

  _resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  resizePreview() {
    this._resizeCanvas();
  }

  _setStatus(status, detail = "") {
    this.status = status;
    this.lastStatus = status;
    this.onStatus({ status, detail });
  }

  async start() {
    if (this.running) return;
    this.error = null;
    this.smoothOpen = 0;

    if (!navigator.mediaDevices?.getUserMedia) {
      const error = new Error("当前浏览器或环境不支持摄像头访问。");
      this._fail(error);
      return;
    }

    this.running = true;
    this._setStatus("requesting");

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 }
        }
      });

      this.video.srcObject = this.stream;
      await this.video.play();

      this._loop();
      this._setStatus("loading");
      await this._loadModel();

      this.ready = true;
      this.lastVideoTime = -1;
      this._setStatus("searching");
    } catch (error) {
      this._fail(error);
    }
  }

  async _loadModel() {
    if (this.landmarker) return;

    let vision;
    try {
      const module = await import("../vendor/tasks-vision/vision_bundle.mjs");
      const wasmRoot = new URL("../vendor/tasks-vision/wasm", import.meta.url).href;
      const modelPath = new URL("../vendor/models/hand_landmarker.task", import.meta.url).href;
      vision = await module.FilesetResolver.forVisionTasks(wasmRoot);

      const options = {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.58,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55
      };

      try {
        this.landmarker = await module.HandLandmarker.createFromOptions(vision, options);
      } catch (gpuError) {
        options.baseOptions.delegate = "CPU";
        this.landmarker = await module.HandLandmarker.createFromOptions(vision, options);
      }
    } catch (error) {
      throw new Error("手部识别模型加载失败，请检查本地 vendor 文件是否完整。", { cause: error });
    }
  }

  _fail(error) {
    this.running = false;
    this.ready = false;
    this.error = error;
    cancelAnimationFrame(this.raf);
    this._stopStream();
    this._setStatus("error", error?.message || "摄像头启动失败");
    this.onError(error);
  }

  async stop() {
    this.running = false;
    this.ready = false;
    this.presence = 0;
    this.hadHand = false;
    this.smoothOpen = 0;
    this.smoothLandmarks = null;
    this.lastLandmarks = null;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this._stopStream();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.parentElement?.classList.remove("is-live");
    this._setStatus("idle");
    this.onFrame({ present: false, openness: 0, reset: true });
  }

  _stopStream() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.video.srcObject) {
      this.video.pause();
      this.video.srcObject = null;
    }
  }

  _loop() {
    if (!this.running) return;

    const now = performance.now();
    const delta = Math.min(0.1, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;

    if (this.ready && this.landmarker && this.video.readyState >= 2) {
      if (this.video.currentTime !== this.lastVideoTime && now - this.lastDetectAt > 28) {
        this.lastVideoTime = this.video.currentTime;
        this.lastDetectAt = now;
        this._detect(now, delta);
      }
    }

    this.presence += ((this.hadHand ? 1 : 0) - this.presence) * (1 - Math.exp(-delta * 8));
    this._drawPreview();

    this.raf = requestAnimationFrame(() => this._loop());
  }

  _detect(now, delta) {
    let results;
    try {
      const timestamp = Math.max(this.lastTimestamp + 0.01, now);
      this.lastTimestamp = timestamp;
      results = this.landmarker.detectForVideo(this.video, timestamp);
    } catch (error) {
      if (!this._detectErrorShown) {
        this._detectErrorShown = true;
        console.warn("Hand detection error:", error);
      }
      return;
    }

    const landmarks = results?.landmarks?.[0];
    if (landmarks && landmarks.length === 21) {
      this.lastSeenAt = now;
      this.hadHand = true;
      this.lastLandmarks = landmarks;

      const mirrored = landmarks.map((point, index) => ({
        x: 1 - point.x,
        y: point.y,
        z: point.z || 0,
        index
      }));

      if (!this.smoothLandmarks) {
        this.smoothLandmarks = mirrored.map((point) => ({ ...point }));
      } else {
        const speed = 0.42;
        this.smoothLandmarks = this.smoothLandmarks.map((point, index) => {
          const target = mirrored[index];
          const jump = Math.hypot(target.x - point.x, target.y - point.y);
          const alpha = jump > 0.12 ? 0.78 : speed;
          return {
            x: point.x + (target.x - point.x) * alpha,
            y: point.y + (target.y - point.y) * alpha,
            z: point.z + (target.z - point.z) * alpha,
            index
          };
        });
      }

      const metrics = readGesture(this.smoothLandmarks);
      this.smoothOpen += (metrics.openness - this.smoothOpen) * (1 - Math.exp(-delta * 14));
      if (this.hadHand && this.lastStatus !== "tracking") {
        this.lastStatus = "tracking";
        this._setStatus("tracking");
      }

      this.onFrame({
        present: true,
        landmarks: this.smoothLandmarks,
        tips: TIPS.map((index) => this.smoothLandmarks[index]),
        palm: averagePoints([0, 5, 9, 13, 17].map((index) => this.smoothLandmarks[index])),
        openness: this.smoothOpen,
        fingerStates: metrics.fingers,
        handState: metrics.handState
      });
    } else {
      if (this.hadHand && now - this.lastSeenAt > 220) {
        this.hadHand = false;
        this.smoothLandmarks = null;
        this.smoothOpen += (0 - this.smoothOpen) * (1 - Math.exp(-delta * 4));
        this.lastStatus = "searching";
        this._setStatus("searching");
        this.onFrame({ present: false, openness: this.smoothOpen });
      } else if (!this.hadHand && this.lastStatus !== "searching" && this.ready) {
        this.lastStatus = "searching";
        this._setStatus("searching");
      }
    }
  }


  _drawPreview() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (!width || !height) return;

    ctx.clearRect(0, 0, width, height);

    if (!this.video.videoWidth || !this.video.videoHeight) {
      return;
    }

    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;
    const scale = Math.max(width / videoWidth, height / videoHeight);
    const drawWidth = videoWidth * scale;
    const drawHeight = videoHeight * scale;
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, offsetX, offsetY, drawWidth, drawHeight);
    ctx.restore();

    /* warm darkening + vignette */
    ctx.save();
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(20, 8, 14, 0.36)");
    gradient.addColorStop(0.55, "rgba(13, 8, 13, 0.12)");
    gradient.addColorStop(1, "rgba(20, 8, 14, 0.55)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const vignette = ctx.createRadialGradient(width / 2, height * 0.45, height * 0.1, width / 2, height * 0.5, width * 0.72);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(4, 3, 6, 0.58)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    if (!this.lastLandmarks) return;

    const alpha = 0.24 + this.presence * 0.76;
    const toCanvas = (point) => ({
      x: (1 - point.x) * drawWidth + (width - drawWidth) / 2,
      y: point.y * drawHeight + offsetY
    });

    const points = this.lastLandmarks.map(toCanvas);

    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.lineWidth = Math.max(1, width / 260);
    ctx.strokeStyle = "rgba(255, 218, 186, 0.6)";
    ctx.shadowColor = "rgba(255, 165, 124, 0.28)";
    ctx.shadowBlur = width * 0.018;

    for (const [from, to] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(points[from].x, points[from].y);
      ctx.lineTo(points[to].x, points[to].y);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    for (let i = 0; i < points.length; i++) {
      const tipIndex = TIPS.indexOf(i);
      const radius = tipIndex >= 0 ? width * 0.011 : width * 0.0052;
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, radius, 0, Math.PI * 2);
      ctx.fillStyle = tipIndex >= 0 ? "rgba(255, 239, 217, 0.96)" : "rgba(255, 214, 183, 0.62)";
      ctx.fill();

      if (tipIndex >= 0) {
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, radius * 3.9, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 172, 132, 0.09)";
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
