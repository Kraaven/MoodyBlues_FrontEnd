import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Atmosphere } from '../viewer/core/Atmosphere';
import { GameBackdrop } from '../viewer/core/GameBackdrop';
import { findByObjectId, towardsSun } from '../viewer/core/lightRules';
import { toneMappingFor } from '../viewer/core/look';
import { StudioEnvironment } from '../viewer/core/StudioEnvironment';
import { useEffectiveLook, useQualityTier } from './lookState';
import { useStage } from './store';

/**
 * Applies the look in force to the whole canvas: the background, environment and fog (the studio's
 * gradient and environment panels, or the game's own sky and fog), the renderer's tone mapping and
 * exposure, and the scene materials' defines (`MbSurface`). It is the one place that decides these,
 * so the demo scene, the scene preview and the studio all get the same treatment. Changing look
 * swaps what is mounted and flips the materials' defines; it reloads nothing, and the shaders of
 * the look not shown stay cached by three.js.
 */
export function LookRig() {
  const look = useEffectiveLook();
  const tier = useQualityTier();
  const game = useStage((s) => s.game);
  const sceneRadius = useStage((s) => s.sceneRadius);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const moody = game?.moody.scene ?? null;

  // The game's materials follow the look; the effect runs again for a new scene (`game`).
  useEffect(() => {
    game?.surface.setLook(look);
    invalidate();
  }, [game, look, invalidate]);

  // Tone mapping and exposure: Khronos PBR Neutral everywhere, except a game scene whose own post-processing says ACES.
  useEffect(() => {
    const { mapper, exposure } = toneMappingFor(look, moody?.post ?? null);
    gl.toneMapping = mapper === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
    gl.toneMappingExposure = exposure;
    invalidate();
  }, [gl, look, moody, invalidate]);

  // The way to the sun, from its node's orientation; computed once per scene, not per render.
  const sunDirection = useMemo(() => {
    if (!game || moody?.sun == null) return null;
    const node = findByObjectId(game.master, moody.sun);
    return node ? towardsSun(node) : null;
  }, [game, moody]);

  if (look === 'game' && moody) return <GameBackdrop moody={moody} sunDirection={sunDirection} tier={tier} />;
  return (
    <>
      <Atmosphere sceneRadius={sceneRadius} />
      <StudioEnvironment />
    </>
  );
}
