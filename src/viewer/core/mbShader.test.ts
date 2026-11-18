import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { patchStandardFragment } from './mbShader';

describe('patchStandardFragment', () => {
  const standard = THREE.ShaderLib.standard.fragmentShader;
  const physical = THREE.ShaderLib.physical.fragmentShader;

  it('matches every replacement against the real three.js shader (a silent no-op is the bug to catch)', () => {
    for (const source of [standard, physical]) {
      const { missed } = patchStandardFragment(source, THREE.ShaderChunk);
      expect(missed).toEqual([]);
    }
  });

  it('inlines the patched chunks and declares the ambient cube', () => {
    const { code } = patchStandardFragment(standard, THREE.ShaderChunk);
    expect(code).not.toContain('#include <lights_fragment_begin>');
    expect(code).not.toContain('#include <lights_fragment_maps>');
    expect(code).not.toContain('#include <fog_fragment>');
    expect(code).toContain('uniform vec3 mbAmbientCube[ 6 ];');
    expect(code).toContain('vec3 mbAmbient(');
    expect(code).toContain('#ifdef MB_AMBIENT_CUBE');
    expect(code).toContain('mbAmbient( transformNormalByInverseViewMatrix( geometryNormal, viewMatrix ) )');
    expect(code).toContain('! defined( MB_SKIP_DIRECTIONAL )');
    expect(code).toContain('#ifndef MB_GAME');
    expect(code).toContain('lightMapTexel.a * lightMapIntensity');
    expect(code).toContain('#ifdef MB_FOG_EXP');
    expect(code).toContain('#ifdef MB_FOG_LINEAR');
  });

  it('declares the cube function after the lights uniforms and before main', () => {
    const { code } = patchStandardFragment(standard, THREE.ShaderChunk);
    expect(code.indexOf('vec3 mbAmbient(')).toBeLessThan(code.indexOf('void main()'));
  });

  it('reports a replacement that no longer matches', () => {
    const chunks = { ...THREE.ShaderChunk, fog_fragment: 'nothing to find' };
    const { missed } = patchStandardFragment(standard, chunks);
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.every((m) => m.startsWith('fog_fragment'))).toBe(true);
  });

  it('reports a shader that lacks an include', () => {
    const { missed } = patchStandardFragment('void main() {}', THREE.ShaderChunk);
    expect(missed.some((m) => m.startsWith('shader:'))).toBe(true);
  });
});
