import { useMediaQuery } from './useMediaQuery';

/**
 * A phone, held either way up: a touch screen that is narrow (portrait) or short (landscape). A touch tablet is not a phone, and
 * neither is a narrow desktop window, because neither has this layout's problem of too little room for the studio's windows.
 */
export const PHONE_QUERY = '(pointer: coarse) and (max-width: 767px), (pointer: coarse) and (max-height: 500px)';

/** Whether to show the phone viewer (the 3D view, the timeline and one Settings sheet) instead of the full studio. */
export function usePhoneLayout(): boolean {
  return useMediaQuery(PHONE_QUERY);
}

/** The same test, read once outside React (for code that runs in a loader or an effect). */
export function isPhoneLayout(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches;
}
