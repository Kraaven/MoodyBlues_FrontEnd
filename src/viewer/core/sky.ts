import * as THREE from 'three';
import type { RGB, SceneSky } from './sceneExtension';

/**
 * The game look's sky: one cheap shader that approximates Unity's `Skybox/Procedural` (it is not
 * Unity-exact): a Rayleigh-blue gradient tinted by `_SkyTint`, a hazy horizon, the ground colour
 * below it, `_Exposure`, and a sun disc with a soft halo. Other skies are a flat colour (the main
 * camera's background) or a gradient from the ambient cube's +Y and -Y faces.
 *
 * The sky is drawn ONCE into a cube map (PMREM): that texture is the scene's background (a cube
 * lookup per pixel, no sky shader running per frame) and its environment (so reflections and
 * specular light match what the viewer sees). Colours are linear.
 */

/** Sun brightness in the disc (linear, before tone mapping); it is meant to clip to white. */
const SUN_INTENSITY = 12;

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = position;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const FRAGMENT = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSkyTint;
uniform vec3 uGround;
uniform float uExposure;
uniform float uThickness;
uniform float uSunSize;
uniform float uConvergence;
uniform vec3 uSunDir;
uniform float uHasSun;
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uColor;

void main() {
	vec3 d = normalize( vDir );
	vec3 col;
	#if defined( SKY_PROCEDURAL )
		// Unity's sky tint is neutral at 0.5 (the default blue), so double it.
		vec3 zenith = vec3( 0.22, 0.42, 0.95 ) * ( uSkyTint * 2.0 ) * ( 0.55 + 0.45 * uThickness );
		float luma = dot( zenith, vec3( 0.333 ) );
		vec3 horizon = mix( zenith, vec3( luma + 0.45 ), 0.55 );
		vec3 sky = mix( horizon, zenith, pow( clamp( d.y, 0.0, 1.0 ), 0.45 ) );
		col = mix( sky, uGround, smoothstep( 0.02, -0.05, d.y ) );
		col *= uExposure;
		if ( uHasSun > 0.5 ) {
			float s = dot( d, uSunDir );
			float r = max( uSunSize, 0.002 );
			float disc = smoothstep( cos( r * 1.3 ), cos( r * 0.9 ), s );
			float halo = pow( clamp( s, 0.0, 1.0 ), mix( 24.0, 700.0, clamp( uConvergence / 16.0, 0.0, 1.0 ) ) ) * 0.2;
			col += vec3( 1.0, 0.95, 0.85 ) * ( disc * ${SUN_INTENSITY.toFixed(1)} + halo ) * smoothstep( -0.05, 0.02, d.y );
		}
	#elif defined( SKY_GRADIENT )
		col = mix( uBottom, uTop, smoothstep( -0.3, 0.55, d.y ) );
	#else
		col = uColor;
	#endif
	gl_FragColor = vec4( col, 1.0 );
}`;

type SkyKind = 'procedural' | 'gradient' | 'color';

const color = (c: RGB) => new THREE.Vector3(c[0], c[1], c[2]);

/** Which shader branch a sky uses: `other` (and anything unknown) is the gradient. */
export function skyKind(sky: SceneSky): SkyKind {
  return sky.type === 'procedural' ? 'procedural' : sky.type === 'color' ? 'color' : 'gradient';
}

/** The sky's shader material: defines and uniforms from the extension. `sunDirection` is the way to the sun, or null for no disc. */
export function createSkyMaterial(sky: SceneSky, ambientCube: readonly RGB[], sunDirection: THREE.Vector3 | null): THREE.ShaderMaterial {
  const kind = skyKind(sky);
  const procedural = sky.type === 'procedural' ? sky : null;
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    defines: { [`SKY_${kind.toUpperCase()}`]: '' },
    uniforms: {
      uSkyTint: { value: color(procedural?.skyTint ?? [0.5, 0.5, 0.5]) },
      uGround: { value: color(procedural?.groundColor ?? [0.3, 0.3, 0.3]) },
      uExposure: { value: procedural?.exposure ?? 1 },
      uThickness: { value: procedural?.atmosphereThickness ?? 1 },
      uSunSize: { value: procedural?.sunSize ?? 0.04 },
      uConvergence: { value: procedural?.sunSizeConvergence ?? 5 },
      uSunDir: { value: (sunDirection ?? new THREE.Vector3(0, 1, 0)).clone().normalize() },
      uHasSun: { value: sunDirection && procedural ? 1 : 0 },
      uTop: { value: color(ambientCube[2] ?? [0.5, 0.5, 0.5]) },
      uBottom: { value: color(ambientCube[3] ?? [0.2, 0.2, 0.2]) },
      uColor: { value: color(sky.type === 'color' ? sky.color : [0.1, 0.1, 0.1]) },
    },
  });
}

/** A scene holding the sky on an enclosing sphere, ready for `PMREMGenerator.fromScene`. */
export function createSkyScene(sky: SceneSky, ambientCube: readonly RGB[], sunDirection: THREE.Vector3 | null): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), createSkyMaterial(sky, ambientCube, sunDirection)));
  return scene;
}

/** Frees the sky scene's geometry and material. */
export function disposeSkyScene(scene: THREE.Scene): void {
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
}
