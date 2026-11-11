import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Ground } from '../viewer/core/Ground';
import { useStage } from './store';
import { reducedMotion } from './support';

/**
 * The Trace (DESIGN.md 4.2): the product's identity visual. Recorded motion drawn abstractly:
 * points travelling along smooth closed curves, each trailing a fading ribbon of where it has been.
 *
 * Everything is computed on the GPU. Each vertex carries its curve's parameters and its age along
 * the trail, and the vertex shader evaluates the curve at (time - age). The CPU does nothing per
 * frame except update one uniform, so the cost is the vertex count (about 16,000) and not scripting.
 */

const CURVES = 90;
const SEGMENTS = 150;
const TRAIL_SECONDS = 12;
/** Dots along each trail: the keyframes of the recording. */
const KEYS = 20;
/** Draw-range levels the Trace steps down through if frames run long (never back up). */
const QUALITY_STEPS = [1, 0.66, 0.4];
/** A frozen moment for reduced motion and for the static frame. */
const STILL_TIME = 46;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CURVE_GLSL = /* glsl */ `
  attribute vec4 aA; // frequencies x, y, z and a seed
  attribute vec4 aB; // phases x, y, z and an amplitude

  vec3 curveAt(float t) {
    float s = t * (0.8 + aA.w * 0.6);
    float r = aB.w;
    return vec3(
      r * sin(aA.x * s + aB.x) + 0.35 * r * sin(2.13 * aA.x * s + aB.y),
      0.45 * r * sin(aA.y * s + aB.y) - 1.0,
      r * sin(aA.z * s + aB.z) + 0.3 * r * cos(1.7 * aA.z * s + aB.x)
    );
  }

  vec3 colourFor(float seed) {
    vec3 stone = mix(vec3(0.42, 0.44, 0.48), vec3(0.78, 0.76, 0.72), seed);
    vec3 warm = vec3(0.96, 0.71, 0.27);
    return seed > 0.9 ? warm : stone;
  }
`;

const LINE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uTrail;
  attribute float aAge;
  varying vec3 vColor;
  varying float vAlpha;
  ${CURVE_GLSL}
  void main() {
    vec3 p = curveAt(uTime - aAge * uTrail);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float fade = 1.0 - aAge;
    vAlpha = pow(fade, 1.6) * 0.85 * (1.0 - smoothstep(60.0, 110.0, -mv.z));
    vColor = colourFor(aA.w);
    gl_Position = projectionMatrix * mv;
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() { gl_FragColor = vec4(vColor, vAlpha); }
`;

const HEAD_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixel;
  varying vec3 vColor;
  varying float vAlpha;
  ${CURVE_GLSL}
  void main() {
    vec3 p = curveAt(uTime);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vAlpha = 0.95 * (1.0 - smoothstep(60.0, 110.0, -mv.z));
    vColor = colourFor(aA.w) * 1.15;
    gl_PointSize = uPixel * (5.0 + aA.w * 4.0) * (30.0 / max(8.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const KEY_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uTrail;
  uniform float uPixel;
  attribute float aAge;
  varying vec3 vColor;
  varying float vAlpha;
  ${CURVE_GLSL}
  void main() {
    vec3 p = curveAt(uTime - aAge * uTrail);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float fade = 1.0 - aAge;
    vAlpha = pow(fade, 1.4) * 0.8 * (1.0 - smoothstep(60.0, 110.0, -mv.z));
    vColor = colourFor(aA.w);
    gl_PointSize = uPixel * 3.2 * (30.0 / max(8.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const HEAD_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, vAlpha * glow * glow);
  }
`;

function buildCurveParameters() {
  const random = mulberry32(1337);
  return Array.from({ length: CURVES }, () => ({
    a: [0.12 + random() * 0.14, 0.09 + random() * 0.11, 0.11 + random() * 0.14, random()] as const,
    b: [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2, 6 + random() * 14] as const,
  }));
}

function buildLineGeometry(curves: ReturnType<typeof buildCurveParameters>) {
  const vertices = CURVES * SEGMENTS * 2;
  const a = new Float32Array(vertices * 4);
  const b = new Float32Array(vertices * 4);
  const age = new Float32Array(vertices);
  curves.forEach((curve, c) => {
    for (let s = 0; s < SEGMENTS; s++) {
      for (let end = 0; end < 2; end++) {
        const i = (c * SEGMENTS + s) * 2 + end;
        a.set(curve.a, i * 4);
        b.set(curve.b, i * 4);
        age[i] = (s + end) / SEGMENTS;
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  // three needs a position attribute to size the draw call; the shader computes the real one.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
  geometry.setAttribute('aA', new THREE.BufferAttribute(a, 4));
  geometry.setAttribute('aB', new THREE.BufferAttribute(b, 4));
  geometry.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  return geometry;
}

function buildKeyGeometry(curves: ReturnType<typeof buildCurveParameters>) {
  const vertices = CURVES * KEYS;
  const a = new Float32Array(vertices * 4);
  const b = new Float32Array(vertices * 4);
  const age = new Float32Array(vertices);
  curves.forEach((curve, c) => {
    for (let k = 0; k < KEYS; k++) {
      const i = c * KEYS + k;
      a.set(curve.a, i * 4);
      b.set(curve.b, i * 4);
      age[i] = (k + 1) / (KEYS + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
  geometry.setAttribute('aA', new THREE.BufferAttribute(a, 4));
  geometry.setAttribute('aB', new THREE.BufferAttribute(b, 4));
  geometry.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  return geometry;
}

function buildHeadGeometry(curves: ReturnType<typeof buildCurveParameters>) {
  const a = new Float32Array(CURVES * 4);
  const b = new Float32Array(CURVES * 4);
  curves.forEach((curve, c) => {
    a.set(curve.a, c * 4);
    b.set(curve.b, c * 4);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CURVES * 3), 3));
  geometry.setAttribute('aA', new THREE.BufferAttribute(a, 4));
  geometry.setAttribute('aB', new THREE.BufferAttribute(b, 4));
  return geometry;
}

export function Trace() {
  const dpr = useThree((s) => s.viewport.dpr);
  const quality = useRef(0);
  const frames = useRef({ time: 0, count: 0, slowWindows: 0 });
  const still = reducedMotion();
  const pinned = useMemo(() => new URLSearchParams(window.location.search).get('trace') === 'full', []);

  const { lineGeometry, headGeometry, keyGeometry, lineMaterial, headMaterial, keyMaterial } = useMemo(() => {
    const curves = buildCurveParameters();
    const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;
    return {
      lineGeometry: buildLineGeometry(curves),
      headGeometry: buildHeadGeometry(curves),
      keyGeometry: buildKeyGeometry(curves),
      lineMaterial: new THREE.ShaderMaterial({
        ...additive,
        uniforms: { uTime: { value: STILL_TIME }, uTrail: { value: TRAIL_SECONDS } },
        vertexShader: LINE_VERTEX,
        fragmentShader: LINE_FRAGMENT,
      }),
      headMaterial: new THREE.ShaderMaterial({
        ...additive,
        uniforms: { uTime: { value: STILL_TIME }, uPixel: { value: 1 } },
        vertexShader: HEAD_VERTEX,
        fragmentShader: HEAD_FRAGMENT,
      }),
      keyMaterial: new THREE.ShaderMaterial({
        ...additive,
        uniforms: { uTime: { value: STILL_TIME }, uTrail: { value: TRAIL_SECONDS }, uPixel: { value: 1 } },
        vertexShader: KEY_VERTEX,
        fragmentShader: HEAD_FRAGMENT,
      }),
    };
  }, []);

  useEffect(() => {
    headMaterial.uniforms.uPixel.value = dpr;
    keyMaterial.uniforms.uPixel.value = dpr;
  }, [dpr, headMaterial, keyMaterial]);

  useEffect(
    () => () => {
      lineGeometry.dispose();
      headGeometry.dispose();
      keyGeometry.dispose();
      lineMaterial.dispose();
      headMaterial.dispose();
      keyMaterial.dispose();
    },
    [lineGeometry, headGeometry, keyGeometry, lineMaterial, headMaterial, keyMaterial],
  );

  useFrame(({ clock }, delta) => {
    const time = still ? STILL_TIME : STILL_TIME + clock.elapsedTime;
    lineMaterial.uniforms.uTime.value = time;
    headMaterial.uniforms.uTime.value = time;
    keyMaterial.uniforms.uTime.value = time;

    // If frames run long, draw fewer curves. It only ever steps down, and `?trace=full` pins it.
    // Startup (shader compile, the environment map) and one-off hitches must not count: the first
    // 1.5 s are ignored, single frames over 200 ms are ignored, and it takes two slow windows in a row.
    if (pinned || clock.elapsedTime < 1.5 || delta > 0.2) return;
    const window = frames.current;
    window.time += delta;
    window.count += 1;
    if (window.time < 2) return;
    const average = window.time / window.count;
    window.time = 0;
    window.count = 0;
    window.slowWindows = average > 0.026 ? window.slowWindows + 1 : 0;
    if (window.slowWindows >= 2 && quality.current < QUALITY_STEPS.length - 1) {
      window.slowWindows = 0;
      quality.current += 1;
      const level = QUALITY_STEPS[quality.current];
      const curves = Math.floor(CURVES * level);
      lineGeometry.setDrawRange(0, curves * SEGMENTS * 2);
      headGeometry.setDrawRange(0, curves);
      keyGeometry.setDrawRange(0, curves * KEYS);
      useStage.setState({ traceQuality: level });
      console.debug(`[stage] Trace stepped down to ${Math.round(level * 100)}% (frames averaged ${(average * 1000).toFixed(1)} ms)`);
    }
  });

  return (
    <>
      <lineSegments geometry={lineGeometry} material={lineMaterial} frustumCulled={false} />
      <points geometry={keyGeometry} material={keyMaterial} frustumCulled={false} />
      <points geometry={headGeometry} material={headMaterial} frustumCulled={false} />
      <Ground y={-8} fadeDistance={90} />
    </>
  );
}
