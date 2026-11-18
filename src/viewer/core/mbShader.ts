/**
 * The game look's changes to three.js's standard (physical) fragment shader, as pure string work so
 * a test can run it against the real shader chunks and prove that every replacement matched.
 *
 * We do not write a BRDF. three.js's physical material already has specular anti-aliasing, a
 * roughness floor, multiscatter and specular occlusion; we change only what feeds it:
 *
 * - `MB_AMBIENT_CUBE`: the diffuse light from the sky comes from the scene's ambient cube instead of
 *   the environment map's irradiance. It is fed into `iblIrradiance`, so it keeps the energy
 *   conservation three.js applies to indirect diffuse. It is multiplied by PI because three.js's
 *   Lambert BRDF is albedo / PI and Unity adds `albedo * ambient`; light intensities already carry
 *   that PI (contract: Unity intensity x PI).
 * - `MB_LIGHTMAP_RGBM`: the lightmap is RGBM (`rgb * a * range`, with `range * PI` in
 *   `lightMapIntensity`), and replaces the ambient cube.
 * - `MB_GAME`: the environment map's diffuse irradiance is not added; specular reflection from it stays.
 * - `MB_SKIP_DIRECTIONAL`: the directional-light loop is left out (the lightmap already holds them).
 * - `MB_FOG_LINEAR`, `MB_FOG_EXP`: Unity's linear fog (not smoothstep) and exponential fog.
 *
 * Every define is checked in the shader by `#ifdef`, so the patched text is valid whatever is set;
 * which ones are set is the material's `defines`, which three.js turns into a program per
 * combination. `patchStandardFragment` reports a replacement that found nothing (a three.js upgrade
 * that moved a line) instead of silently doing nothing.
 */

type Chunks = Readonly<Record<string, string>>;

export const AMBIENT_UNIFORM = 'mbAmbientCube';

const AMBIENT_FUNCTION = /* glsl */ `
uniform vec3 ${AMBIENT_UNIFORM}[ 6 ];
// Valve ambient cube, +X -X +Y -Y +Z -Z in world (glTF) space, times PI (see mbShader.ts).
vec3 mbAmbient( const in vec3 n ) {
	vec3 sq = n * n;
	return PI * ( sq.x * ${AMBIENT_UNIFORM}[ n.x >= 0.0 ? 0 : 1 ] + sq.y * ${AMBIENT_UNIFORM}[ n.y >= 0.0 ? 2 : 3 ] + sq.z * ${AMBIENT_UNIFORM}[ n.z >= 0.0 ? 4 : 5 ] );
}
`;

interface Replacement {
  chunk: string;
  find: string;
  replace: string;
}

const REPLACEMENTS: Replacement[] = [
  {
    chunk: 'lights_fragment_begin',
    find: 'vec3 iblIrradiance = vec3( 0.0 );',
    replace: `vec3 iblIrradiance = vec3( 0.0 );
	#ifdef MB_AMBIENT_CUBE
		iblIrradiance = mbAmbient( transformNormalByInverseViewMatrix( geometryNormal, viewMatrix ) );
	#endif`,
  },
  {
    chunk: 'lights_fragment_begin',
    find: '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
    replace: '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && ! defined( MB_SKIP_DIRECTIONAL )',
  },
  {
    chunk: 'lights_fragment_maps',
    find: 'iblIrradiance += getIBLIrradiance( geometryNormal );',
    replace: `#ifndef MB_GAME
				iblIrradiance += getIBLIrradiance( geometryNormal );
			#endif`,
  },
  {
    chunk: 'lights_fragment_maps',
    find: 'vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;',
    replace: `#ifdef MB_LIGHTMAP_RGBM
			vec3 lightMapIrradiance = lightMapTexel.rgb * ( lightMapTexel.a * lightMapIntensity );
		#else
			vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		#endif`,
  },
  {
    chunk: 'fog_fragment',
    find: 'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
    replace: `#ifdef MB_FOG_EXP
			float fogFactor = 1.0 - exp( - fogDensity * vFogDepth );
		#else
			float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
		#endif`,
  },
  {
    chunk: 'fog_fragment',
    find: 'float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );',
    replace: `#ifdef MB_FOG_LINEAR
			float fogFactor = saturate( ( vFogDepth - fogNear ) / max( fogFar - fogNear, 0.0001 ) );
		#else
			float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		#endif`,
  },
];

const CHUNKS_PATCHED = ['lights_fragment_begin', 'lights_fragment_maps', 'fog_fragment'] as const;

/**
 * `fragment` (the material's shader with its `#include`s unresolved) with the game-look changes
 * applied. `missed` names every change that could not be made.
 */
export function patchStandardFragment(fragment: string, chunks: Chunks): { code: string; missed: string[] } {
  const missed: string[] = [];
  const patched = new Map<string, string>();
  for (const name of CHUNKS_PATCHED) patched.set(name, chunks[name] ?? '');

  for (const r of REPLACEMENTS) {
    const text = patched.get(r.chunk) ?? '';
    if (!text.includes(r.find)) {
      missed.push(`${r.chunk}: ${r.find}`);
      continue;
    }
    patched.set(r.chunk, text.replace(r.find, () => r.replace));
  }

  let code = fragment;
  for (const name of CHUNKS_PATCHED) {
    const token = `#include <${name}>`;
    if (!code.includes(token)) {
      missed.push(`shader: ${token}`);
      continue;
    }
    code = code.replace(token, () => patched.get(name)!);
  }
  const pars = '#include <lights_pars_begin>';
  if (code.includes(pars)) code = code.replace(pars, () => `${pars}\n${AMBIENT_FUNCTION}`);
  else missed.push(`shader: ${pars}`);
  return { code, missed };
}
