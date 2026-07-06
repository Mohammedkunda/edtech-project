/**
 * End-to-end sync smoke test: two WS clients on the same document,
 * one sends an edit, the other receives and converges.
 *
 * Run: pnpm --filter ws-server tsx scripts/test-sync.ts
 * Requires: Postgres on :5433, WS server on :8080.
 */
import * as jose from "jose";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { prisma } from "@localfirst/db";
import { ROLE } from "@localfirst/shared";

try {
  process.loadEnvFile();
} catch {}

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me-please";
const WS_PORT = process.env.WS_PORT ?? "8080";

async function signToken(
  userId: string,
  docId: string,
  role: string,
): Promise<string> {
  return new jose.SignJWT({ userId, documentId: docId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

// ── Buffered WebSocket client ────────────────────────────────────────────────
// Buffers all incoming messages from the moment of construction, so no
// messages are lost between the 'open' event and the first `waitFor` call.
class TestClient {
  ws: WebSocket;
  private buffer: Record<string, unknown>[] = [];
  private waiters = new Map<
    string,
    { resolve: (m: Record<string, unknown>) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on("message", (data) => {
      const msg = JSON.parse(Buffer.from(data as Buffer).toString()) as Record<string, unknown>;
      const key = msg.type as string;
      const w = this.waiters.get(key);
      if (w) {
        this.waiters.delete(key);
        clearTimeout(w.timer);
        w.resolve(msg);
      } else {
        this.buffer.push(msg);
      }
    });
  }

  waitFor(type: string, timeout = 10_000): Promise<Record<string, unknown>> {
    // Check if the message was already buffered.
    const idx = this.buffer.findIndex((m) => m.type === type);
    if (idx >= 0) {
      return Promise.resolve(this.buffer.splice(idx, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout waiting for "${type}"`)),
        timeout,
      );
      this.waiters.set(type, { resolve, timer });
    });
  }

  send(data: Record<string, unknown>) {
    this.ws.send(JSON.stringify(data));
  }

  close() {
    this.ws.close();
  }

  async waitOpen(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.on("open", () => resolve());
      this.ws.on("error", reject);
    });
  }
}

async function syncHandshake(
  client: TestClient,
  docId: string,
  ydoc: Y.Doc,
): Promise<void> {
  const auth = await client.waitFor("auth-ok");
  console.log(`  auth-ok (role=${auth.role})`);

  // Server sends its state vector
  const sv1 = await client.waitFor("sync-step1");
  const serverSV = new Uint8Array(Buffer.from(sv1.stateVector as string, "base64"));
  const diff = Y.encodeStateAsUpdate(ydoc, serverSV);
  client.send({
    type: "sync-step2",
    documentId: docId,
    update: Buffer.from(diff).toString("base64"),
  });

  // Send our state vector
  client.send({
    type: "sync-step1",
    documentId: docId,
    stateVector: Buffer.from(Y.encodeStateVector(ydoc)).toString("base64"),
  });

  // Server sends what we're missing
  const step2 = await client.waitFor("sync-step2");
  const serverDiff = new Uint8Array(Buffer.from(step2.update as string, "base64"));
  if (serverDiff.length > 2) {
    Y.applyUpdate(ydoc, serverDiff, "sync");
  }
  console.log("  sync complete");
}

async function main() {
  // ── Create test user + document ──────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: "sync-test@example.com" },
    update: {},
    create: {
      email: "sync-test@example.com",
      name: "Sync Test",
      passwordHash: "unused",
    },
  });

  const doc = await prisma.document.create({
    data: {
      title: "WS Sync Test",
      ownerId: user.id,
      access: { create: { userId: user.id, role: ROLE.OWNER } },
    },
  });
  console.log(`Created doc ${doc.id}`);

  const token = await signToken(user.id, doc.id, ROLE.OWNER);
  const base = `ws://localhost:${WS_PORT}?token=${encodeURIComponent(token)}&docId=${doc.id}`;

  // ── Connect two clients ──────────────────────────────────────────────────
  const c1 = new TestClient(base);
  const c2 = new TestClient(base);
  await Promise.all([c1.waitOpen(), c2.waitOpen()]);
  console.log("Both clients connected");

  const ydoc1 = new Y.Doc();
  const ydoc2 = new Y.Doc();

  console.log("Client 1 handshake:");
  await syncHandshake(c1, doc.id, ydoc1);
  console.log("Client 2 handshake:");
  await syncHandshake(c2, doc.id, ydoc2);

  // ── Client 1 inserts text ────────────────────────────────────────────────
  ydoc1.getText("content").insert(0, "Hello from client 1");
  const update = Y.encodeStateAsUpdate(ydoc1);
  c1.send({
    type: "update",
    documentId: doc.id,
    update: Buffer.from(update).toString("base64"),
    clientId: 0,
    seq: 0,
  });
  console.log("\nClient 1 sent update");

  await c1.waitFor("ack");
  console.log("Client 1 got ack");

  // ── Client 2 receives and applies ────────────────────────────────────────
  const updateMsg = await c2.waitFor("update", 10_000);
  const received = new Uint8Array(Buffer.from(updateMsg.update as string, "base64"));
  Y.applyUpdate(ydoc2, received, "sync");
  const result = ydoc2.getText("content").toString();

  console.log(`Client 2 received → "${result}"`);

  // ── Verify ───────────────────────────────────────────────────────────────
  if (result === "Hello from client 1") {
    console.log("\n✓ SYNC TEST PASSED — both clients converged.");
  } else {
    console.error(`\n✗ FAILED — expected "Hello from client 1", got "${result}"`);
    process.exit(1);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  c1.close();
  c2.close();
  await prisma.document.delete({ where: { id: doc.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
