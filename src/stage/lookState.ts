import { isPhoneLayout, usePhoneLayout } from '../lib/usePhoneLayout';
import { useStudio } from '../studio/studioStore';
import * as THREE from 'three';
import { findSunLight, lightEnabled } from '../viewer/core/lightRules';
import { realtimeShadows, resolveQualityTier, shadowMapSize, type Look, type QualityTier } from '../viewer/core/look';
import type { GameScene } from './sceneAssets';
import { useStage } from './store';

/**
 * Which look and quality tier the Stage is drawing with, as the rest of the app should ask for them.
 * The look is the user's choice, except that a scene without game lighting data has nothing to draw
 * the game look from and is shown in the studio look. The tier is the phone layout or the address
 * (`?quality=simple|full`); see viewer/core/look.ts.
 */

/** The look in force: the chosen one when the scene on screen has game data, else the studio. */
export function effectiveLook(): Look {
  return useStage.getState().game ? useStudio.getState().settings.look : 'studio';
}

export function useEffectiveLook(): Look {
  const look = useStudio((s) => s.settings.look);
  const hasGame = useStage((s) => s.game !== null);
  return hasGame ? look : 'studio';
}

/** The tier, read once (the address cannot change without a reload; the phone layout can, see {@link useQualityTier}). */
export function currentQualityTier(): QualityTier {
  return resolveQualityTier(window.location.search, isPhoneLayout());
}

export function useQualityTier(): QualityTier {
  const phone = usePhoneLayout();
  return resolveQualityTier(window.location.search, phone);
}

/** Whether realtime shadows are on, given the user's Shadows setting (see `realtimeShadows`). */
export function shadowsOn(setting: boolean): boolean {
  const game = useStage.getState().game;
  return realtimeShadows(setting, currentQualityTier(), effectiveLook(), game?.surface.lightmapped ?? false);
}

/** The hook form of {@link shadowsOn}. */
export function useShadowsOn(setting: boolean): boolean {
  const tier = useQualityTier();
  const look = useEffectiveLook();
  const lightmapped = useStage((s) => s.game?.surface.lightmapped ?? false);
  return realtimeShadows(setting, tier, look, lightmapped);
}

/** Shadow settings the sun of a game scene needs before its first frame (so the shader is built with them). */
export function applyGameSun(root: THREE.Object3D, game: GameScene, shadows: boolean, look: Look, tier: QualityTier): void {
  const sun = findSunLight(root, game.moody.scene.sun);
  if (!sun) return;
  sun.castShadow = shadows && lightEnabled(sun, true, look);
  sun.shadow.mapSize.set(shadowMapSize(tier), shadowMapSize(tier));
}

