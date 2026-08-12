// Vercel serverless entry: mount the full Express application under /api.
// @vercel/node v3 supports default-exporting an Express app; it handles the
// request/response bridging automatically.
import { createApp } from "../server";

const appPromise = createApp();

// Register an explicit /api 404 catch-all so unmatched API paths return JSON
// instead of falling through to the static index.html handler.
appPromise.then((app) => {
  app.all("/api/*", (_req, res) => {
    res.status(404).json({ success: false, error: "API endpoint not found" });
  });
});

export default appPromise;
