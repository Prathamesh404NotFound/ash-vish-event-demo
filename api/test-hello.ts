// Minimal serverless smoke test: returns 200 JSON without loading any app code.
// If this ALSO returns FUNCTION_INVOCATION_FAILED, the problem is project-level
// configuration (e.g. the Node.js version setting in the Vercel dashboard),
// not the application code.
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, ts: new Date().toISOString() });
}
