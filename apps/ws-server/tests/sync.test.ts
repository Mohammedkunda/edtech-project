import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import { handleConnection } from "../src/connection";
import { DocManager } from "../src/doc-manager";
import { prisma } from "@localfirst/db";
import * as jose from "jose";

const PORT = 8585;
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-jwt-secret-change-me-please",
);

async function signSyncToken(
  userId: string,
  documentId: string,
  role: string,
): Promise<string> {
  return new jose.SignJWT({ userId, documentId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .setIssuedAt()
    .sign(secret);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

describe("Websocket Sync Integration Tests", () => {
  let wss: WebSocketServer;
  let docManager: DocManager;
  let testUserOwner: any;
  let testUserEditor: any;
  let testUserViewer: any;
  let testDoc: any;

  beforeAll(async () => {
    // Start WS Server on test port
    docManager = new DocManager();
    wss = new WebSocketServer({ port: PORT });
    wss.on("connection", (ws, req) => handleConnection(ws, req, docManager));

    // Create test database users and document
    testUserOwner = await prisma.user.create({
      data: { email: `owner-${Date.now()}@example.com`, name: "Owner User" },
    });
    testUserEditor = await prisma.user.create({
      data: { email: `editor-${Date.now()}@example.com`, name: "Editor User" },
    });
    testUserViewer = await prisma.user.create({
      data: { email: `viewer-${Date.now()}@example.com`, name: "Viewer User" },
    });

    testDoc = await prisma.document.create({
      data: {
        title: "Test Sync Doc",
        ownerId: testUserOwner.id,
      },
    });

    // Setup accesses
    await prisma.documentAccess.createMany({
      data: [
        { documentId: testDoc.id, userId: testUserOwner.id, role: "owner" },
        { documentId: testDoc.id, userId: testUserEditor.id, role: "editor" },
        { documentId: testDoc.id, userId: testUserViewer.id, role: "viewer" },
      ],
    });
  });

  afterAll(async () => {
    // Close WS Server and shutdown docManager first to save document updates if any
    wss.close();
    await docManager.shutdown();

    // Now cleanup DB records
    await prisma.documentAccess.deleteMany({ where: { documentId: testDoc.id } });
    await prisma.documentSnapshot.deleteMany({ where: { documentId: testDoc.id } });
    await prisma.syncAuditLog.deleteMany({ where: { documentId: testDoc.id } });
    await prisma.document.delete({ where: { id: testDoc.id } });
    await prisma.user.deleteMany({
      where: {
        id: { in: [testUserOwner.id, testUserEditor.id, testUserViewer.id] },
      },
    });
  });

  // Helper to connect a test client
  const connectTestClient = (
    token: string,
    docId: string,
    ydoc: Y.Doc,
  ): Promise<{ ws: WebSocket; messages: any[]; cleanUp: () => void }> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${PORT}?token=${token}&docId=${docId}`);
      const messages: any[] = [];
      let resolved = false;

      const unbind = () => {
        ydoc.off("update", handleLocalUpdate);
      };

      const handleLocalUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin === "sync") return;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "update",
              documentId: docId,
              update: toBase64(update),
              clientId: ydoc.clientID,
              seq: 0,
            }),
          );
        }
      };

      // Listen for local changes to send to server
      ydoc.on("update", handleLocalUpdate);

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          messages.push(msg);

          switch (msg.type) {
            case "sync-step1": {
              // Server sent its state vector; client responds with what server is missing
              const serverSV = fromBase64(msg.stateVector);
              const diff = Y.encodeStateAsUpdate(ydoc, serverSV);
              ws.send(
                JSON.stringify({
                  type: "sync-step2",
                  documentId: docId,
                  update: toBase64(diff),
                }),
              );
              break;
            }
            case "sync-step2": {
              // Server sent client's missing parts; apply them
              const update = fromBase64(msg.update);
              Y.applyUpdate(ydoc, update, "sync");
              break;
            }
            case "update": {
              // Server broadcast live edit from another client
              const update = fromBase64(msg.update);
              Y.applyUpdate(ydoc, update, "sync");
              break;
            }
            case "auth-ok": {
              // Connection auth approved
              const sv = Y.encodeStateVector(ydoc);
              ws.send(
                JSON.stringify({
                  type: "sync-step1",
                  documentId: docId,
                  stateVector: toBase64(sv),
                }),
              );
              break;
            }
          }
        } catch (e) {
          reject(e);
        }
      });

      ws.on("open", () => {
        // Handshake starts after auth-ok
      });

      ws.on("error", (err) => {
        unbind();
        reject(err);
      });

      // Give 250ms for initial sync handshake to resolve
      setTimeout(() => {
        resolved = true;
        resolve({ ws, messages, cleanUp: () => { unbind(); ws.close(); } });
      }, 250);
    });
  };

  it("should successfully authenticate and complete sync handshake", async () => {
    const ownerYdoc = new Y.Doc();
    // Insert initial text locally
    const text = ownerYdoc.getText("content");
    text.insert(0, "Hello from Owner!");

    const token = await signSyncToken(testUserOwner.id, testDoc.id, "owner");
    const { messages, cleanUp } = await connectTestClient(token, testDoc.id, ownerYdoc);

    // Verify messages received in handshake
    expect(messages.some((m) => m.type === "auth-ok")).toBe(true);
    expect(messages.some((m) => m.type === "sync-step1")).toBe(true);

    cleanUp();
  });

  it("should reject viewer role writes over WebSocket", async () => {
    const viewerYdoc = new Y.Doc();
    const token = await signSyncToken(testUserViewer.id, testDoc.id, "viewer");
    const { ws, messages, cleanUp } = await connectTestClient(token, testDoc.id, viewerYdoc);

    // Attempt a viewer write
    const testUpdate = Y.encodeStateAsUpdate(viewerYdoc);
    ws.send(
      JSON.stringify({
        type: "update",
        documentId: testDoc.id,
        update: toBase64(testUpdate),
        clientId: viewerYdoc.clientID,
        seq: 1,
      }),
    );

    // Wait for server response
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(messages.some((m) => m.type === "error" && m.code === 403)).toBe(true);

    // Check that DB log has logged a rejected audit entry
    const auditLogs = await prisma.syncAuditLog.findMany({
      where: { documentId: testDoc.id, userId: testUserViewer.id },
    });
    expect(auditLogs.some((log) => !log.accepted && log.rejectionReason?.includes("viewer"))).toBe(true);

    cleanUp();
  });

  it("should reconcile edits made independently while offline", async () => {
    // 1. Setup independent client docs
    const clientA = new Y.Doc();
    const clientB = new Y.Doc();

    // 2. Perform concurrent offline changes
    const textA = clientA.getText("content");
    textA.insert(0, "Owner prefix: ");

    const textB = clientB.getText("content");
    textB.insert(0, "Editor suffix");

    // 3. Connect Client A
    const tokenA = await signSyncToken(testUserOwner.id, testDoc.id, "owner");
    const clientAConn = await connectTestClient(tokenA, testDoc.id, clientA);

    // 4. Connect Client B
    const tokenB = await signSyncToken(testUserEditor.id, testDoc.id, "editor");
    const clientBConn = await connectTestClient(tokenB, testDoc.id, clientB);

    // Give time for live updates to propagate after sync
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 5. Assert convergence: client A and B must converge on the exact same content!
    const finalContentA = textA.toString();
    const finalContentB = textB.toString();

    expect(finalContentA).toBe(finalContentB);
    expect(finalContentA).toContain("Owner prefix");
    expect(finalContentA).toContain("Editor suffix");

    clientAConn.cleanUp();
    clientBConn.cleanUp();
  });

  it("should enforce payload cap and reject oversized updates", async () => {
    const ownerYdoc = new Y.Doc();
    const token = await signSyncToken(testUserOwner.id, testDoc.id, "owner");
    const { ws, messages, cleanUp } = await connectTestClient(token, testDoc.id, ownerYdoc);

    // Create a large payload (~300 KB, exceeds the 256 KB limit)
    const largeData = "x".repeat(300 * 1024);
    const text = ownerYdoc.getText("content");
    text.insert(0, largeData);

    const update = Y.encodeStateAsUpdate(ownerYdoc);

    ws.send(
      JSON.stringify({
        type: "update",
        documentId: testDoc.id,
        update: toBase64(update),
        clientId: ownerYdoc.clientID,
        seq: 1,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(messages.some((m) => m.type === "error" && m.code === 413)).toBe(true);

    cleanUp();
  });
});
