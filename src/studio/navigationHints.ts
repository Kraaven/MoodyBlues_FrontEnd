/** One way of moving around the view: the input, and what it does. */
export interface NavigationHint {
  /** Shown as key chips, side by side. */
  keys: string[];
  /** The chips are alternatives ("Right-drag or Shift+drag"), not a combination. */
  either?: boolean;
  action: string;
}

/**
 * How to move around the 3D view with a mouse and keyboard. Checked against the OrbitControls
 * defaults the Stage uses (left orbits, right or Shift+left pans, the wheel zooms) and against the
 * bindings in shortcuts.tsx.
 */
export const POINTER_HINTS: readonly NavigationHint[] = [
  { keys: ['Drag'], action: 'Orbit' },
  { keys: ['Right-drag', 'Shift+drag'], either: true, action: 'Pan' },
  { keys: ['Scroll'], action: 'Zoom' },
  { keys: ['Click'], action: 'Select an object' },
  { keys: ['Space'], action: 'Play / pause' },
  { keys: ['←', '→'], action: 'Step back / forward' },
  { keys: ['V'], action: 'Next camera' },
  { keys: ['F'], action: 'Follow the selection' },
  { keys: ['A'], action: 'Frame the whole scene' },
  { keys: ['?'], action: 'All shortcuts' },
];

/** The same, on a touch screen: no keyboard, so playback is the timeline's button. */
export const TOUCH_HINTS: readonly NavigationHint[] = [
  { keys: ['One finger'], action: 'Orbit' },
  { keys: ['Two fingers'], action: 'Pan and zoom' },
  { keys: ['Tap'], action: 'Select an object' },
  { keys: ['Play button'], action: 'Play / pause, in the timeline' },
];

export function navigationHints(touch: boolean): readonly NavigationHint[] {
  return touch ? TOUCH_HINTS : POINTER_HINTS;
}
