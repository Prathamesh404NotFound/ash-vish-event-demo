// Shared RTDB admin helper: mints a custom token (same as the app server) and exchanges it for an ID token.
import { readFileSync } from "fs";
import { SignJWT, importPKCS8 } from "jose";

const ENV: Record<string, string> = {};
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/s);
  if (m) ENV[m[1]] = m[2].replace(/^"|"$/g, "");
}
export const unescape = (s: string) => s.replace(/\\n/g, "\n").replace(/\\"/g, '"');
export const sa = {
  type: "service_account",
  project_id: ENV.FIREBASE_PROJECT_ID,
  client_email: ENV.FIREBASE_CLIENT_EMAIL,
  private_key: unescape(ENV.FIREBASE_PRIVATE_KEY || ""),
};
export const DB_HOST = "https://ashevents-aa490-default-rtdb.asia-southeast1.firebasedatabase.app";

export async function adminIdToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const apiKey = ENV.VITE_FIREBASE_API_KEY || ENV.FIREBASE_API_KEY;
  if (!apiKey) throw new Error("API key missing");
  const customToken = await new SignJWT({ uid: "admin-server-bot", claims: { role: "admin", admin: true } })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(sa.private_key, "RS256"));
  const ex = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const id = await ex.json();
  if (!id.idToken) throw new Error("idToken exchange failed: " + JSON.stringify(id));
  return id.idToken;
}
