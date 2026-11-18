import { DEFAULT_LOOK, type Look } from '../viewer/core/look';

/** How the view stays on a focused camera: through its lens, or chasing the player it belongs to. */
export type CameraMode = 'firstPerson' | 'follow';
export type FollowStyle = 'behind' | 'front';

/** What the studio's view shows and how it frames the player. The owner's are remembered; a share link's come from its settings. */
export interface ViewSettings {
  grid: boolean;
  shadows: boolean;
  fov: number;
  /** How the scene is lit and shaded: the game's own (`game`), or a neutral studio. A scene without game lighting data is always drawn as the studio. */
  look: Look;
  /** The lights the Unity scene exported. The game look needs them (they are its direct light); on in the studio look they are an extra. */
  sceneLights: boolean;
  /** A small frustum drawn at each camera the Unity scene exported. */
  cameraGizmos: boolean;
  /** How Follow frames the player: a chase camera behind and above, or side-on leading where they move. */
  followStyle: FollowStyle;
  /** First person's near clip plane in metres, for a camera that sits inside the player's body. Null: automatic, scaled to the player's height. */
  firstPersonNear: number | null;
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  grid: true,
  shadows: true,
  fov: 45,
  look: DEFAULT_LOOK,
  sceneLights: true,
  cameraGizmos: true,
  followStyle: 'behind',
  firstPersonNear: null,
};

/** The narrowest and widest field of view the view offers, in degrees. */
export const FOV_RANGE = { min: 20, max: 90 } as const;
/** The nearest clip distance the first-person slider offers, in metres. */
export const NEAR_RANGE = { min: 0.01, max: 1.5 } as const;
