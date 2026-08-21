import { SignJWT, importPKCS8 } from 'jose';

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function getServiceAccount(): ServiceAccount | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    let pk = privateKey.trim();
    if (pk.startsWith('"') && pk.endsWith('"')) {
      pk = pk.substring(1, pk.length - 1);
    }
    if (!pk.includes('\n') && pk.includes('\\n')) {
      pk = pk.replace(/\\n/g, '\n');
    }
    return { projectId, clientEmail, privateKey: pk };
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const raw = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      return {
        projectId: raw.project_id || raw.projectId,
        clientEmail: raw.client_email || raw.clientEmail,
        privateKey: raw.private_key || raw.privateKey,
      };
    } catch (e) {
      console.warn('[IDENTITY ADMIN] Failed to parse FIREBASE_SERVICE_ACCOUNT json');
    }
  }

  return null;
}

let cachedAdminIdToken: { token: string; expiresAt: number } | null = null;

/**
 * Obtains a Firebase Admin ID Token by generating a service-account signed Custom Token
 * and exchanging it via Identity Toolkit REST API (signInWithCustomToken).
 * This token passes Realtime Database security rules as an authenticated admin user.
 */
export async function getFirebaseAdminIdToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAdminIdToken && cachedAdminIdToken.expiresAt > now + 60) {
    return cachedAdminIdToken.token;
  }

  const sa = getServiceAccount();
  if (!sa) {
    throw new Error('Service account credentials not configured in environment variables.');
  }

  const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_FIREBASE_API_KEY not configured in environment variables.');
  }

  const alg = 'RS256';
  const privateKey = await importPKCS8(sa.privateKey, alg);

  const customToken = await new SignJWT({
    uid: 'admin-server-bot',
    claims: { role: 'admin', admin: true },
  })
    .setProtectedHeader({ alg })
    .setIssuer(sa.clientEmail)
    .setSubject(sa.clientEmail)
    .setAudience(sa.projectId)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: customToken,
      returnSecureToken: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange custom token for ID token: ${errorText}`);
  }

  const data = await response.json();
  cachedAdminIdToken = {
    token: data.idToken,
    expiresAt: now + (data.expiresIn ? parseInt(data.expiresIn, 10) : 3600),
  };

  return data.idToken;
}

