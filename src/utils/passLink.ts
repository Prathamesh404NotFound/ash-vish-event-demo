const APP_URL = (import.meta.env.VITE_APP_URL as string) || 'https://ashvishevents.com';

export function passUrl(passId: string, sig: string): string {
  return `${APP_URL}/pass/${passId}?sig=${sig}`;
}
