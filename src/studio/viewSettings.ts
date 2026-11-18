/** How the view stays on a focused camera: through its lens, or chasing the player it belongs to. */
export type CameraMode = 'firstPerson' | 'follow';
export type FollowStyle = 'behind' | 'front';

/** What the studio's view shows and how it frames the player. The owner's are remembered; a share link's come from its settings. */
export interface ViewSettings {
  grid: boolean;
  shadows: boolean;
  fov: number;
  /** The lights the Unity scene exported. Off by default: the viewer's own lighting reads better and costs less. */
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
  sceneLights: false,
  cameraGizmos: true,
  followStyle: 'behind',
  firstPersonNear: null,
};

/** The narrowest and widest field of view the view offers, in degrees. */
export const FOV_RANGE = { min: 20, max: 90 } as const;
/** The nearest clip distance the first-person slider offers, in metres. */
export const NEAR_RANGE = { min: 0.01, max: 1.5 } as const;
