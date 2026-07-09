export const NATIVE_SIDE_PANEL_SURFACE = 'native-panel';

export function isNativeSidePanelSurface(location: Location = window.location): boolean {
  return new URLSearchParams(location.search).get('surface') === NATIVE_SIDE_PANEL_SURFACE;
}
