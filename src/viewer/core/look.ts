/**
 * The two knobs that decide how a scene is drawn: the LOOK (what it is lit and shaded like) and the
 * quality TIER (how much it costs). Both are plain values with pure helpers, so the rules can be
 * tested without a renderer.
 *
 * Looks
 * - `game`: the scene as its Unity game drew it: the game's own sky, ambient light, fog, lights,
 *   baked lightmaps and tone mapping, read from the GLB's `MOODYBLUES_scene` extension. A GLB without
 *   the extension has nothing to read, so it is drawn with the `studio` look.
 * - `studio`: a neutral studio (environment panels, one key light, a charcoal gradient). Independent
 *   of the scene's own lighting, so geometry and colours can be judged.
 * The type is open for a later `analysis` look (heat maps, debug views).
 *
 * Tiers
 * - `full`: the desktop set. 2048 px shadow map, the selection outline through post-processing.
 * - `simple`: for phones. 1024 px shadow map, no post-processing composer at all (the selection is
 *   an emissive tint), and no realtime shadows in a lightmapped game scene (the lightmaps already
 *   hold them).
 */
export type Look = 'game' | 'studio';
export type QualityTier = 'simple' | 'full';

export const LOOKS: readonly Look[] = ['game', 'studio'];
export const DEFAULT_LOOK: Look = 'game';

/** A look read from stored or shared data; anything unknown is the default. */
export function readLook(raw: unknown, fallback: Look = DEFAULT_LOOK): Look {
  return raw === 'game' || raw === 'studio' ? raw : fallback;
}

/**
 * The tier: `?quality=full` or `?quality=simple` in the address wins, otherwise a phone gets
 * `simple` and everything else `full`. `search` is `location.search`.
 */
export function resolveQualityTier(search: string, phone: boolean): QualityTier {
  const asked = new URLSearchParams(search).get('quality');
  if (asked === 'simple' || asked === 'full') return asked;
  return phone ? 'simple' : 'full';
}

/** Shadow map edge in texels. */
export function shadowMapSize(tier: QualityTier): number {
  return tier === 'simple' ? 1024 : 2048;
}

/** Whether realtime shadows are drawn: the user's setting, except a simple-tier game scene that has lightmaps. */
export function realtimeShadows(setting: boolean, tier: QualityTier, look: Look, lightmapped: boolean): boolean {
  if (!setting) return false;
  return !(tier === 'simple' && look === 'game' && lightmapped);
}

/** Exposure of the Studio look under Khronos PBR Neutral; about as bright as the ACES setting it replaced (1.05, and ACES at 0.77 equals Neutral at 1). */
export const STUDIO_EXPOSURE = 1.3;

export type ToneMapper = 'neutral' | 'aces';

/** The tone mapper and exposure a look uses; `post` is the scene's own post-processing, when the game look has it. */
export function toneMappingFor(look: Look, post: { tonemapping: 'none' | 'neutral' | 'aces'; postExposure: number } | null): { mapper: ToneMapper; exposure: number } {
  if (look === 'game' && post) return { mapper: post.tonemapping === 'aces' ? 'aces' : 'neutral', exposure: 2 ** post.postExposure };
  return { mapper: 'neutral', exposure: look === 'game' ? 1 : STUDIO_EXPOSURE };
}
