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

const wss = new WebSocketServer({ port: PORT });
wss.on("connection", (ws, req) => handleConnection(ws, req, docManager));

console.log(`[ws-server] listening on :${PORT}`);

process.on("SIGINT", async () => {
  console.log("[ws-server] shutting down…");
  wss.close();
  await docManager.shutdown();
  process.exit(0);
});
