const DEFAULT_DB_URL = "https://ashevents-aa490-default-rtdb.asia-southeast1.firebasedatabase.app";

export interface RTDBResponse<T = any> {
  data: T | null;
  etag?: string | null;
  status: number;
}

export class RTDBError extends Error {
  constructor(message: string, public status: number, public path: string) {
    super(`RTDB Error [${status}] at path '${path}': ${message}`);
    this.name = 'RTDBError';
  }
}

function getDatabaseUrl(): string {
  return process.env.FIREBASE_DATABASE_URL || DEFAULT_DB_URL;
}

function formatPath(path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${getDatabaseUrl()}/${cleanPath}.json`;
}

/**
 * Builds request headers and parameters for RTDB REST requests.
 */
function buildUrl(path: string, authToken?: string): string {
  const urlStr = formatPath(path);
  if (!authToken) return urlStr;
  
  // If authToken starts with 'ya29.', it's a Google OAuth2 access token
  const param = authToken.startsWith('ya29.') ? 'access_token' : 'auth';
  return `${urlStr}?${param}=${encodeURIComponent(authToken)}`;
}

/**
 * GET data from RTDB via REST API
 */
export async function rtdbGet<T = any>(path: string, authToken?: string): Promise<RTDBResponse<T>> {
  const url = buildUrl(path, authToken);
  const response = await fetch(url, {
    headers: {
      'X-Firebase-ETag': 'true'
    }
  });

  const etag = response.headers.get('ETag') || response.headers.get('etag');

  if (!response.ok) {
    const errText = await response.text();
    throw new RTDBError(errText || response.statusText, response.status, path);
  }

  const data = await response.json();
  
  // Check RTDB error response format (sometimes returns 200 with error object)
  if (data && typeof data === 'object' && 'error' in data) {
    throw new RTDBError(data.error, response.status, path);
  }

  return { data, etag, status: response.status };
}

/**
 * SET (PUT) data in RTDB via REST API
 */
export async function rtdbSet<T = any>(path: string, value: any, authToken?: string, etag?: string): Promise<T> {
  const url = buildUrl(path, authToken);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (etag) {
    headers['if-match'] = etag;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(value),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new RTDBError(errText || response.statusText, response.status, path);
  }

  const data = await response.json();
  if (data && typeof data === 'object' && 'error' in data) {
    throw new RTDBError(data.error, response.status, path);
  }

  return data;
}

/**
 * UPDATE (PATCH) data in RTDB via REST API
 */
export async function rtdbUpdate<T = any>(path: string, value: any, authToken?: string): Promise<T> {
  const url = buildUrl(path, authToken);
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new RTDBError(errText || response.statusText, response.status, path);
  }

  const data = await response.json();
  if (data && typeof data === 'object' && 'error' in data) {
    throw new RTDBError(data.error, response.status, path);
  }

  return data;
}

/**
 * PUSH (POST) data into a list in RTDB via REST API
 */
export async function rtdbPush(path: string, value: any, authToken?: string): Promise<{ name: string }> {
  const url = buildUrl(path, authToken);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new RTDBError(errText || response.statusText, response.status, path);
  }

  const data = await response.json();
  if (data && typeof data === 'object' && 'error' in data) {
    throw new RTDBError(data.error, response.status, path);
  }

  return data; // Returns { name: "-Nxyz..." }
}

/**
 * DELETE data in RTDB via REST API
 */
export async function rtdbDelete(path: string, authToken?: string): Promise<void> {
  const url = buildUrl(path, authToken);
  const response = await fetch(url, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new RTDBError(errText || response.statusText, response.status, path);
  }
}

/**
 * Executes a transaction using optimistic concurrency via ETags.
 * Retries up to maxRetries times if 412 Precondition Failed occurs.
 */
export async function rtdbTransaction<T = any>(
  path: string,
  updateFn: (currentValue: T | null) => T | undefined,
  authToken?: string,
  maxRetries = 5
): Promise<{ committed: boolean; snapshot: T | null }> {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const { data: currentData, etag } = await rtdbGet<T>(path, authToken);
      const updatedValue = updateFn(currentData);

      if (updatedValue === undefined) {
        // Aborted transaction
        return { committed: false, snapshot: currentData };
      }

      const result = await rtdbSet(path, updatedValue, authToken, etag || undefined);
      return { committed: true, snapshot: result };
    } catch (err: any) {
      if (err instanceof RTDBError && err.status === 412) {
        // ETag mismatch / concurrent write collision - retry
        console.warn(`[RTDB TRANSACTION RETRY] Concurrent collision at '${path}', attempt ${attempt}/${maxRetries}`);
        await new Promise((res) => setTimeout(res, 50 * attempt));
        continue;
      }
      throw err;
    }
  }

  return { committed: false, snapshot: null };
}
