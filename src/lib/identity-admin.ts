import { SignJWT, importPKCS8 } from 'jose';

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function getServiceAccount(): ServiceAccount | null {
  // Runtime preference: a single FIREBASE_SERVICE_ACCOUNT JSON blob is the
  // authoritative credential source — it avoids the escape/whitespace pitfalls
  // of the split FIREBASE_PRIVATE_KEY env var. Fall back to split keys only if
  // the blob is absent.
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const raw = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (raw.project_id || raw.client_email || raw.private_key) {
        return {
          projectId: raw.project_id || raw.projectId,
          clientEmail: raw.client_email || raw.clientEmail,
          privateKey: raw.private_key || raw.privateKey,
        };
      }
    } catch (e) {
      console.warn('[IDENTITY ADMIN] Failed to parse FIREBASE_SERVICE_ACCOUNT json');
    }
  }

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

  return null;
}

let cachedAdminIdToken: { token: string; expiresAt: number } | null = null;

interface CachedAccessToken {
  token: string;
  expiresAt: number;
}
let cachedAccessToken: CachedAccessToken | null = null;

/**
 * Mint a short-lived Google OAuth2 ACCESS token signed with the service
 * account's private key. This is what the Identity Toolkit Admin REST API
 * (accounts:update — used to set custom claims) requires. The Firebase ID
 * token returned by getFirebaseAdminIdToken() is NOT accepted there.
 */
export async function getFirebaseAdminAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const sa = getServiceAccount();
  if (!sa) {
    throw new Error('Service account credentials not configured in environment variables.');
  }

  const alg = 'RS256';
  const privateKey = await importPKCS8(sa.privateKey, alg);

  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/identitytoolkit' })
    .setProtectedHeader({ alg })
    .setIssuer(sa.clientEmail)
    .setSubject(sa.clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange service-account JWT for access token: ${errorText}`);
  }

  const data = await response.json();
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in) || 3600),
  };

  return data.access_token;
}

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
    .setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit')
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

