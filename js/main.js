import * as THREE from "three";
import { Flower } from "./flower.js";
import { HandTracker } from "./handtracker.js";
import { Scenery } from "./scenery.js";

/* =========================================================
   ANTHOS — experience controller
   ========================================================= */

const canvas = document.querySelector("#scene");
const cameraBtn = document.querySelector("#cameraBtn");
const cameraBtnText = document.querySelector("#cameraBtnText");
const cameraBtnSub = document.querySelector("#cameraBtnSub");
const cameraVideo = document.querySelector("#cameraVideo");
const handCanvas = document.querySelector("#handCanvas");
const camFrame = document.querySelector("#camFrame");
const camState = document.querySelector("#camState");
const systemState = document.querySelector("#systemState");
const systemText = document.querySelector("#systemText");
const bloomValue = document.querySelector("#bloomValue");
const bloomFill = document.querySelector("#bloomFill");
const bloomSpark = document.querySelector("#bloomSpark");
const gestureLabel = document.querySelector("#gestureLabel");
const interactionText = document.querySelector("#interactionText");
const particleCount = document.querySelector("#particleCount");
const cursorHalo = document.querySelector("#cursorHalo");
const toast = document.querySelector("#toast");
const guideModal = document.querySelector("#guideModal");
const guideBtn = document.querySelector("#guideBtn");
const guideEnableBtn = document.querySelector("#guideEnableBtn");
const exitCameraBtn = document.querySelector("#exitCameraBtn");
const liveHud = document.querySelector("#liveHud");
const liveGestureEn = document.querySelector("#liveGestureEn");
const liveGestureZh = document.querySelector("#liveGestureZh");
const heroSection = document.querySelector(".hero");
const loader = document.querySelector("#loader");
const loaderBar = document.querySelector("#loaderBar");
const loaderStatus = document.querySelector("#loaderStatus");

const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- renderer ---------------- */

function getRenderPixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  const viewportPixels = Math.max(1, window.innerWidth * window.innerHeight);
  const budget = Math.sqrt(2900000 / viewportPixels);
  return Math.max(1, Math.min(dpr, 2, budget));
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(getRenderPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x07060a, 1);
renderer.autoClear = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 80);
const cameraBase = new THREE.Vector3(0.42, 3.8, 8.8);
const cameraTarget = new THREE.Vector3(0.38, 0.72, 0);
camera.position.copy(cameraBase);
camera.lookAt(cameraTarget);

const flower = new Flower({ pixelRatio: renderer.getPixelRatio() });
scene.add(flower.group);

const scenery = new Scenery(scene, { pixelRatio: renderer.getPixelRatio() });

particleCount.textContent = flower.totalCount.toLocaleString("en-US");

/* ---------------- fingertip glows ---------------- */

function createGlowTexture() {
  const size = 128;
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = size;
  glowCanvas.height = size;
  const ctx = glowCanvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.08, "rgba(255,236,210,0.95)");
  gradient.addColorStop(0.25, "rgba(255,170,130,0.38)");
  gradient.addColorStop(0.62, "rgba(255,120,100,0.07)");
  gradient.addColorStop(1, "rgba(255,100,80,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(glowCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const tipGlowTexture = createGlowTexture();
const tipGlows = [];
for (let i = 0; i < 5; i++) {
  const material = new THREE.SpriteMaterial({
    map: tipGlowTexture,
    color: i === 0 ? 0xffe1c4 : 0xffc6a5,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.52, 0.52, 1);
  sprite.visible = false;
  sprite.renderOrder = 20;
  sprite.userData.smooth = new THREE.Vector3();
  sprite.userData.target = new THREE.Vector3();
  sprite.userData.strength = 0;
  scene.add(sprite);
  tipGlows.push(sprite);
}

/* ---------------- procedural background ---------------- */

const backgroundScene = new THREE.Scene();
const backgroundCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const backgroundMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uAspect: { value: 1.6 },
    uAura: { value: new THREE.Vector2(0.66, 0.45) },
    uOpen: { value: 0.5 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uAspect;
    uniform vec2 uAura;
    uniform float uOpen;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec3 color = mix(vec3(0.0012, 0.0010, 0.0021), vec3(0.0032, 0.0016, 0.0027), smoothstep(0.0, 1.0, uv.y));

      vec2 p = vec2((uv.x - uAura.x) * uAspect, uv.y - uAura.y);
      float d2 = dot(p, p);
      float halo = exp(-d2 * 0.8) * (0.72 + uOpen * 0.24);
      color += vec3(0.0038, 0.0007, 0.0014) * halo;

      vec2 q = vec2((uv.x - 0.08) * uAspect, uv.y - 0.8);
      color += vec3(0.0014, 0.0011, 0.0028) * exp(-dot(q, q) * 2.0);

      vec2 vignetteUv = (uv - vec2(0.52, 0.51)) * vec2(uAspect, 1.0);
      float vignette = smoothstep(1.15, 0.18, length(vignetteUv));
      color *= 0.72 + 0.28 * vignette;

      // Fine grain breaks up 8-bit banding in the very dark gradient.
      float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      color += (dither - 0.5) * vec3(0.00055, 0.00042, 0.00038);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
  depthTest: false,
  depthWrite: false
});
const backgroundQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backgroundMaterial);
backgroundQuad.frustumCulled = false;
backgroundScene.add(backgroundQuad);

/* ---------------- cinematic bloom ---------------- */

const postScene = new THREE.Scene();
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial()
);
postQuad.frustumCulled = false;
postScene.add(postQuad);

const postVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const brightPassShader = /* glsl */ `
  uniform sampler2D tScene;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;

  void main() {
    vec4 base = texture2D(tScene, vUv);
    float luma = max(base.r, max(base.g, base.b));
    float weight = smoothstep(uThreshold, uThreshold + uKnee, luma);
    gl_FragColor = vec4(base.rgb * weight, 1.0);
  }
`;

const blurShader = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 uTexel;
  uniform vec2 uDirection;
  varying vec2 vUv;

  void main() {
    vec2 offset = uTexel * uDirection;
    vec4 color = texture2D(tInput, vUv) * 0.2270270270;
    color += texture2D(tInput, vUv + offset * 1.3846153846) * 0.3162162162;
    color += texture2D(tInput, vUv - offset * 1.3846153846) * 0.3162162162;
    color += texture2D(tInput, vUv + offset * 3.2307692308) * 0.0702702703;
    color += texture2D(tInput, vUv - offset * 3.2307692308) * 0.0702702703;
    gl_FragColor = color;
  }
`;

const compositeShader = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    vec4 base = texture2D(tScene, vUv);
    vec3 bloom = texture2D(tBloom, vUv).rgb * uStrength;
    vec3 color = base.rgb + bloom;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const brightMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tScene: { value: null },
    uThreshold: { value: 0.27 },
    uKnee: { value: 0.3 }
  },
  vertexShader: postVertexShader,
  fragmentShader: brightPassShader,
  depthTest: false,
  depthWrite: false
});

const blurMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tInput: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 720, 1 / 450) },
    uDirection: { value: new THREE.Vector2(1, 0) }
  },
  vertexShader: postVertexShader,
  fragmentShader: blurShader,
  depthTest: false,
  depthWrite: false
});

const compositeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tScene: { value: null },
    tBloom: { value: null },
    uStrength: { value: 0.8 }
  },
  vertexShader: postVertexShader,
  fragmentShader: compositeShader,
  depthTest: false,
  depthWrite: false
});

const sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true,
  stencilBuffer: false
});
sceneTarget.samples = 0;

const bloomTargetA = new THREE.WebGLRenderTarget(1, 1, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: false,
  stencilBuffer: false
});

const bloomTargetB = bloomTargetA.clone();

function resizeRenderTargets() {
  const pixelRatio = renderer.getPixelRatio();
  const width = Math.max(1, Math.floor(window.innerWidth * pixelRatio));
  const height = Math.max(1, Math.floor(window.innerHeight * pixelRatio));

  sceneTarget.setSize(width, height);

  const bloomWidth = Math.max(1, Math.floor(width * 0.5));
  const bloomHeight = Math.max(1, Math.floor(height * 0.5));
  bloomTargetA.setSize(bloomWidth, bloomHeight);
  bloomTargetB.setSize(bloomWidth, bloomHeight);
  blurMaterial.uniforms.uTexel.value.set(1 / bloomWidth, 1 / bloomHeight);
  backgroundMaterial.uniforms.uAspect.value = window.innerWidth / Math.max(1, window.innerHeight);
}

function renderPost() {
  renderer.setClearColor(0x07060a, 1);

  renderer.setRenderTarget(sceneTarget);
  renderer.clear();
  renderer.render(backgroundScene, backgroundCamera);
  renderer.clearDepth();
  renderer.render(scene, camera);

  postQuad.material = brightMaterial;
  brightMaterial.uniforms.tScene.value = sceneTarget.texture;
  renderer.setRenderTarget(bloomTargetA);
  renderer.clear();
  renderer.render(postScene, postCamera);

  postQuad.material = blurMaterial;
  blurMaterial.uniforms.tInput.value = bloomTargetA.texture;
  blurMaterial.uniforms.uDirection.value.set(1, 0);
  renderer.setRenderTarget(bloomTargetB);
  renderer.clear();
  renderer.render(postScene, postCamera);

  blurMaterial.uniforms.tInput.value = bloomTargetB.texture;
  blurMaterial.uniforms.uDirection.value.set(0, 1);
  renderer.setRenderTarget(bloomTargetA);
  renderer.clear();
  renderer.render(postScene, postCamera);

  postQuad.material = compositeMaterial;
  compositeMaterial.uniforms.tScene.value = sceneTarget.texture;
  compositeMaterial.uniforms.tBloom.value = bloomTargetA.texture;
  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(postScene, postCamera);
}

resizeRenderTargets();

/* ---------------- interaction state ---------------- */

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2(0, 0);
const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const planeHit = new THREE.Vector3();
const localTip = new THREE.Vector3();

const pointer = {
  clientX: window.innerWidth * 0.68,
  clientY: window.innerHeight * 0.49,
  smoothX: 0,
  smoothY: 0,
  targetX: 0,
  targetY: 0,
  active: false,
  lastMove: 0
};

const state = {
  cameraActive: false,
  cameraMode: false,
  handPresent: false,
  handOpenness: 0,
  handState: "none",
  lastHandAt: 0,
  autoMode: true,
  manualOpen: 0.86,
  bloomTarget: 0.02,
  currentOpen: 0,
  bloomStartedAt: 0,
  ready: false,
  pageVisible: !document.hidden
};

const TIP_COUNT = 5;
const tipLocal = Array.from({ length: TIP_COUNT }, () => new THREE.Vector3(0, 0.5, 0));
const tipStrengthTarget = new Float32Array(TIP_COUNT);
const tipStrengthSmooth = new Float32Array(TIP_COUNT);
const handTipScreen = Array.from({ length: TIP_COUNT }, () => ({ x: 0.5, y: 0.5 }));

/* ---------------- hand tracking ---------------- */

let toastTimer = 0;

function showToast(message, duration = 4600) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), duration);
}

function setSystem(text, mode = "idle") {
  systemText.textContent = text;
  systemState.classList.toggle("is-active", mode === "active");
  systemState.classList.toggle("is-error", mode === "error");
}

function setCameraButton({ main, sub, busy = false, disabled = false }) {
  if (main) cameraBtnText.textContent = main;
  if (sub) cameraBtnSub.textContent = sub;
  cameraBtn.classList.toggle("is-busy", busy);
  cameraBtn.disabled = disabled;
}

function setLiveGesture(en, zh) {
  if (liveGestureEn.textContent !== en) liveGestureEn.textContent = en;
  if (liveGestureZh.textContent !== zh) liveGestureZh.textContent = zh;
}

function setCameraMode(active) {
  if (state.cameraMode === active) return;
  state.cameraMode = active;
  document.body.classList.toggle("is-camera-mode", active);
  liveHud.setAttribute("aria-hidden", active ? "false" : "true");
  if (heroSection) {
    if ("inert" in heroSection) heroSection.inert = active;
  }
  if (active) closeGuide();
  positionFlower();
  // Mobile hides the preview until camera mode. Let the canvas re-measure
  // itself after the layout has switched.
  requestAnimationFrame(() => handTracker?.resizePreview());
}

const handTracker = new HandTracker({
  video: cameraVideo,
  canvas: handCanvas,
  onStatus: ({ status, detail }) => {
    switch (status) {
      case "requesting":
        setCameraMode(true);
        setSystem("REQUESTING ACCESS", "idle");
        camState.textContent = "CAMERA PERMISSION";
        setCameraButton({ main: "请求权限", sub: "REQUESTING ACCESS", busy: true });
        camFrame.classList.remove("is-live");
        setLiveGesture("CONNECTING", "正在连接");
        break;
      case "loading":
        setCameraMode(true);
        setSystem("LOADING VISION", "idle");
        camFrame.classList.add("is-live");
        camState.textContent = "LOADING HAND MODEL";
        setCameraButton({ main: "载入手部模型", sub: "INITIALISING AI", busy: true });
        setLiveGesture("LOADING HAND MODEL", "载入识别模型");
        break;
      case "searching":
        setCameraMode(true);
        state.cameraActive = true;
        state.autoMode = false;
        camFrame.classList.add("is-live");
        setSystem("CAMERA ACTIVE", "active");
        camState.textContent = "SEARCHING FOR HAND";
        setCameraButton({ main: "关闭手势", sub: "DISABLE CAMERA", busy: false });
        interactionText.textContent = "将手放入画面 · 花瓣等待触碰";
        gestureLabel.textContent = "SEARCHING / 寻找手";
        setLiveGesture("SHOW YOUR HAND", "将手放入画面");
        break;
      case "tracking":
        setCameraMode(true);
        state.cameraActive = true;
        camFrame.classList.add("is-live");
        setSystem("HAND DETECTED", "active");
        camState.textContent = "HAND DETECTED";
        setCameraButton({ main: "关闭手势", sub: "DISABLE CAMERA", busy: false });
        interactionText.textContent = "移动指尖 · 触碰花瓣";
        setLiveGesture("HAND DETECTED", "正在读取手势");
        break;
      case "error": {
        state.cameraActive = false;
        state.handPresent = false;
        setCameraMode(false);
        camFrame.classList.remove("is-live");
        setSystem("CAMERA UNAVAILABLE", "error");
        camState.textContent = "CAMERA ERROR";
        setCameraButton({ main: "开启手势", sub: "ENABLE CAMERA", busy: false });
        interactionText.textContent = "移动指针 · 点击花朵";
        gestureLabel.textContent = "POINTER MODE";
        if (detail) showToast(detail);
        break;
      }
      case "idle":
        state.cameraActive = false;
        state.handPresent = false;
        state.autoMode = true;
        setCameraMode(false);
        camFrame.classList.remove("is-live");
        setSystem("SYSTEM READY", "idle");
        camState.textContent = "CAMERA STANDBY";
        setCameraButton({ main: "开启手势", sub: "ENABLE CAMERA", busy: false });
        interactionText.textContent = "移动指针 · 点击花朵";
        gestureLabel.textContent = "AWAITING HAND";
        setLiveGesture("SHOW YOUR HAND", "将手放入画面");
        break;
      default:
        break;
    }
  },
  onFrame: (frame) => {
    if (frame.reset) {
      state.handPresent = false;
      state.handOpenness = 0;
      state.lastHandAt = 0;
      return;
    }

    state.handPresent = frame.present;
    if (frame.present) {
      state.lastHandAt = performance.now();
      state.handOpenness = frame.openness;
      state.handState = frame.handState;

      for (let i = 0; i < TIP_COUNT; i++) {
        handTipScreen[i].x = frame.tips[i].x;
        handTipScreen[i].y = frame.tips[i].y;
      }

      if (frame.handState === "fist") {
        gestureLabel.textContent = "FIST / 握拳";
        setLiveGesture("FIST / CLOSED", "握拳 · 收拢");
      } else if (frame.handState === "open") {
        gestureLabel.textContent = "OPEN PALM / 张开";
        setLiveGesture("OPEN PALM / BLOOM", "张开 · 绽放");
      } else {
        gestureLabel.textContent = "GESTURE / 手势";
        setLiveGesture("GESTURE IN MOTION", "手势中");
      }
    } else {
      state.handState = "none";
      gestureLabel.textContent = "SEARCHING / 寻找手";
      setLiveGesture("SHOW YOUR HAND", "将手放入画面");
    }
  },
  onError: (error) => {
    let message = "摄像头启动失败，请稍后重试。";
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      message = "摄像头权限被拒绝。你仍然可以用指针点击花朵，或稍后在浏览器设置中允许访问。";
    } else if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
      message = "未找到可用的摄像头，请连接设备后重试。";
    } else if (error?.name === "NotReadableError") {
      message = "摄像头正被其他应用占用，请关闭其他视频软件后重试。";
    } else if (error?.message) {
      message = error.message;
    }
    showToast(message, 6200);
  }
});

/* ---------------- camera controls ---------------- */

let cameraStarting = false;

async function startCamera() {
  if (cameraStarting || state.cameraActive) return;
  cameraStarting = true;
  setCameraButton({ main: "正在开启", sub: "REQUESTING ACCESS", busy: true });
  try {
    await handTracker.start();
  } finally {
    cameraStarting = false;
    if (!state.cameraActive && !handTracker.error) {
      setCameraButton({ main: "开启手势", sub: "ENABLE CAMERA", busy: false });
    }
  }
}

async function stopCamera() {
  await handTracker.stop();
  state.cameraActive = false;
  state.handPresent = false;
  state.autoMode = true;
  setSystem("SYSTEM READY", "idle");
  setCameraButton({ main: "开启手势", sub: "ENABLE CAMERA", busy: false });
  camState.textContent = "CAMERA STANDBY";
  interactionText.textContent = "移动指针 · 点击花朵";
  gestureLabel.textContent = "AWAITING HAND";
}

cameraBtn.addEventListener("click", () => {
  if (state.cameraActive) {
    stopCamera();
  } else {
    startCamera();
  }
});

exitCameraBtn.addEventListener("click", () => {
  stopCamera();
});

/* ---------------- guide modal ---------------- */

function openGuide() {
  guideModal.classList.add("is-open");
  guideModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeGuide() {
  guideModal.classList.remove("is-open");
  guideModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

guideBtn.addEventListener("click", openGuide);
guideEnableBtn.addEventListener("click", () => {
  closeGuide();
  startCamera();
});
guideModal.querySelectorAll("[data-close-guide]").forEach((element) => {
  element.addEventListener("click", closeGuide);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && guideModal.classList.contains("is-open")) {
    closeGuide();
    return;
  }

  if (event.key === "Escape" && state.cameraMode) {
    stopCamera();
    return;
  }

  if (guideModal.classList.contains("is-open")) return;

  if (event.code === "Space") {
    event.preventDefault();
    if (!state.cameraActive) {
      state.autoMode = false;
      state.manualOpen = state.currentOpen > 0.45 ? 0.03 : 0.93;
    }
  }

  if (event.key.toLowerCase() === "c") {
    if (state.cameraActive) stopCamera();
    else startCamera();
  }
});

/* ---------------- pointer ---------------- */

function updatePointerPosition(clientX, clientY) {
  pointer.clientX = clientX;
  pointer.clientY = clientY;
  pointer.targetX = (clientX / window.innerWidth) * 2 - 1;
  pointer.targetY = -((clientY / window.innerHeight) * 2 - 1);
  pointer.lastMove = performance.now();
  pointer.active = true;

  cursorHalo.style.transform = `translate(${clientX}px, ${clientY}px)`;
  cursorHalo.classList.add("is-visible");
}

window.addEventListener("pointermove", (event) => {
  updatePointerPosition(event.clientX, event.clientY);
}, { passive: true });

window.addEventListener("pointerdown", (event) => {
  updatePointerPosition(event.clientX, event.clientY);
  const target = event.target;
  if (target.closest("button, a, .guide-card")) return;
  if (state.cameraActive) return;

  state.autoMode = false;
  state.manualOpen = state.currentOpen > 0.45 ? 0.025 : 0.96;
  pointer.lastMove = performance.now();
}, { passive: true });

window.addEventListener("pointerleave", () => {
  pointer.active = false;
  cursorHalo.classList.remove("is-visible");
});

document.addEventListener("visibilitychange", () => {
  state.pageVisible = !document.hidden;
});

/* ---------------- layout ---------------- */

const layout = {
  screenX: 0.66,
  screenY: 0.535,
  scale: 1
};

function positionFlower() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const mobile = width < 760;
  const aspect = width / height;

  const focused = state.cameraMode;
  layout.screenX = focused ? 0.505 : (mobile ? 0.5 : 0.66);
  layout.screenY = focused ? (mobile ? 0.49 : 0.49) : (mobile ? 0.635 : 0.55);

  let scale;
  if (mobile) {
    scale = Math.max(0.52, Math.min(0.74, width / 500));
  } else {
    scale = Math.max(0.78, Math.min(1.32, Math.min(width / 1150, height / 720)));
  }
  if (focused) scale *= mobile ? 0.88 : 1.08;
  layout.scale = scale;

  camera.aspect = aspect;
  camera.fov = mobile ? 48 : 46;
  camera.updateProjectionMatrix();

  // Move the camera target with the viewport so the composition stays balanced.
  cameraBase.set(mobile ? 0.2 : 0.42, mobile ? 4.1 : 3.8, mobile ? 9.2 : 8.8);
  cameraTarget.set(mobile ? 0.18 : 0.38, mobile ? 0.88 : 0.72, 0);
  camera.position.copy(cameraBase);
  camera.lookAt(cameraTarget);
  camera.updateMatrixWorld();

  const ndc = new THREE.Vector2(layout.screenX * 2 - 1, -(layout.screenY * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(interactionPlane, planeHit)) {
    flower.setLayout({ x: planeHit.x, y: planeHit.y, scale });
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = getRenderPixelRatio();

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  flower.setPixelRatio(pixelRatio);
  scenery.setPixelRatio(pixelRatio);
  positionFlower();
  resizeRenderTargets();
}

window.addEventListener("resize", resize, { passive: true });
resize();

/* ---------------- coordinate mapping ---------------- */

function screenToLocal(normalizedX, normalizedY, target) {
  const ndc = new THREE.Vector2(normalizedX * 2 - 1, -(normalizedY * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(interactionPlane, planeHit)) return null;
  flower.group.updateMatrixWorld();
  target.copy(planeHit);
  flower.group.worldToLocal(target);
  return target;
}

/* ---------------- main loop ---------------- */

const clock = new THREE.Clock();
let elapsed = 0;
let lastPointerOffset = { x: 0, y: 0 };
const cameraDrift = new THREE.Vector3();
const cameraLook = new THREE.Vector3();

function updateCamera(dt, time, pointerOffset) {
  const focused = state.cameraMode;
  const amplitude = focused ? 1.2 : 1.0;
  cameraDrift.set(
    Math.sin(time * 0.13) * 0.24 * amplitude + pointerOffset.x * 0.2,
    Math.cos(time * 0.17) * 0.075 * amplitude + pointerOffset.y * 0.1,
    Math.cos(time * 0.105) * 0.13 * amplitude
  );
  const targetX = cameraBase.x + cameraDrift.x;
  const targetY = cameraBase.y + cameraDrift.y;
  const targetZ = cameraBase.z + cameraDrift.z;
  const ease = 1 - Math.exp(-dt * 1.2);

  camera.position.x += (targetX - camera.position.x) * ease;
  camera.position.y += (targetY - camera.position.y) * ease;
  camera.position.z += (targetZ - camera.position.z) * ease;

  cameraLook.copy(cameraTarget);
  cameraLook.x += pointerOffset.x * 0.14;
  cameraLook.y += pointerOffset.y * 0.08;
  camera.lookAt(cameraLook);
  camera.updateMatrixWorld();
}

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function updateTargetOpenness(now, time, dt) {
  if (state.cameraActive) {
    const handFresh = state.handPresent && now - state.lastHandAt < 360;
    if (handFresh) {
      state.bloomTarget = 0.025 + 0.95 * Math.pow(state.handOpenness, 0.92);
      return;
    }
    const rest = 0.42 + Math.sin(time * 0.42) * 0.12;
    state.bloomTarget = damp(state.bloomTarget, rest, 1.1, dt);
    return;
  }

  if (state.autoMode) {
    const fromReady = state.bloomStartedAt ? (now - state.bloomStartedAt) / 1000 : 0;
    if (fromReady < 0.75) {
      state.bloomTarget = 0.03;
    } else {
      const breathe = Math.sin(time * 0.43 + 0.5) * 0.11;
      state.bloomTarget = 0.81 + breathe;
    }
  } else {
    state.bloomTarget = state.manualOpen;
  }
}

function updateInteraction(now, dt) {
  const handFresh = state.cameraActive && state.handPresent && now - state.lastHandAt < 360;
  const pointerFresh = !state.cameraActive && pointer.active && now - pointer.lastMove < 9000;

  for (let i = 0; i < TIP_COUNT; i++) {
    tipStrengthTarget[i] = 0;
  }

  if (handFresh) {
    for (let i = 0; i < TIP_COUNT; i++) {
      const mapped = screenToLocal(handTipScreen[i].x, handTipScreen[i].y, localTip);
      if (mapped) {
        tipLocal[i].copy(mapped);
        tipStrengthTarget[i] = 0.72 + state.handOpenness * 0.18;
      }
      const world = flower.group.localToWorld(tipLocal[i].clone());
      tipGlows[i].userData.target.copy(world);
    }
  } else if (pointerFresh) {
    pointer.smoothX = damp(pointer.smoothX, pointer.targetX, 5.5, dt);
    pointer.smoothY = damp(pointer.smoothY, pointer.targetY, 5.5, dt);
    const normalizedX = (pointer.smoothX + 1) / 2;
    const normalizedY = (1 - pointer.smoothY) / 2;
    const mapped = screenToLocal(normalizedX, normalizedY, localTip);
    if (mapped) {
      tipLocal[0].copy(mapped);
      tipStrengthTarget[0] = 0.78;
      const world = flower.group.localToWorld(tipLocal[0].clone());
      tipGlows[0].userData.target.copy(world);
      tipGlows[0].userData.strength = 0.9;
    }
  } else {
    pointer.smoothX = damp(pointer.smoothX, pointer.targetX, 2.0, dt);
    pointer.smoothY = damp(pointer.smoothY, pointer.targetY, 2.0, dt);
  }

  for (let i = 0; i < TIP_COUNT; i++) {
    tipStrengthSmooth[i] = damp(tipStrengthSmooth[i], tipStrengthTarget[i], 5.5, dt);
    tipGlows[i].userData.strength = damp(tipGlows[i].userData.strength, tipStrengthTarget[i], 4.0, dt);

    const glow = tipGlows[i];
    if (!glow.userData.smooth.lengthSq()) glow.userData.smooth.copy(glow.userData.target);
    glow.userData.smooth.lerp(glow.userData.target, 1 - Math.exp(-dt * 10));

    if (handFresh) {
      glow.position.copy(glow.userData.smooth);
    } else if (pointerFresh && i === 0) {
      glow.position.copy(glow.userData.smooth);
    }

    const strength = glow.userData.strength;
    glow.visible = strength > 0.015;
    const pulse = 0.9 + Math.sin(elapsed * 3.2 + i * 1.7) * 0.1;
    glow.material.opacity = Math.min(0.68, strength * 0.58) * pulse;
    glow.scale.setScalar((0.11 + strength * 0.07) * pulse);
  }

  const palmX = handTipScreen.reduce((sum, tip) => sum + tip.x, 0) / TIP_COUNT;
  const palmY = handTipScreen.reduce((sum, tip) => sum + tip.y, 0) / TIP_COUNT;
  const targetPointerX = handFresh ? (palmX - 0.5) * 1.3 : pointer.smoothX * 0.45;
  const targetPointerY = handFresh ? -(palmY - 0.5) * 0.95 : pointer.smoothY * 0.35;

  // Push the five live fingertips into the flower's petal shaders.
  flower.setTips(tipLocal, tipStrengthSmooth);

  return { x: targetPointerX, y: targetPointerY };
}

function updateUI(now) {
  const percent = Math.round(flower.openValue * 100);
  if (bloomValue.textContent !== String(percent).padStart(2, "0")) {
    bloomValue.textContent = String(percent).padStart(2, "0");
    bloomFill.style.width = `${percent}%`;
    bloomSpark.style.left = `${percent}%`;
  }

  if (state.cameraActive) {
    if (state.handPresent && now - state.lastHandAt < 360) {
      if (gestureLabel.textContent !== "FIST / 握拳" && state.handState === "fist") {
        gestureLabel.textContent = "FIST / 握拳";
      }
    }
  } else if (!state.handPresent && gestureLabel.textContent === "SEARCHING / 寻找手") {
    gestureLabel.textContent = "AWAITING HAND";
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (!state.pageVisible) {
    clock.getDelta();
    return;
  }

  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  const now = performance.now();

  updateTargetOpenness(now, elapsed, dt);
  updateCamera(dt, elapsed, lastPointerOffset);

  const pointerOffset = updateInteraction(now, dt);
  lastPointerOffset = pointerOffset;

  // A slightly springy response: opening arrives like a breath, closing is quicker.
  const current = flower.openValue;
  const target = state.bloomTarget;
  const response = target > current ? 1 : 2.2;
  const openness = damp(current, target, 7.2 * response, dt);

  state.currentOpen = flower.openValue;
  flower.update(dt, elapsed, openness, pointerOffset);
  state.currentOpen = flower.openValue;

  scenery.update(dt, elapsed, flower.group.position, flower.group.scale.x, pointerOffset);

  backgroundMaterial.uniforms.uTime.value = elapsed;
  backgroundMaterial.uniforms.uOpen.value = flower.openValue;
  backgroundMaterial.uniforms.uAura.value.set(layout.screenX, 1 - layout.screenY);

  updateUI(now);
  renderPost();
}

/* ---------------- intro ---------------- */

let loaderProgress = 0;
const loaderTimers = [];

function setLoaderProgress(value, label) {
  loaderProgress = Math.max(loaderProgress, value);
  loaderBar.style.width = `${loaderProgress}%`;
  if (label) loaderStatus.textContent = label;
}

function schedule(callback, delay) {
  loaderTimers.push(setTimeout(callback, delay));
}

function beginExperience() {
  state.ready = true;
  state.bloomStartedAt = performance.now();
  document.body.classList.remove("is-loading");
  document.body.classList.add("is-ready");
  loader.classList.add("is-hidden");
  setTimeout(() => {
    loader.setAttribute("aria-hidden", "true");
  }, 1300);
}

function initIntro() {
  document.body.classList.add("is-loading");
  schedule(() => setLoaderProgress(24, "正在唤醒花朵"), 160);
  schedule(() => setLoaderProgress(56, "正在编织微光花瓣"), 520);
  schedule(() => setLoaderProgress(82, "正在校准指尖"), 900);
  schedule(() => setLoaderProgress(100, "花园已就绪"), 1240);
  schedule(beginExperience, 1580);
}

initIntro();
animate();

/* ---------------- debug hooks ---------------- */

window.__ANTHOS__ = {
  flower,
  scenery,
  camera,
  scene,
  backgroundMaterial,
  renderer,
  state,
  setOpenness(value) {
    state.autoMode = false;
    state.manualOpen = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
  },
  toggleCamera() {
    if (state.cameraActive) stopCamera();
    else startCamera();
  },
  showToast
};

/* graceful context loss */
renderer.domElement.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  showToast("图形上下文暂时丢失，正在尝试恢复…", 5000);
});

renderer.domElement.addEventListener("webglcontextrestored", () => {
  showToast("画面已恢复。", 2500);
});

window.addEventListener("pagehide", () => {
  if (handTracker.running) handTracker.stop();
  loaderTimers.forEach(clearTimeout);
});
