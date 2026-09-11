import app from "./app";
import { logger } from "./lib/logger";
import { runNpsSyncAll, runUsfsSyncAll, runYosemiteExampleSync } from "./routes/community";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Auto-import NPS and USFS trail data on startup. Each source skips
  // already-imported states, so restarts are safe and fast after the first
  // full run. Supportal and OSM/Overpass are started manually from the
  // Data Sources dashboard once NPS/USFS have completed.
  void runYosemiteExampleSync();
  void runNpsSyncAll();
  void runUsfsSyncAll();
});
