const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

export function passUrl(passId: string, sig: string): string {
  return `${APP_URL}/pass/${passId}?sig=${sig}`;
}
