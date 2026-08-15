import { auth } from './firebase';
import { safeFetch } from './api';

export async function fetchSignedTicketToken(ticketId: string): Promise<string> {
  if (!ticketId) throw new Error('Ticket ID is required.');
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sign in is required to load the secure ticket QR.');

  const response = await safeFetch<{ success?: boolean; signedToken?: string; error?: string }>('/api/tickets/generate-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await currentUser.getIdToken()}`,
    },
    body: JSON.stringify({ ticketId }),
  });
  const token = response.data?.signedToken;
  if (!response.ok || !response.data?.success || !token) {
    throw new Error(response.data?.error || response.error || 'The secure ticket QR could not be issued.');
  }
  return token;
}
