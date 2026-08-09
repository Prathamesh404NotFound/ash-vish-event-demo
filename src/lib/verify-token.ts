import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

// Google's public keys for Firebase ID token verification
const JWKS_URL = new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');

// Remote JWK Set with automatic caching and key rotation
const remoteJWKS = createRemoteJWKSet(JWKS_URL);

export interface VerifiedFirebaseToken extends JWTPayload {
  uid: string;
  email?: string;
  email_verified?: boolean;
  role?: string;
}

export class TokenVerificationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'TokenVerificationError';
  }
}

/**
 * Verifies a Firebase ID token using Google's public JWKS.
 * Does not depend on the firebase-admin SDK.
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string = process.env.FIREBASE_PROJECT_ID || 'ashevents-aa490'
): Promise<VerifiedFirebaseToken> {
  if (!idToken || typeof idToken !== 'string') {
    throw new TokenVerificationError('ID token must be a non-empty string.', 'INVALID_ARGUMENT');
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;

  try {
    const { payload } = await jwtVerify(idToken, remoteJWKS, {
      issuer: expectedIssuer,
      audience: projectId,
    });

    const uid = payload.sub;
    if (!uid) {
      throw new TokenVerificationError('Decoded token lacks subject (sub) claim.', 'MISSING_SUB');
    }

    // Verify time claims
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp <= now) {
      throw new TokenVerificationError('Firebase ID token has expired.', 'TOKEN_EXPIRED');
    }
    if (payload.iat && payload.iat > now + 300) {
      // allow 5m clock skew
      throw new TokenVerificationError('Firebase ID token issued in the future.', 'FUTURE_TOKEN');
    }

    return {
      ...payload,
      uid,
      email: (payload.email as string) || undefined,
      email_verified: (payload.email_verified as boolean) || false,
      role: (payload.role as string) || undefined,
    };
  } catch (err: any) {
    if (err instanceof TokenVerificationError) {
      throw err;
    }
    throw new TokenVerificationError(`Token verification failed: ${err.message}`, 'VERIFICATION_FAILED');
  }
}
