const KEY = 'moodyblues.debug';

/**
 * The Debug panel is for people building the viewer (DESIGN.md 9.6). `?debug` turns it on and it is
 * remembered; `?debug=0` turns it off again. Nothing of it is loaded while it is off.
 */
export function debugEnabled(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('debug');
    if (param === '0' || param === 'off') localStorage.removeItem(KEY);
    else if (param !== null) localStorage.setItem(KEY, '1');
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
