import { defaultLayout, type ScopeLayout } from '../studio/windows/windowLayout';
import { PANEL_IDS, type ShareSettings } from './shareSettings';

/** The windows a shared link opens with: the panels its owner made available and open at the start, docked beside the view in rail order. */
export function shareLayout(panels: ShareSettings['panels']): ScopeLayout {
  return defaultLayout(PANEL_IDS.filter((id) => panels[id].available && panels[id].openAtStart));
}
