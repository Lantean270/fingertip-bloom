import * as THREE from "three";

/* =========================================================
   ANTHOS — three-dimensional scenery
   Tilted orbital rings and out-of-focus motes give the bloom
   a physical sense of space when the camera drifts.
   ========================================================= */

const TAU = Math.PI * 2;

function makeCircle(radius, segments = 240) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return points;
}

function createBokehField(pixelRatio) {
  const count = 54;
  const positions = [];
  const seeds = [];
  const sizes = [];
  const tints = [];
  const layers = [];

  for (let i = 0; i < count; i++) {
    const foreground = i < 20;
    const theta = Math.random() * TAU;
    const spread = foreground ? 2.2 + Math.random() * 3.8 : 2.4 + Math.random() * 5.2;
    const y = (Math.random() - 0.5) * 7.2;

    positions.push(
      Math.cos(theta) * spread,
      y,
      foreground ? 2.2 + Math.random() * 3.8 : -2.4 - Math.random() * 4.2
    );
    seeds.push(Math.random());
    sizes.push(foreground ? 2.2 + Math.random() * 3.8 : 1.6 + Math.random() * 3.0);
    tints.push(Math.random());
    layers.push(foreground ? 1 : 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aTint", new THREE.Float32BufferAttribute(tints, 1));
  geometry.setAttribute("aLayer", new THREE.Float32BufferAttribute(layers, 1));
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aSeed;
      attribute float aSize;
      attribute float aTint;
      attribute float aLayer;
      varying vec3 vColor;
      varying float vAlpha;

      #define TAU 6.28318530718

      void main() {
        vec3 pos = position;
        float drift = uTime * (0.018 + aSeed * 0.026);
        pos.x += sin(drift + aSeed * TAU) * (0.45 + aLayer * 0.5);
        pos.y += cos(drift * 0.7 + aSeed * 8.4) * 0.28;
        pos.z += sin(drift * 0.55 + aSeed * 5.2) * 0.2;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float perspective = 8.0 / max(1.0, -mvPosition.z);
        gl_PointSize = clamp(aSize * uPixelRatio * perspective, 6.0, 150.0);

        vec3 warm = vec3(1.0, 0.24, 0.16);
        vec3 cool = vec3(0.24, 0.34, 0.9);
        vec3 champagne = vec3(1.0, 0.58, 0.3);
        vColor = mix(mix(warm, champagne, aTint), cool, max(0.0, aTint - 0.84) * 2.4);
        float twinkle = 0.55 + 0.45 * sin(uTime * 0.32 + aSeed * TAU * 2.0);
        vAlpha = (aLayer > 0.5 ? 0.12 : 0.06) * twinkle;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (d > 1.0) discard;
        float soft = smoothstep(1.0, 0.45, d);
        float rim = smoothstep(0.52, 0.92, d) * smoothstep(1.0, 0.84, d);
        float alpha = (soft * 0.14 + rim * 0.62) * vAlpha;
        gl_FragColor = vec4(vColor, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 8;
  return points;
}

function createOrbit(radius, tiltX, tiltZ, phase, color, opacity) {
  const group = new THREE.Group();
  group.rotation.set(tiltX, 0, tiltZ);
  group.rotation.y = phase;

  const count = 380;
  const positions = [];
  const sizes = [];
  const seeds = [];
  const phases = [];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    const jitter = (Math.random() - 0.5) * 0.055;
    const r = radius + jitter;
    positions.push(
      Math.cos(angle) * r,
      (Math.random() - 0.5) * 0.03,
      Math.sin(angle) * r
    );
    seeds.push(Math.random());
    phases.push(angle);
    sizes.push(0.55 + Math.pow(Math.random(), 1.8) * 1.1);
  }

  /* sparse, larger glints punctuate the dotted orbit */
  for (let i = 0; i < 22; i++) {
    const angle = Math.random() * TAU;
    const r = radius + (Math.random() - 0.5) * 0.12;
    positions.push(Math.cos(angle) * r, (Math.random() - 0.5) * 0.04, Math.sin(angle) * r);
    seeds.push(Math.random());
    phases.push(angle);
    sizes.push(2.4 + Math.pow(Math.random(), 1.6) * 3.1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1.5 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uOpacity;
      uniform vec3 uColor;
      attribute float aSize;
      attribute float aSeed;
      attribute float aPhase;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec3 pos = position;
        pos.y += sin(uTime * 0.35 + aPhase * 3.0 + aSeed * 6.28) * 0.02;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        gl_PointSize = clamp(aSize * uPixelRatio * (24.0 / max(1.0, -mvPosition.z)), 0.8, 26.0);
        float twinkle = 0.6 + 0.4 * sin(uTime * 0.7 + aSeed * 19.0 + aPhase);
        vAlpha = uOpacity * (0.3 + min(aSize, 3.0) * 0.18) * twinkle;
        vColor = uColor;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (d > 1.0) discard;
        float soft = pow(max(0.0, 1.0 - d), 2.2);
        gl_FragColor = vec4(vColor, soft * vAlpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 6;
  group.add(points);

  /* A hair-thin 3D arc makes the orbital plane legible even when still. */
  const arcStart = Math.random() * TAU;
  const arcPoints = [];
  for (let i = 0; i <= 150; i++) {
    const a = arcStart + (i / 150) * TAU * 0.68;
    arcPoints.push(new THREE.Vector3(Math.cos(a) * radius, 0.03, Math.sin(a) * radius));
  }
  const arcCurve = new THREE.CatmullRomCurve3(arcPoints, false, "centripetal");
  const arcGeometry = new THREE.TubeGeometry(arcCurve, 220, 0.011, 3, false);
  const arcMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true
  });
  const arc = new THREE.Mesh(arcGeometry, arcMaterial);
  arc.frustumCulled = false;
  arc.renderOrder = 6;
  group.add(arc);

  return { group, material, arcMaterial, speed: 0.012 + Math.random() * 0.024 };
}

export class Scenery {
  constructor(scene, { pixelRatio = 1 } = {}) {
    this.scene = scene;
    this.orbitGroup = new THREE.Group();
    this.orbitGroup.position.set(1.7, 0.35, -0.4);
    scene.add(this.orbitGroup);

    this.orbits = [
      createOrbit(2.65, 1.18, 0.14, 0.2, 0xffc1a0, 0.18),
      createOrbit(3.3, 0.62, -0.24, 1.2, 0xffd5b6, 0.11),
      createOrbit(2.15, 1.44, 0.5, 2.4, 0xff9f92, 0.13)
    ];
    for (const orbit of this.orbits) this.orbitGroup.add(orbit.group);

    this.bokeh = createBokehField(pixelRatio);
    scene.add(this.bokeh);

    this.pixelRatio = pixelRatio;
  }

  setPixelRatio(pixelRatio) {
    this.pixelRatio = pixelRatio;
    this.bokeh.material.uniforms.uPixelRatio.value = pixelRatio;
    for (const orbit of this.orbits) {
      orbit.material.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  update(dt, time, flowerPosition, flowerScale, pointer = { x: 0, y: 0 }) {
    this.orbitGroup.position.x += (flowerPosition.x - this.orbitGroup.position.x) * (1 - Math.exp(-dt * 1.4));
    this.orbitGroup.position.y += (flowerPosition.y + 0.28 - this.orbitGroup.position.y) * (1 - Math.exp(-dt * 1.4));
    this.orbitGroup.scale.setScalar(flowerScale * 0.85);

    this.orbitGroup.rotation.y = Math.sin(time * 0.055) * 0.16 + pointer.x * 0.08;
    this.orbitGroup.rotation.z = Math.sin(time * 0.08) * 0.035 + pointer.y * 0.05;

    for (let i = 0; i < this.orbits.length; i++) {
      const orbit = this.orbits[i];
      orbit.group.rotation.y += dt * orbit.speed * (i % 2 === 0 ? 1 : -1);
      orbit.material.uniforms.uTime.value = time;
      orbit.material.uniforms.uOpacity.value = (i === 1 ? 0.26 : 0.42) + Math.sin(time * 0.4 + i) * 0.04;
      orbit.arcMaterial.opacity = 0.045 + Math.sin(time * 0.33 + i * 1.7) * 0.013;
    }

    this.bokeh.material.uniforms.uTime.value = time;

    const targetX = pointer.x * 0.15;
    const targetY = -pointer.y * 0.12;
    this.bokeh.position.x += (targetX - this.bokeh.position.x) * (1 - Math.exp(-dt * 1.2));
    this.bokeh.position.y += (targetY - this.bokeh.position.y) * (1 - Math.exp(-dt * 1.2));
  }
}
