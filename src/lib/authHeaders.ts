import { auth } from './firebase';
import { getSessionId } from '../contexts/BookingContext';

export const authenticatedApiHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Session-Id': getSessionId(),
  };
  try {
    if (auth.currentUser) {
      headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
    }
  } catch (err) {
    console.warn('Could not attach Firebase identity token:', err);
  }
  return headers;
};
