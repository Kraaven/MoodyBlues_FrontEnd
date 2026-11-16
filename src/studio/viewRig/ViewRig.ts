import * as THREE from 'three';
import type { FollowStyle } from '../studioStore';
import { FreeLook } from './freeLook';
import { armShare, armSqueezed, SideChooser, stepArm } from './occlusion';
import { chasePose, chooseSide, followDistance, headingOf, restPose, sidePose, travelDirection, type PlayerSize, type PoseGoal } from './poses';
import { AngleSpring, Spring, Spring3, wrapAngle } from './springs';
import { VelocityEstimator } from './velocity';

/** Seconds the viewer takes to close most of the gap to where it should stand, to what it looks at, and to turn. */
export const POSITION_SMOOTH = 0.28;
export const TARGET_SMOOTH = 0.16;
export const HEADING_SMOOTH = 0.35;
/** The user's nudge (orbit angles) eases back after this long without input, over about the return time. */
export const RETURN_DELAY = 2;
const RETURN_SMOOTH = 0.45;
/** Entering or leaving first person takes this long. */
export const BLEND_SECONDS = 0.5;
/** The user's distance, as a multiple of the default, stays within these. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
/** The viewer's elevation stays off the poles, in radians of polar angle. */
const POLE = 0.05;
/** A long frame must not teleport the view. */
const MAX_DT = 0.1;
const SETTLED = 1e-3;
/** Orbit input smaller than this (radians, or log of the distance ratio) in a frame is not the user. */
const INPUT_EPSILON = 1e-4;

export type RigMode = 'follow' | 'firstPerson';

/** What the rig needs to know each frame. The vectors are read, never kept. */
export interface RigInput {
  dt: number;
  /** The recording's time, for the velocity. */
  time: number;
  reduced: boolean;
  /** The focused camera; another one glides. */
  focusId: number;
  mode: RigMode;
  style: FollowStyle;
  /** The player: the thing the view follows. */
  player: THREE.Vector3;
  /** The focused camera node, in world space. `fov` is null when it is not a perspective camera. */
  eye: { position: THREE.Vector3; quaternion: THREE.Quaternion; forward: THREE.Vector3; fov: number | null };
  /** The viewer's camera and the orbit target as they are now, after the user's input of this frame. */
  view: { position: THREE.Vector3; target: THREE.Vector3 };
  /** The user is holding a drag on the orbit. */
  dragging: boolean;
  /** The player's size, which sets the default follow distance and aim. */
  size: PlayerSize;
  /**
   * Distance from `from` along the way to `to` to the first thing that would hide the view, or null
   * when the way is clear. Without it nothing is avoided.
   */
  probe?: (from: THREE.Vector3, to: THREE.Vector3) => number | null;
  /** The user's field of view setting. */
  fov: number;
}

export interface RigOutput {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** The camera's rotation while `firstPerson` is above 0; otherwise the camera just looks at the target. */
  quaternion: THREE.Quaternion;
  fov: number;
  /** How far into first person, 0 to 1 (eased). */
  firstPerson: number;
  /** The orbit controls may take input. */
  orbitEnabled: boolean;
  /** Something is still moving, so the next frame is needed. */
  animating: boolean;
  /** An obstruction is closer than the spring arm may come in, so what blocks the view should be shown through. */
  squeezed: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const lookMatrix = new THREE.Matrix4();

/**
 * The view while a camera is focused: each frame it computes where the viewer should stand (Behind,
 * Front) or sit (first person), and moves there on critically damped springs, so it repositions and
 * turns on its own instead of being glued to what it follows.
 *
 * The user's orbit input is kept: OrbitControls moves the camera on top of the pose written last
 * frame, the rig reads that back as yaw, pitch and distance offsets, applies them to the new pose,
 * and eases the angles back to zero after RETURN_DELAY seconds without input. The distance stays.
 *
 * No three.js scene, no React: everything it needs comes in through `update`, so it is unit-tested.
 */
export class ViewRig {
  private readonly position = new Spring3();
  private readonly target = new Spring3();
  private readonly heading = new AngleSpring();
  private readonly yaw = new Spring();
  private readonly pitch = new Spring();
  private zoom = 1;
  private clock = 0;
  private lastInput = -Infinity;
  private facing = 0;
  private side: 1 | -1 = 1;
  private blend = 0;
  /** Spring arm: the share of the distance kept when something is in the way. */
  private arm = 1;
  private squeezed = false;
  private readonly sides = new SideChooser();
  /** After Front changes side on purpose, the viewer needs a moment to swing before its side is judged again. */
  private sideLock = 0;
  private sideProbeIn = 0;
  private readonly otherGoal: PoseGoal = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  private seededFor: number | null = null;
  private lastStyle: FollowStyle | null = null;
  private lastMode: RigMode | null = null;
  /** What was written last frame, to tell the user's orbit input from the rig's own movement. */
  private readonly written = new THREE.Vector3();
  private hasWritten = false;
  private readonly velocity = new VelocityEstimator();
  readonly freeLook = new FreeLook();

  private readonly goal: PoseGoal = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  private readonly spherical = new THREE.Spherical();
  private readonly sphericalBefore = new THREE.Spherical();
  private readonly sphericalNow = new THREE.Spherical();
  private readonly scratch = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly followQuaternion = new THREE.Quaternion();
  private readonly lookQuaternion = new THREE.Quaternion();
  private readonly turn = new THREE.Quaternion();
  private readonly out: RigOutput = {
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    fov: 45,
    firstPerson: 0,
    orbitEnabled: true,
    animating: false,
    squeezed: false,
  };

  /** 0 to 1: how far into first person the view is. */
  get firstPerson(): number {
    return this.blend;
  }

  /** Forget the pose and the user's nudge; the next `update` starts from wherever the camera is. */
  reset(): void {
    this.seededFor = null;
    this.hasWritten = false;
    this.blend = 0;
    this.freeLook.release();
    this.freeLook.yaw.snap(0);
    this.freeLook.pitch.snap(0);
  }

  /** The recording's playhead was moved by hand: velocity measurement restarts from the new place. */
  noteSeek(): void {
    this.velocity.rebase();
  }

  update(i: RigInput): RigOutput {
    const dt = Math.min(i.dt, MAX_DT);
    this.clock += dt;
    const fresh = this.seededFor !== i.focusId;
    if (fresh) this.seed(i);
    // Reduced motion: a change of camera, mode or style cuts instead of gliding.
    const cut = i.reduced && (fresh || this.lastMode !== i.mode || this.lastStyle !== i.style);
    this.lastMode = i.mode;
    this.lastStyle = i.style;

    const level = headingOf(i.eye.forward.x, i.eye.forward.z);
    if (level !== null) this.facing = level;
    const pitch = Math.asin(Math.min(1, Math.max(-1, i.eye.forward.y)));
    this.velocity.update(i.time, i.player);

    // The goal: where the viewer should stand now.
    const behind = i.style === 'behind';
    const distance = followDistance(i.style, i.size);
    const headingGoal = behind ? this.facing : travelDirection(this.velocity.velocity.x, this.velocity.velocity.z, this.facing);
    this.heading.step(headingGoal, cut ? 0 : HEADING_SMOOTH, dt);
    if (behind) chasePose(i.player, i.size, this.heading.value, pitch, distance, this.goal);
    else {
      this.sideLock -= dt;
      if (this.sideLock <= 0) this.side = chooseSide(this.side, this.heading.value, this.position.value.x - i.player.x, this.position.value.z - i.player.z);
      sidePose(i.player, i.size, this.velocity.velocity, this.heading.value, this.side, distance, this.goal);
      this.avoidTrees(i, distance, dt);
    }
    this.position.step(this.goal.position, cut ? 0 : POSITION_SMOOTH, dt);
    this.target.step(this.goal.target, cut ? 0 : TARGET_SMOOTH, dt);

    const first = i.mode === 'firstPerson';
    this.readUserInput(i, first);
    this.easeNudge(i, first, dt);

    // The follow pose with the user's nudge on top, about the point looked at.
    this.offset.copy(this.position.value).sub(this.target.value);
    this.spherical.setFromVector3(this.offset);
    this.spherical.theta += this.yaw.value;
    this.spherical.phi = Math.min(Math.PI - POLE, Math.max(POLE, this.spherical.phi - this.pitch.value));
    this.spherical.radius *= this.zoom;
    const out = this.out;
    out.position.setFromSpherical(this.spherical).add(this.target.value);
    out.target.copy(this.target.value);
    this.springArm(i, dt, cut);

    // First person is blended in over the follow pose.
    const blendGoal = first ? 1 : 0;
    if (cut || i.reduced) this.blend = blendGoal;
    else this.blend += Math.sign(blendGoal - this.blend) * Math.min(Math.abs(blendGoal - this.blend), dt / BLEND_SECONDS);
    const eased = this.blend * this.blend * (3 - 2 * this.blend);
    this.freeLook.step(dt);
    out.fov = i.fov;
    this.hasWritten = false;
    if (eased > 0) this.blendFirstPerson(i, eased);
    else {
      this.written.copy(out.position).sub(out.target);
      this.hasWritten = true;
    }
    out.firstPerson = eased;
    out.squeezed = this.squeezed;
    out.orbitEnabled = !first && this.blend === 0;

    const nudged = Math.abs(this.yaw.value) > SETTLED || Math.abs(this.pitch.value) > SETTLED;
    out.animating =
      i.dragging ||
      this.blend !== blendGoal ||
      nudged ||
      !this.freeLook.settled ||
      !this.position.settled(this.goal.position, SETTLED) ||
      !this.target.settled(this.goal.target, SETTLED) ||
      !this.heading.settled(headingGoal, SETTLED);
    return out;
  }

  private seed(i: RigInput): void {
    this.seededFor = i.focusId;
    this.position.snap(i.view.position);
    this.target.snap(i.view.target);
    const looking = headingOf(i.view.target.x - i.view.position.x, i.view.target.z - i.view.position.z);
    const level = headingOf(i.eye.forward.x, i.eye.forward.z);
    this.facing = level ?? this.facing;
    this.heading.snap(looking ?? this.facing);
    this.yaw.snap(0);
    this.pitch.snap(0);
    this.zoom = 1;
    this.lastInput = -Infinity;
    this.hasWritten = false;
    this.arm = 1;
    this.squeezed = false;
    this.sides.reset();
    this.sideLock = 0;
    this.velocity.reset();
    // Keep the side the viewer is already on.
    this.side = chooseSide(1, this.heading.value, i.view.position.x - i.player.x, i.view.position.z - i.player.z);
  }

  /**
   * Front: when a tree stands between the aim and the viewer's side, and the other side is clear,
   * go round to the other. Judged about ten times a second, from the goal poses.
   */
  private avoidTrees(i: RigInput, distance: number, dt: number): void {
    if (!i.probe) return;
    this.sideProbeIn -= dt;
    if (this.sideProbeIn > 0) return;
    this.sideProbeIn = 0.1;
    sidePose(i.player, i.size, this.velocity.velocity, this.heading.value, -this.side as 1 | -1, distance, this.otherGoal);
    const own = i.probe(this.goal.target, this.goal.position);
    const other = i.probe(this.otherGoal.target, this.otherGoal.position);
    const length = this.goal.position.distanceTo(this.goal.target);
    if (this.sides.update(0.1, own !== null && own < length - 0.05, other !== null && other < length - 0.05)) {
      this.side = -this.side as 1 | -1;
      this.sideLock = 1;
    }
  }

  /** Spring arm: bring the viewer in towards what it looks at when something is in the way, and ease back out when it is clear. */
  private springArm(i: RigInput, dt: number, cut: boolean): void {
    const out = this.out;
    const hit = i.probe && i.mode === 'follow' ? i.probe(out.target, out.position) : null;
    const length = out.position.distanceTo(out.target);
    const goal = armShare(hit, length);
    this.squeezed = armSqueezed(hit, length);
    this.arm = cut ? goal : stepArm(this.arm, goal, dt);
    out.position.sub(out.target).multiplyScalar(this.arm).add(out.target);
  }

  /** What the user did with the orbit since the rig last wrote the camera, as offsets. */
  private readUserInput(i: RigInput, first: boolean): void {
    if (i.dragging) this.lastInput = this.clock;
    if (!this.hasWritten || first || this.blend > 0) return;
    const before = this.sphericalBefore.setFromVector3(this.written);
    const now = this.sphericalNow.setFromVector3(this.offset.copy(i.view.position).sub(i.view.target));
    if (before.radius < 1e-6 || now.radius < 1e-6) return;
    const dTheta = wrapAngle(now.theta - before.theta);
    const dPhi = now.phi - before.phi;
    const dZoom = Math.log(now.radius / before.radius);
    if (Math.abs(dTheta) + Math.abs(dPhi) + Math.abs(dZoom) < INPUT_EPSILON) return;
    this.yaw.snap(this.yaw.value + dTheta);
    this.pitch.snap(this.pitch.value - dPhi);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * Math.exp(dZoom)));
    this.lastInput = this.clock;
  }

  /** After a while without input the angles ease back to the pose; the distance stays as zoomed. */
  private easeNudge(i: RigInput, first: boolean, dt: number): void {
    if (this.clock - this.lastInput < RETURN_DELAY && !first) return;
    if (this.yaw.value === 0 && this.pitch.value === 0) return;
    this.yaw.step(0, i.reduced ? 0 : RETURN_SMOOTH, dt);
    this.pitch.step(0, i.reduced ? 0 : RETURN_SMOOTH, dt);
    if (Math.abs(this.yaw.value) < SETTLED / 10) this.yaw.snap(0);
    if (Math.abs(this.pitch.value) < SETTLED / 10) this.pitch.snap(0);
  }

  /** The recorded view of the camera node, turned by the free look, blended over the follow pose. */
  private blendFirstPerson(i: RigInput, eased: number): void {
    const out = this.out;
    this.turn.setFromAxisAngle(UP, this.freeLook.yaw.value);
    const first = this.lookQuaternion.copy(this.turn).multiply(i.eye.quaternion);
    this.turn.setFromAxisAngle(this.scratch.set(1, 0, 0), this.freeLook.pitch.value);
    first.multiply(this.turn);
    lookMatrix.lookAt(out.position, out.target, UP);
    this.followQuaternion.setFromRotationMatrix(lookMatrix);
    const fpTarget = this.scratch.set(0, 0, -1).applyQuaternion(first).multiplyScalar(followDistance('behind', i.size)).add(i.eye.position);
    out.position.lerp(i.eye.position, eased);
    out.target.lerp(fpTarget, eased);
    out.quaternion = this.followQuaternion.slerp(first, eased);
    if (i.eye.fov !== null) out.fov = i.fov + (i.eye.fov - i.fov) * eased;
  }
}

/**
 * Where the follow view settles for a camera at this moment: the intro flies there, so that when
 * following takes over there is nothing to jump. The viewer stands on the side it already is, or the
 * default side.
 */
export function followRestPose(style: FollowStyle, player: THREE.Vector3, size: PlayerSize, forward: THREE.Vector3, out: PoseGoal): PoseGoal {
  const heading = headingOf(forward.x, forward.z) ?? 0;
  return restPose(style, player, size, heading, Math.asin(Math.min(1, Math.max(-1, forward.y))), out);
}
