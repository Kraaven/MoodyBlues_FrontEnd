export const DEFAULT_LANDING = '/projects';

/** The post-sign-in destination: only same-origin relative paths are accepted, so a crafted `from` cannot redirect off-site. */
export function safeRedirect(from: unknown): string {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.includes('\\')) return DEFAULT_LANDING;
  return from;
}
