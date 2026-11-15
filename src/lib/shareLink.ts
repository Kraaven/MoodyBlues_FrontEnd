/** The public URL of a shared session, optionally starting at `seconds` into the replay. */
export function shareUrl(origin: string, token: string, seconds?: number | null): string {
  const url = `${origin}/share/${encodeURIComponent(token)}`;
  return seconds !== undefined && seconds !== null && Number.isFinite(seconds) && seconds > 0 ? `${url}?t=${seconds.toFixed(2)}` : url;
}

/** The owner-only link to a scene version in 3D, which reopens the same version. */
export function viewLink(origin: string, base: string, version: number): string {
  return `${origin}${base}/view?version=${version}`;
}

/** The `?t=` start time of a link: positive seconds, otherwise 0. */
export function parseStartTime(value: string | null): number {
  const t = Number(value);
  return value !== null && Number.isFinite(t) && t > 0 ? t : 0;
}
