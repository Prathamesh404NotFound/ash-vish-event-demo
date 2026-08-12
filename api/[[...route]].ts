// Vercel serverless entry: mount the full Express application under /api.
// Lazy-loaded on first request so module-load crashes are catchable and
// returned as JSON diagnostics instead of FUNCTION_INVOCATION_FAILED.
import type { IncomingMessage, ServerResponse } from "http";

type AppLike = { handle: (req: any, res: any, next?: any) => void };

let appPromise: Promise<AppLike> | null = null;
let loadError: Error | null = null;

function loadApp(): Promise<AppLike> {
  if (appPromise) return appPromise;
  if (loadError) return Promise.reject(loadError);
  // The .js extension is required: Vercel's build compiles this file to CJS
  // at /var/task/api/[[...route]].js, where extensionless dynamic imports of
  // ../server fail with ERR_MODULE_NOT_FOUND (built output is server.js).
  appPromise = import("../server.js")
    .then((mod) => (mod as any).createApp())
    .catch((err) => {
      loadError = err;
      return Promise.reject(err);
    });
  return appPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    const app = await loadApp();
    return app.handle(req, res);
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        error: "Server initialization failed",
        detail: err?.message || String(err),
        stack: err?.stack || null,
      })
    );
  }
}
