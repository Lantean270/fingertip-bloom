import * as THREE from "three";

/* =========================================================
   ANTHOS — procedural particle flower
   All petal geometry, colours and motion are generated here.
   ========================================================= */

const TAU = Math.PI * 2;

const PETAL_LAYERS = [
  {
    id: 0,
    petals: 9,
    perPetal: 2050,
    phase: 0.11,
    width: 1.16,
    delay: 0.0,
    closed: [
      [0.035, 0.0],
      [0.26, 0.63],
      [0.34, 1.46],
      [0.035, 2.38]
    ],
    open: [
      [0.13, 0.025],
      [0.84, 0.4],
      [1.98, 0.84],
      [3.06, 0.43]
    ]
  },
  {
    id: 1,
    petals: 7,
    perPetal: 1450,
    phase: 0.53,
    width: 0.98,
    delay: 0.055,
    closed: [
      [0.022, 0.015],
      [0.2, 0.56],
      [0.27, 1.21],
      [0.018, 1.97]
    ],
    open: [
      [0.1, 0.05],
      [0.61, 0.58],
      [1.49, 1.02],
      [2.2, 0.86]
    ]
  },
  {
    id: 2,
    petals: 5,
    perPetal: 980,
    phase: 0.84,
    width: 0.68,
    delay: 0.11,
    closed: [
      [0.012, 0.01],
      [0.135, 0.42],
      [0.18, 0.95],
      [0.008, 1.61]
    ],
    open: [
      [0.075, 0.08],
      [0.41, 0.72],
      [1.04, 1.15],
      [1.56, 1.19]
    ]
  }
];

const petalVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform float uPixelRatio;
  uniform float uPointSize;
  uniform float uOpacity;
  uniform vec3 uTips[5];
  uniform float uTipStrength[5];

  attribute vec3 aOpen;
  attribute vec3 aNormalClosed;
  attribute vec3 aNormalOpen;
  attribute vec2 aUv;
  attribute float aSeed;
  attribute float aTint;
  attribute float aEdge;
  attribute float aLayer;
  attribute float aDelay;
  attribute float aSize;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vEnergy;
  varying float vDiffuse;
  varying float vRim;
  varying float vDepthShade;

  #define TAU 6.28318530718

  void main() {
    float stagger = clamp((uOpen - aDelay * 0.7) / (1.0 - aDelay * 0.7), 0.0, 1.0);
    float open = smoothstep(0.0, 1.0, stagger);
    open = pow(open, 0.92);

    vec3 pos = mix(position, aOpen, open);

    float tipLift = smoothstep(0.15, 1.0, aUv.x);
    float breathe = sin(uTime * 0.66 + aSeed * TAU + aUv.x * 2.2);
    pos.y += breathe * (0.012 + open * 0.034) * tipLift;
    pos.x += sin(uTime * 0.38 + aSeed * 9.1) * 0.008;
    pos.z += cos(uTime * 0.41 + aSeed * 7.7) * 0.008;

    vec2 radial = normalize(pos.xz + vec2(0.0001));
    float pulse = sin(uTime * 1.05 + aUv.x * 5.4 + aSeed * TAU);
    pos.xz += radial * pulse * (0.004 + open * 0.012) * tipLift;

    float energy = 0.0;

    for (int i = 0; i < 5; i++) {
      float strength = uTipStrength[i];
      if (strength > 0.001) {
        vec3 delta = pos - uTips[i];
        float dist = length(delta);
        float influence = (1.0 - smoothstep(0.0, 0.92, dist)) * strength;
        vec3 dir = normalize(delta + vec3(0.0001, 0.0001, 0.0001));
        pos += dir * influence * 0.25;
        pos.y += influence * 0.055;
        pos.x += -dir.z * influence * 0.055;
        pos.z += dir.x * influence * 0.055;
        energy += influence;
      }
    }

    float edge = aEdge;
    float layer = aLayer;

    vec3 localNormal = normalize(mix(aNormalClosed, aNormalOpen, open));
    vec3 worldNormal = normalize(mat3(modelMatrix) * localNormal);
    vec3 worldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    vec3 viewDirection = normalize(cameraPosition - worldPosition);
    if (dot(worldNormal, viewDirection) < 0.0) worldNormal = -worldNormal;

    vec3 keyLight = normalize(vec3(-0.52, 0.88, 0.64));
    float diffuse = clamp(dot(worldNormal, keyLight), 0.0, 1.0);
    float rim = pow(1.0 - clamp(dot(worldNormal, viewDirection), 0.0, 1.0), 2.0);
    float depthShade = clamp(0.72 + pos.z * 0.1 + pos.y * 0.035, 0.46, 1.08);

    vDiffuse = diffuse;
    vRim = rim;
    vDepthShade = depthShade;

    // Lift the glowing points just above the depth-writing silk membrane.
    pos += localNormal * 0.045;

    vec3 cDeep = vec3(0.16, 0.004, 0.034);
    vec3 cRose = vec3(0.94, 0.034, 0.12);
    vec3 cCoral = vec3(1.0, 0.17, 0.075);
    vec3 cPeach = vec3(1.0, 0.47, 0.21);
    vec3 cIvory = vec3(1.0, 0.79, 0.53);

    float g1 = smoothstep(0.015, 0.52, aUv.x);
    float g2 = smoothstep(0.4, 0.87, aUv.x);
    float tip = smoothstep(0.72, 1.0, aUv.x);

    vec3 col = mix(cDeep, cRose, g1);
    col = mix(col, cCoral, g2 * 0.7);
    col = mix(col, mix(cPeach, cIvory, 0.32), tip * 0.55);
    col = mix(col, cIvory, edge * (0.12 + 0.12 * aTint));
    col = mix(col, cPeach * 1.13, (1.0 - layer) * 0.055);
    col *= 0.87 + aTint * 0.26;
    col = mix(col * 0.46, col, smoothstep(0.0, 0.66, open));

    energy = clamp(energy, 0.0, 1.4);

    float lighting = (0.63 + diffuse * 0.5 + rim * 0.3) * depthShade;
    col *= lighting;
    col += vec3(1.0, 0.52, 0.29) * rim * 0.16;

    vColor = col;
    vAlpha = (0.35 + edge * 0.27 + energy * 0.25) * uOpacity * mix(0.34, 1.0, smoothstep(0.0, 0.78, open));
    vAlpha *= 0.82 + diffuse * 0.28 + rim * 0.14;
    vEnergy = energy + edge * 0.06;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float perspective = 1.0 / max(0.75, -mvPosition.z);
    gl_PointSize = clamp(
      aSize * uPointSize * uPixelRatio * perspective * (0.76 + open * 0.24) * (1.0 + edge * 0.18 + energy * 0.8),
      0.8,
      18.0
    );
  }
`;

const petalFragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vEnergy;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;

    float soft = smoothstep(1.0, 0.0, d);
    float core = pow(max(0.0, 1.0 - d), 5.2);
    float halo = pow(max(0.0, 1.0 - d), 1.55);

    vec3 color = vColor;
    color += vec3(1.0, 0.52, 0.28) * vEnergy * (0.18 + core * 0.4);
    color = mix(color, vec3(1.0, 0.81, 0.58), core * 0.11);

    float alpha = (core * 0.94 + halo * 0.5 + soft * 0.14) * vAlpha;
    if (alpha < 0.002) discard;

    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

const membraneVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform vec3 uTips[5];
  uniform float uTipStrength[5];

  attribute vec3 aOpen;
  attribute vec3 aNormalClosed;
  attribute vec3 aNormalOpen;
  attribute vec2 aUv;
  attribute float aSeed;
  attribute float aLayer;
  attribute float aDelay;

  varying vec2 vUv;
  varying float vOpen;
  varying float vEnergy;
  varying float vLayer;
  varying float vDiffuse;
  varying float vRim;
  varying float vDepthShade;

  #define TAU 6.28318530718

  void main() {
    float stagger = clamp((uOpen - aDelay * 0.7) / (1.0 - aDelay * 0.7), 0.0, 1.0);
    float open = smoothstep(0.0, 1.0, stagger);
    vec3 pos = mix(position, aOpen, open);

    float lift = smoothstep(0.15, 1.0, aUv.x);
    pos.y += sin(uTime * 0.66 + aSeed * TAU + aUv.x * 2.2) * (0.012 + open * 0.03) * lift;

    float energy = 0.0;
    for (int i = 0; i < 5; i++) {
      float strength = uTipStrength[i];
      if (strength > 0.001) {
        vec3 delta = pos - uTips[i];
        float dist = length(delta);
        float influence = (1.0 - smoothstep(0.0, 0.92, dist)) * strength;
        vec3 dir = normalize(delta + vec3(0.0001));
        pos += dir * influence * 0.25;
        energy += influence;
      }
    }

    vec3 localNormal = normalize(mix(aNormalClosed, aNormalOpen, open));
    vec3 worldNormal = normalize(mat3(modelMatrix) * localNormal);
    vec3 worldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    vec3 viewDirection = normalize(cameraPosition - worldPosition);
    if (dot(worldNormal, viewDirection) < 0.0) worldNormal = -worldNormal;

    vec3 keyLight = normalize(vec3(-0.52, 0.88, 0.64));
    vDiffuse = clamp(dot(worldNormal, keyLight), 0.0, 1.0);
    vRim = pow(1.0 - clamp(dot(worldNormal, viewDirection), 0.0, 1.0), 2.0);
    vDepthShade = clamp(0.72 + pos.z * 0.1 + pos.y * 0.035, 0.46, 1.08);

    vUv = aUv;
    vOpen = open;
    vEnergy = energy;
    vLayer = aLayer;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const membraneFragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vOpen;
  varying float vEnergy;
  varying float vLayer;
  varying float vDiffuse;
  varying float vRim;
  varying float vDepthShade;

  void main() {
    float edge = smoothstep(0.58, 0.98, abs(vUv.y));
    float tip = smoothstep(0.42, 1.0, vUv.x);
    float vein = pow(abs(sin(vUv.x * 30.0 + vUv.y * 12.0)), 22.0);

    vec3 base = mix(vec3(0.42, 0.012, 0.13), vec3(1.0, 0.11, 0.18), tip);
    base = mix(base, vec3(1.0, 0.38, 0.15), pow(tip, 2.1) * 0.68);
    base = mix(base, vec3(1.0, 0.75, 0.46), edge * 0.26);

    float sheen = pow(max(0.0, sin(vUv.x * 13.0 - vUv.y * 4.0 + 1.2)), 6.0);
    float alpha = (0.16 + tip * 0.175 + edge * 0.035 + vein * 0.014 + sheen * 0.026) * uOpacity;
    alpha *= mix(0.45, 1.0, vOpen);
    alpha += vEnergy * 0.012;
    alpha *= 0.92 + vLayer * 0.18;

    float lighting = (0.58 + vDiffuse * 0.58 + vRim * 0.24) * vDepthShade;
    base *= lighting;
    base += vec3(1.0, 0.52, 0.3) * vRim * 0.08;
    alpha *= 0.8 + vDiffuse * 0.32;

    gl_FragColor = vec4(base * (0.82 + edge * 0.2), alpha);
    #include <colorspace_fragment>
  }
`;

const stamenVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform float uPixelRatio;
  uniform float uPointSize;
  uniform float uOpacity;

  attribute float aSeed;
  attribute float aSize;
  attribute float aFilament;

  varying vec3 vColor;
  varying float vAlpha;

  #define TAU 6.28318530718

  void main() {
    float open = smoothstep(0.02, 0.7, uOpen);
    vec3 pos = position;

    float sway = sin(uTime * 1.35 + aSeed * TAU);
    pos.y += sway * (0.006 + open * 0.014) * (1.0 + aFilament * 1.4);
    pos.x += cos(uTime * 0.94 + aSeed * 8.2) * 0.006 * (0.5 + aFilament);
    pos.z += sin(uTime * 0.87 + aSeed * 7.1) * 0.006 * (0.5 + aFilament);
    pos.y += open * aFilament * 0.16;

    float twinkle = 0.72 + 0.28 * sin(uTime * 2.2 + aSeed * TAU * 2.0);
    vec3 gold = vec3(1.0, 0.58, 0.18);
    vec3 cream = vec3(1.0, 0.94, 0.72);
    vColor = mix(gold, cream, clamp(aSeed * 1.4, 0.0, 1.0));

    vAlpha = mix(0.23, 0.9, open) * twinkle * uOpacity;
    vAlpha *= mix(0.36, 1.0, open) * mix(0.7, 1.0, aFilament);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(
      aSize * uPointSize * uPixelRatio / max(0.75, -mvPosition.z) * (0.85 + twinkle * 0.35),
      0.8,
      14.0
    );
  }
`;

const stamenFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;
    float core = pow(max(0.0, 1.0 - d), 4.0);
    float halo = pow(max(0.0, 1.0 - d), 1.4);
    vec3 col = mix(vColor, vec3(1.0, 0.98, 0.9), core * 0.4);
    float alpha = (core * 0.92 + halo * 0.26) * vAlpha;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

const dustVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uPointSize;
  uniform float uOpen;

  attribute float aSeed;
  attribute float aSize;
  attribute float aDepth;
  attribute float aTint;

  varying vec3 vColor;
  varying float vAlpha;

  #define TAU 6.28318530718

  void main() {
    vec3 pos = position;
    float drift = uTime * (0.035 + aSeed * 0.035);
    pos.x += sin(drift + aSeed * TAU) * (0.18 + aDepth * 0.36);
    pos.y += cos(drift * 0.8 + aSeed * 7.7) * (0.1 + aDepth * 0.24);
    pos.z += sin(drift * 0.65 + aSeed * 4.2) * 0.24;

    float flicker = 0.58 + 0.42 * sin(uTime * (0.5 + aSeed * 0.9) + aSeed * TAU * 3.0);
    vec3 warm = vec3(1.0, 0.67, 0.48);
    vec3 cool = vec3(0.62, 0.7, 1.0);
    vColor = mix(warm, cool, aTint * 0.58);
    vAlpha = (0.08 + aSize * 0.035) * flicker * (0.75 + uOpen * 0.35);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(
      aSize * uPointSize * uPixelRatio / max(1.0, -mvPosition.z) * (0.85 + flicker * 0.35),
      0.8,
      12.0
    );
  }
`;

const dustFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;
    float core = pow(max(0.0, 1.0 - d), 4.5);
    float halo = pow(max(0.0, 1.0 - d), 1.35);
    float alpha = (core * 0.72 + halo * 0.22) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`;

/* ---------------- geometry helpers ---------------- */

function cubic(p0, p1, p2, p3, t) {
  const it = 1 - t;
  const a = it * it * it;
  const b = 3 * it * it * t;
  const c = 3 * it * t * t;
  const d = t * t * t;
  return [
    p0[0] * a + p1[0] * b + p2[0] * c + p3[0] * d,
    p0[1] * a + p1[1] * b + p2[1] * c + p3[1] * d
  ];
}

function petalHalfWidth(u, width, seed) {
  const profile = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.63)), 0.74) * (0.34 + 0.66 * u);
  const ruffle = 1 + 0.085 * Math.sin(u * 9.2 + seed * 17.1);
  return Math.max(0.0004, width * profile * ruffle);
}

function hash01(n) {
  const value = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createPetalVariation(layer, petalIndex) {
  const seed = hash01(layer.id * 3.17 + petalIndex * 1.91 + 0.4);
  const liftSeed = hash01(layer.id * 7.31 + petalIndex * 4.27 + 2.1);
  const lengthSeed = hash01(layer.id * 5.11 + petalIndex * 2.83 + 8.8);
  const tiltSeed = hash01(layer.id * 9.73 + petalIndex * 6.19 + 3.3);
  const depthWeight = layer.id === 0 ? 1 : layer.id === 1 ? 0.68 : 0.4;

  return {
    seed,
    scale: 0.9 + lengthSeed * 0.2,
    lift: (liftSeed - 0.48) * 1.25 * depthWeight,
    angleJitter: (tiltSeed - 0.5) * 0.16,
    curl: (seed - 0.5) * 0.3
  };
}

function makePetalPoint(layer, angle, u, v, variation, openState) {
  const curve = openState ? layer.open : layer.closed;
  const scale = variation.scale;
  const p0 = [curve[0][0] * scale, curve[0][1] * scale];
  const p1 = [curve[1][0] * scale, curve[1][1] * scale];
  const p2 = [curve[2][0] * scale, curve[2][1] * scale];
  const p3 = [curve[3][0] * scale, curve[3][1] * scale];
  const center = cubic(p0, p1, p2, p3, u);

  const half = petalHalfWidth(u, layer.width * scale, variation.seed);
  const cup = (openState ? 1 : 0) * (0.12 * v * v + 0.04 * Math.sin(u * 7.0 + variation.seed * 8.0) * v);
  const closedCup = (openState ? 0 : 1) * (-0.03 * v * v + 0.018 * Math.sin(u * 5.0 + variation.seed * 11.0));

  let radial = center[0] + closedCup + 0.025 * Math.sin(u * 12.0 + variation.seed * 23.0) * (0.3 + u);
  let y = center[1] + cup + 0.014 * Math.sin(u * 15.0 + variation.seed * 4.0);

  if (openState) {
    // Each petal leaves the cup at a slightly different height. This gives the
    // bloom real over/under layering instead of a flat fan.
    y += variation.lift * u * u;
    radial += variation.curl * 0.12 * u * u * (0.3 + Math.abs(v));
    y += variation.curl * 0.06 * u * (v * v - 0.35);
  }

  const side = v * half;

  return [
    Math.cos(angle) * radial - Math.sin(angle) * side,
    y,
    Math.sin(angle) * radial + Math.cos(angle) * side
  ];
}

function makePetalNormal(layer, angle, u, v, variation, openState) {
  const uu = Math.min(u, 0.9);
  const vv = Math.max(-0.94, Math.min(0.94, v));
  const du = 0.008;
  const dv = 0.018;

  const pMinusU = makePetalPoint(layer, angle, Math.max(0.02, uu - du), vv, variation, openState);
  const pPlusU = makePetalPoint(layer, angle, Math.min(0.995, uu + du), vv, variation, openState);
  const pMinusV = makePetalPoint(layer, angle, uu, Math.max(-1, vv - dv), variation, openState);
  const pPlusV = makePetalPoint(layer, angle, uu, Math.min(1, vv + dv), variation, openState);

  const tangentU = [pPlusU[0] - pMinusU[0], pPlusU[1] - pMinusU[1], pPlusU[2] - pMinusU[2]];
  const tangentV = [pPlusV[0] - pMinusV[0], pPlusV[1] - pMinusV[1], pPlusV[2] - pMinusV[2]];

  const nx = tangentU[1] * tangentV[2] - tangentU[2] * tangentV[1];
  const ny = tangentU[2] * tangentV[0] - tangentU[0] * tangentV[2];
  const nz = tangentU[0] * tangentV[1] - tangentU[1] * tangentV[0];
  const length = Math.hypot(nx, ny, nz) || 1;
  const sign = ny < 0 ? -1 : 1;

  return [(nx / length) * sign, (ny / length) * sign, (nz / length) * sign];
}

function createPetalGeometry() {
  const positions = [];
  const opens = [];
  const normalsClosed = [];
  const normalsOpen = [];
  const uvs = [];
  const seeds = [];
  const tints = [];
  const edges = [];
  const layers = [];
  const delays = [];
  const sizes = [];

  for (const layer of PETAL_LAYERS) {
    for (let p = 0; p < layer.petals; p++) {
      const variation = createPetalVariation(layer, p);
      const angle = (p / layer.petals) * TAU + layer.phase + variation.angleJitter;
      const petalSeed = variation.seed;

      for (let i = 0; i < layer.perPetal; i++) {
        let u;
        let v;
        let edge = 0;
        const mode = Math.random();

        if (mode < 0.14) {
          u = 0.055 + Math.random() * 0.93;
          v = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.1);
          edge = 0.7 + Math.random() * 0.3;
        } else if (mode < 0.22) {
          u = 0.08 + Math.random() * 0.88;
          v = (Math.random() - 0.5) * 0.024;
          edge = 0.28;
        } else {
          u = 0.035 + Math.pow(Math.random(), 0.84) * 0.955;
          v = (Math.random() * 2 - 1) * 0.94;
        }

        const closed = makePetalPoint(layer, angle, u, v, variation, false);
        const open = makePetalPoint(layer, angle, u, v, variation, true);
        const normalClosed = makePetalNormal(layer, angle, u, v, variation, false);
        const normalOpen = makePetalNormal(layer, angle, u, v, variation, true);
        const jitter = (Math.random() - 0.5) * 0.018;

        positions.push(closed[0] + jitter, closed[1] + jitter * 0.7, closed[2] - jitter);
        opens.push(open[0] + jitter, open[1] + jitter * 0.7, open[2] - jitter);
        normalsClosed.push(normalClosed[0], normalClosed[1], normalClosed[2]);
        normalsOpen.push(normalOpen[0], normalOpen[1], normalOpen[2]);
        uvs.push(u, v);
        seeds.push(petalSeed);
        tints.push(Math.random());
        edges.push(edge);
        layers.push(layer.id / 2);
        delays.push(layer.delay + Math.random() * 0.055);
        sizes.push((0.56 + Math.random() * 0.72 + edge * 0.45) * (layer.id === 2 ? 0.92 : 1));
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aOpen", new THREE.Float32BufferAttribute(opens, 3));
  geometry.setAttribute("aNormalClosed", new THREE.Float32BufferAttribute(normalsClosed, 3));
  geometry.setAttribute("aNormalOpen", new THREE.Float32BufferAttribute(normalsOpen, 3));
  geometry.setAttribute("aUv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aTint", new THREE.Float32BufferAttribute(tints, 1));
  geometry.setAttribute("aEdge", new THREE.Float32BufferAttribute(edges, 1));
  geometry.setAttribute("aLayer", new THREE.Float32BufferAttribute(layers, 1));
  geometry.setAttribute("aDelay", new THREE.Float32BufferAttribute(delays, 1));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.computeBoundingSphere();

  return {
    geometry,
    count: positions.length / 3
  };
}

function createMembraneGeometry() {
  const positions = [];
  const opens = [];
  const normalsClosed = [];
  const normalsOpen = [];
  const uvs = [];
  const seeds = [];
  const layers = [];
  const delays = [];
  const indices = [];

  const uSegments = 30;
  const vSegments = 10;

  for (const layer of PETAL_LAYERS) {
    for (let p = 0; p < layer.petals; p++) {
      const variation = createPetalVariation(layer, p);
      const angle = (p / layer.petals) * TAU + layer.phase + variation.angleJitter;
      const petalSeed = variation.seed;
      const baseIndex = positions.length / 3;

      for (let iu = 0; iu <= uSegments; iu++) {
        const u = 0.025 + (iu / uSegments) * 0.97;
        for (let iv = 0; iv <= vSegments; iv++) {
          const v = (iv / vSegments) * 2 - 1;
          const closed = makePetalPoint(layer, angle, u, v, variation, false);
          const open = makePetalPoint(layer, angle, u, v, variation, true);
          const normalClosed = makePetalNormal(layer, angle, u, v, variation, false);
          const normalOpen = makePetalNormal(layer, angle, u, v, variation, true);
          positions.push(closed[0], closed[1], closed[2]);
          opens.push(open[0], open[1], open[2]);
          normalsClosed.push(normalClosed[0], normalClosed[1], normalClosed[2]);
          normalsOpen.push(normalOpen[0], normalOpen[1], normalOpen[2]);
          uvs.push(u, v);
          seeds.push(petalSeed);
          layers.push(layer.id / 2);
          delays.push(layer.delay + 0.01);
        }
      }

      for (let iu = 0; iu < uSegments; iu++) {
        for (let iv = 0; iv < vSegments; iv++) {
          const a = baseIndex + iu * (vSegments + 1) + iv;
          const b = a + vSegments + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aOpen", new THREE.Float32BufferAttribute(opens, 3));
  geometry.setAttribute("aNormalClosed", new THREE.Float32BufferAttribute(normalsClosed, 3));
  geometry.setAttribute("aNormalOpen", new THREE.Float32BufferAttribute(normalsOpen, 3));
  geometry.setAttribute("aUv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aLayer", new THREE.Float32BufferAttribute(layers, 1));
  geometry.setAttribute("aDelay", new THREE.Float32BufferAttribute(delays, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return geometry;
}

function createStamenGeometry() {
  const positions = [];
  const seeds = [];
  const sizes = [];
  const filaments = [];

  /* pollen core */
  const pollenCount = 2200;
  for (let i = 0; i < pollenCount; i++) {
    const theta = Math.random() * TAU;
    const r = Math.pow(Math.random(), 0.55) * 0.34;
    const y = 0.04 + Math.random() * 0.3 + (1 - r / 0.34) * 0.16;
    positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r * 0.9);
    seeds.push(Math.random());
    sizes.push(0.36 + Math.random() * 0.75);
    filaments.push(0);
  }

  /* curved filaments reaching up from the centre */
  const filamentsCount = 34;
  for (let f = 0; f < filamentsCount; f++) {
    const theta = (f / filamentsCount) * TAU + Math.random() * 0.1;
    const length = 0.45 + Math.random() * 0.32;
    const lean = 0.16 + Math.random() * 0.3;
    const segments = 20;

    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      const r = lean * t * t;
      positions.push(
        Math.cos(theta) * r,
        0.23 + length * t - 0.06 * t * t,
        Math.sin(theta) * r
      );
      seeds.push(Math.random());
      sizes.push(0.34 + Math.random() * 0.5 + t * 0.16);
      filaments.push(0.35 + t * 0.65);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aFilament", new THREE.Float32BufferAttribute(filaments, 1));
  geometry.computeBoundingSphere();

  return { geometry, count: positions.length / 3 };
}

function createDustGeometry() {
  const count = 1800;
  const positions = [];
  const seeds = [];
  const sizes = [];
  const depths = [];
  const tints = [];

  for (let i = 0; i < count; i++) {
    const radius = 1.7 + Math.pow(Math.random(), 0.72) * 4.7;
    const theta = Math.random() * TAU;
    const spread = 0.55 + Math.random() * 2.3;
    positions.push(
      Math.cos(theta) * radius,
      0.25 + (Math.random() - 0.5) * 5.0 * spread * 0.68,
      Math.sin(theta) * radius * 0.72 - 1.0 + Math.random() * 2.8
    );
    seeds.push(Math.random());
    sizes.push(0.35 + Math.pow(Math.random(), 2.2) * 2.7);
    depths.push(Math.random());
    tints.push(Math.random());
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aDepth", new THREE.Float32BufferAttribute(depths, 1));
  geometry.setAttribute("aTint", new THREE.Float32BufferAttribute(tints, 1));
  geometry.computeBoundingSphere();

  return { geometry, count };
}

function createGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 225, 195, 0.9)");
  gradient.addColorStop(0.12, "rgba(255, 175, 130, 0.5)");
  gradient.addColorStop(0.38, "rgba(218, 91, 91, 0.17)");
  gradient.addColorStop(0.7, "rgba(126, 48, 70, 0.03)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/* ---------------- flower object ---------------- */

export class Flower {
  constructor({ pixelRatio = 1 } = {}) {
    this.group = new THREE.Group();
    this.group.name = "flower";
    this.group.position.set(1.72, 0.05, 0);
    this.group.rotation.set(-0.035, 0.12, 0.02);

    this.basePosition = new THREE.Vector3(1.72, 0.05, 0);
    this.targetScale = 1;
    this.pixelRatio = pixelRatio;
    this.openValue = 0;
    this.tipPositions = Array.from({ length: 5 }, () => new THREE.Vector3(0, 0.4, 0));
    this.tipStrengths = new Float32Array(5);

    const petal = createPetalGeometry();
    this.petalCount = petal.count;

    this.petalMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpen: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uPointSize: { value: 37 },
        uOpacity: { value: 1.08 },
        uTips: { value: this.tipPositions },
        uTipStrength: { value: this.tipStrengths }
      },
      vertexShader: petalVertexShader,
      fragmentShader: petalFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    });

    this.petals = new THREE.Points(petal.geometry, this.petalMaterial);
    this.petals.frustumCulled = false;
    this.petals.renderOrder = 2;
    this.group.add(this.petals);

    this.membraneMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpen: { value: 0 },
        uOpacity: { value: 1.42 },
        uTips: { value: this.tipPositions },
        uTipStrength: { value: this.tipStrengths }
      },
      vertexShader: membraneVertexShader,
      fragmentShader: membraneFragmentShader,
      transparent: true,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending
    });

    this.membrane = new THREE.Mesh(createMembraneGeometry(), this.membraneMaterial);
    this.membrane.frustumCulled = false;
    this.membrane.renderOrder = 1;
    this.group.add(this.membrane);

    const stamen = createStamenGeometry();
    this.stamenCount = stamen.count;
    this.stamenMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpen: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uPointSize: { value: 36 },
        uOpacity: { value: 0.92 }
      },
      vertexShader: stamenVertexShader,
      fragmentShader: stamenFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.stamens = new THREE.Points(stamen.geometry, this.stamenMaterial);
    this.stamens.frustumCulled = false;
    this.stamens.renderOrder = 3;
    this.group.add(this.stamens);

    const dust = createDustGeometry();
    this.dustCount = dust.count;
    this.dustMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpen: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uPointSize: { value: 41 }
      },
      vertexShader: dustVertexShader,
      fragmentShader: dustFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.dust = new THREE.Points(dust.geometry, this.dustMaterial);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 0;
    this.group.add(this.dust);

    const glowTexture = createGlowTexture();
    this.aura = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffb18d,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false
      })
    );
    this.aura.position.set(0, 0.65, 0.1);
    this.aura.scale.set(6.8, 6.8, 1);
    this.aura.renderOrder = -1;
    this.aura.visible = false;
    this.group.add(this.aura);

    this.coreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffd7ad,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true
      })
    );
    this.coreGlow.position.set(0, 0.3, 0.02);
    this.coreGlow.scale.set(1.9, 1.9, 1);
    this.coreGlow.renderOrder = 4;
    this.group.add(this.coreGlow);

    this.totalCount = this.petalCount + this.stamenCount + this.dustCount;
  }

  setPixelRatio(pixelRatio) {
    this.pixelRatio = pixelRatio;
    this.petalMaterial.uniforms.uPixelRatio.value = pixelRatio;
    this.stamenMaterial.uniforms.uPixelRatio.value = pixelRatio;
    this.dustMaterial.uniforms.uPixelRatio.value = pixelRatio;
  }

  setLayout({ x, y, scale }) {
    this.basePosition.set(x, y, 0);
    this.targetScale = scale;
  }

  setTips(tips, strengths) {
    for (let i = 0; i < 5; i++) {
      if (tips[i]) this.tipPositions[i].copy(tips[i]);
      this.tipStrengths[i] = strengths[i] || 0;
    }
  }

  update(dt, time, openness, pointer = { x: 0, y: 0, energy: 0 }) {
    const k = 1 - Math.exp(-dt * 7.5);
    this.openValue += (openness - this.openValue) * k;
    const open = this.openValue;

    this.petalMaterial.uniforms.uTime.value = time;
    this.petalMaterial.uniforms.uOpen.value = open;
    this.membraneMaterial.uniforms.uTime.value = time;
    this.membraneMaterial.uniforms.uOpen.value = open;
    this.stamenMaterial.uniforms.uTime.value = time;
    this.stamenMaterial.uniforms.uOpen.value = open;
    this.dustMaterial.uniforms.uTime.value = time;
    this.dustMaterial.uniforms.uOpen.value = open;

    const idleFloat = Math.sin(time * 0.52) * 0.018;
    const targetX = this.basePosition.x + pointer.x * 0.16;
    const targetY = this.basePosition.y + pointer.y * 0.11 + idleFloat;
    const posK = 1 - Math.exp(-dt * 2.6);

    this.group.position.x += (targetX - this.group.position.x) * posK;
    this.group.position.y += (targetY - this.group.position.y) * posK;

    const scaleK = 1 - Math.exp(-dt * 3.2);
    const nextScale = this.group.scale.x + (this.targetScale - this.group.scale.x) * scaleK;
    this.group.scale.setScalar(nextScale);

    this.group.rotation.y += (0.11 + pointer.x * 0.16 + Math.sin(time * 0.17) * 0.04 - this.group.rotation.y) * (1 - Math.exp(-dt * 1.8));
    this.group.rotation.x += (-0.035 + pointer.y * 0.08 - this.group.rotation.x) * (1 - Math.exp(-dt * 1.8));
    this.group.rotation.z += (0.02 + pointer.x * 0.035 + Math.sin(time * 0.11) * 0.012 - this.group.rotation.z) * (1 - Math.exp(-dt * 1.5));

    this.aura.material.opacity = 0.03 + open * 0.045 + Math.sin(time * 0.8) * 0.004;
    this.aura.scale.setScalar(11.5 + open * 1.6 + Math.sin(time * 0.6) * 0.12);
    this.coreGlow.material.opacity = 0.28 + open * 0.25;
    this.coreGlow.scale.setScalar(1.5 + open * 0.55 + Math.sin(time * 1.4) * 0.04);
  }

  get openness() {
    return this.openValue;
  }
}
