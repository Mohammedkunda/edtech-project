import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { handleConnection } from "./connection";
import { DocManager } from "./doc-manager";

// Load .env (Node 20.12+ built-in, no dotenv dep).
try {
  process.loadEnvFile();
} catch {
  /* no .env file — environment variables set externally */
}

// Most PaaS free tiers (Koyeb, Render, etc.) inject the port as PORT.
// Fall back to WS_PORT for local dev, then 8080 as a last resort.
const PORT = Number(process.env.PORT ?? process.env.WS_PORT ?? 8080);
const docManager = new DocManager();

// A plain HTTP server in front of the WS upgrade handler. This exists for
// two reasons: (1) hosting platforms (Render, Koyeb) poll a plain HTTP
// health-check path to decide if the service is up, and a bare
// WebSocketServer with only a `port` option never responds to ordinary
// GET requests — it just hangs; (2) an external keep-alive ping (see
// deployment notes) needs a real endpoint to hit to prevent the free
// instance from scaling to zero.
const httpServer = createServer((req, res) => {
  if (req.url === "/healthz" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });
wss.on("connection", (ws, req) => handleConnection(ws, req, docManager));

httpServer.listen(PORT, () => {
  console.log(`[ws-server] listening on :${PORT}`);
});

process.on("SIGINT", async () => {
  console.log("[ws-server] shutting down…");
  wss.close();
  httpServer.close();
  await docManager.shutdown();
  process.exit(0);
});
