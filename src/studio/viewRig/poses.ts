import * as THREE from 'three';
import type { FollowStyle } from '../studioStore';
import { wrapAngle } from './springs';

/** Where the viewer stands and what it looks at. */
export interface PoseGoal {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** What the follow views are sized by: the player's height, and how far its origin sits above its feet. */
export interface PlayerSize {
  height: number;
  /** Origin to the lowest point of the player, metres (the capsule's centre is about half a height up). */
  drop: number;
}

/** Used when the follow target has no visible geometry to measure. */
export const FALLBACK_PLAYER: PlayerSize = { height: 1.8, drop: 0.9 };

/** Behind stands this many player heights back, and never closer than the minimum. */
const BEHIND_HEIGHTS = 3.2;
const BEHIND_MIN = 4;
const FRONT_HEIGHTS = 3.8;
/** The chase camera's height over the player's feet, per unit of distance. */
const HEIGHT_PER_DISTANCE = 0.55;
/** The point looked at: this share of the player's height above its feet (upper body, not feet). */
const AIM_HEIGHT = 0.8;
/** Looking this far down or up (radians) uses the whole swerve. */
const PITCH_FULL = 0.6;
/** Looking down raises the camera by this share of its height; looking up lowers it by the same. */
const SWERVE_HEIGHT = 0.25;
/** The look-at point moves this far along the camera's look direction, per unit of distance. */
const SWERVE_REACH = 0.2;

/** Side view: how far ahead of the player (seconds of travel) the view looks. */
const LEAD_SECONDS = 0.6;
/**
 * The most the aim leads the player, per unit of distance: about 30% of the half width of a 16:9
 * frame at 45 degrees (0.74 per unit), which keeps the player inside 35% from the edge.
 */
const LEAD_MAX_PER_DISTANCE = 0.22;
/** Side view: the angle from square-on towards the front, standing still and at speed (radians). */
const STILL_AZIMUTH = (25 * Math.PI) / 180;
const MOVING_AZIMUTH = (40 * Math.PI) / 180;
const SIDE_HEIGHT_PER_DISTANCE = 0.35;
/** Under this speed (m/s) the player counts as still, and by this one as moving. */
const STILL_SPEED = 0.2;
const MOVING_SPEED = 2.5;
/** A side flip needs the viewer to be this far (share of its distance) on the other side. */
const SIDE_HYSTERESIS = 0.3;

/** First person's automatic near plane: this share of the player's height, and never closer than the minimum (metres). */
const NEAR_HEIGHTS = 0.18;
const NEAR_MIN = 0.05;

/**
 * The near clip plane of the first person view. The recorded camera can sit inside the player's own
 * body, whose inner surface would then fill the lens, so the plane is pushed out past it: the user's
 * setting in metres, or (null) a share of the player's height, about 0.32 m for a 1.8 m player.
 */
export function firstPersonNear(setting: number | null, size: PlayerSize): number {
  return setting ?? Math.max(NEAR_MIN, NEAR_HEIGHTS * size.height);
}

/** How far a style stands from a player of this size by default. */
export function followDistance(style: FollowStyle, size: PlayerSize): number {
  return style === 'behind' ? Math.max(BEHIND_MIN, BEHIND_HEIGHTS * size.height) : FRONT_HEIGHTS * size.height;
}

/** The player's size from the box of its visible geometry, and the world height of its origin. */
export function playerSizeFromBox(box: THREE.Box3, originY: number): PlayerSize {
  const height = box.max.y - box.min.y;
  if (box.isEmpty() || !Number.isFinite(height) || height < 0.3) return FALLBACK_PLAYER;
  const clamped = Math.min(height, 4);
  return { height: clamped, drop: Math.min(clamped, Math.max(0, originY - box.min.y)) };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The unit direction of a heading angle: 0 is +Z, and it grows towards +X. */
export function headingVector(angle: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.sin(angle), 0, Math.cos(angle));
}

/** The heading angle of a horizontal direction, or null when it is too short to have one. */
export function headingOf(x: number, z: number): number | null {
  return Math.hypot(x, z) < 0.1 ? null : Math.atan2(x, z);
}

/**
 * Behind: the chase camera. It stands `distance` behind the player along `heading`, above, and looks
 * at about head height. Looking down (negative `pitch`) raises it and shifts the point looked at
 * down the view; looking up lowers it a little and tilts up, so the view follows where the player
 * looks without swinging far.
 */
export function chasePose(player: THREE.Vector3, size: PlayerSize, heading: number, pitch: number, distance: number, out: PoseGoal): PoseGoal {
  const feet = player.y - size.drop;
  const swerve = Math.min(1, Math.max(-1, -pitch / PITCH_FULL));
  const dir = headingVector(heading, out.position);
  const cosPitch = Math.cos(pitch);
  out.target.set(player.x + dir.x * cosPitch * SWERVE_REACH * distance, feet + AIM_HEIGHT * size.height + Math.sin(pitch) * SWERVE_REACH * distance, player.z + dir.z * cosPitch * SWERVE_REACH * distance);
  out.position.set(player.x - dir.x * distance, feet + HEIGHT_PER_DISTANCE * distance * (1 + SWERVE_HEIGHT * swerve), player.z - dir.z * distance);
  return out;
}

/**
 * The heading the side view lines up with: the direction of travel when moving, the way the player
 * faces when still, blended by speed so it does not jump as the player starts or stops.
 */
export function travelDirection(vx: number, vz: number, facing: number): number {
  const speed = Math.hypot(vx, vz);
  const weight = smoothstep(STILL_SPEED, MOVING_SPEED, speed);
  return weight <= 0 ? facing : facing + wrapAngle(Math.atan2(vx, vz) - facing) * weight;
}

/**
 * Which side of the player the side view stands on: +1 is `(cos a, -sin a)` of the heading `a`
 * (its right in Unity's left-handed view of the ground, seen from above), -1 the other. It keeps the
 * side the viewer is on, and only flips once the viewer is clearly on the other one, so turning the
 * player or reversing the direction of travel swings the view round instead of flickering.
 */
export function chooseSide(previous: 1 | -1, heading: number, offsetX: number, offsetZ: number): 1 | -1 {
  const length = Math.hypot(offsetX, offsetZ);
  if (length < 1e-3) return previous;
  const along = previous * (offsetX * Math.cos(heading) - offsetZ * Math.sin(heading));
  return along < -SIDE_HYSTERESIS * length ? (-previous as 1 | -1) : previous;
}

/**
 * Front (the side cam): square-on to where the player goes, so both the character and the space
 * ahead are in view. It looks a little ahead of the player (more the faster they move, capped), and
 * stands slightly towards the front, further so at speed; standing still it settles to a three
 * quarter view.
 */
export function sidePose(player: THREE.Vector3, size: PlayerSize, velocity: THREE.Vector3, heading: number, side: 1 | -1, distance: number, out: PoseGoal): PoseGoal {
  const feet = player.y - size.drop;
  const speed = Math.hypot(velocity.x, velocity.z);
  const weight = smoothstep(STILL_SPEED, MOVING_SPEED, speed);
  const azimuth = STILL_AZIMUTH + (MOVING_AZIMUTH - STILL_AZIMUTH) * weight;
  const forward = headingVector(heading, out.target);
  const fx = forward.x;
  const fz = forward.z;
  const sx = Math.cos(heading) * side;
  const sz = -Math.sin(heading) * side;
  const cos = Math.cos(azimuth);
  const sin = Math.sin(azimuth);
  out.position.set(player.x + (sx * cos + fx * sin) * distance, feet + SIDE_HEIGHT_PER_DISTANCE * distance, player.z + (sz * cos + fz * sin) * distance);
  const lead = Math.min(speed * LEAD_SECONDS, LEAD_MAX_PER_DISTANCE * distance);
  const k = speed > 1e-6 ? lead / speed : 0;
  out.target.set(player.x + velocity.x * k, feet + AIM_HEIGHT * size.height, player.z + velocity.z * k);
  return out;
}

/**
 * The pose a style settles into when nothing moves and the viewer has no side preference: where the
 * intro's flight ends, so following starts without a jump.
 */
export function restPose(style: FollowStyle, player: THREE.Vector3, size: PlayerSize, facing: number, pitch: number, out: PoseGoal): PoseGoal {
  const distance = followDistance(style, size);
  return style === 'behind' ? chasePose(player, size, facing, pitch, distance, out) : sidePose(player, size, ZERO, facing, 1, distance, out);
}

const ZERO = new THREE.Vector3();
