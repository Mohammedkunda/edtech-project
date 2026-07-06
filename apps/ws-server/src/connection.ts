import type { WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import * as Y from "yjs";
import {
  canWrite,
  MAX_YJS_UPDATE_BYTES,
  MAX_WS_MESSAGE_BYTES,
  RATE_LIMIT_UPDATES_PER_SEC,
  RATE_LIMIT_BURST,
  WS_MESSAGE_TYPE,
} from "@localfirst/shared";
import { verifySyncToken } from "./jwt";
import { clientMessageSchema } from "./messages";
import { RateLimiter } from "./rate-limiter";
import type { DocManager } from "./doc-manager";

function send(ws: WebSocket, data: object) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

export async function handleConnection(
  ws: WebSocket,
  req: IncomingMessage,
  docManager: DocManager,
) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const token = url.searchParams.get("token");
  const docId = url.searchParams.get("docId");

  if (!token || !docId) {
    send(ws, { type: "error", code: 400, message: "Missing token or docId" });
    ws.close();
    return;
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  const auth = await verifySyncToken(token);
  if (!auth || auth.documentId !== docId) {
    send(ws, { type: "error", code: 401, message: "Invalid or expired token" });
    ws.close();
    return;
  }

  const { userId, role } = auth;
  const isViewer = !canWrite(role as "owner" | "editor" | "viewer");
  const rateLimiter = new RateLimiter(RATE_LIMIT_UPDATES_PER_SEC, RATE_LIMIT_BURST);

  // ── Load authoritative Yjs doc ──────────────────────────────────────────
  const ydoc = await docManager.getDoc(docId);

  // Broadcast incoming Yjs updates to THIS client (skip own-originated edits).
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === ws) return; // don't echo the update back to its own sender
    send(ws, {
      type: WS_MESSAGE_TYPE.UPDATE,
      documentId: docId,
      update: Buffer.from(update).toString("base64"),
    });
  };
  ydoc.on("update", onUpdate);

  // ── Handshake ───────────────────────────────────────────────────────────
  send(ws, { type: WS_MESSAGE_TYPE.AUTH_OK, role });

  // Send our state vector so the client can compute what it's missing.
  const sv = Y.encodeStateVector(ydoc);
  send(ws, {
    type: WS_MESSAGE_TYPE.SYNC_STEP_1,
    documentId: docId,
    stateVector: Buffer.from(sv).toString("base64"),
  });

  // ── Message handler ─────────────────────────────────────────────────────
  ws.on("message", (data) => {
    const buf = Buffer.from(data as Buffer);
    // Hard frame limit before any parsing.
    if (buf.length > MAX_WS_MESSAGE_BYTES) {
      send(ws, { type: "error", code: 413, message: "Message too large" });
      docManager.logAudit(docId, userId, buf.length, false, "frame too large");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(buf.toString());
    } catch {
      send(ws, { type: "error", code: 400, message: "Invalid JSON" });
      return;
    }

    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      send(ws, {
        type: "error",
        code: 400,
        message: result.error.issues[0]?.message ?? "Invalid message",
      });
      docManager.logAudit(docId, userId, buf.length, false, "schema validation");
      return;
    }

    const msg = result.data;
    if (msg.documentId !== docId) {
      send(ws, { type: "error", code: 400, message: "documentId mismatch" });
      return;
    }

    switch (msg.type) {
      case WS_MESSAGE_TYPE.SYNC_STEP_1: {
        // Client sent its state vector — respond with what it's missing.
        const clientSV = new Uint8Array(
          Buffer.from(msg.stateVector, "base64"),
        );
        const diff = Y.encodeStateAsUpdate(ydoc, clientSV);
        send(ws, {
          type: WS_MESSAGE_TYPE.SYNC_STEP_2,
          documentId: docId,
          update: Buffer.from(diff).toString("base64"),
        });
        break;
      }

      case WS_MESSAGE_TYPE.SYNC_STEP_2: {
        // Client sent updates we requested — apply them.
        const update = new Uint8Array(Buffer.from(msg.update, "base64"));
        Y.applyUpdate(ydoc, update, ws);
        break;
      }

      case WS_MESSAGE_TYPE.UPDATE: {
        // Regular live edit from the client.
        if (isViewer) {
          send(ws, {
            type: "error",
            code: 403,
            message: "Read-only: viewers cannot edit",
          });
          docManager.logAudit(docId, userId, buf.length, false, "viewer write rejected");
          return;
        }

        if (!rateLimiter.allow(userId)) {
          send(ws, {
            type: "error",
            code: 429,
            message: "Rate limit exceeded",
          });
          docManager.logAudit(docId, userId, buf.length, false, "rate limit");
          return;
        }

        const decoded = Buffer.from(msg.update, "base64");
        if (decoded.length > MAX_YJS_UPDATE_BYTES) {
          send(ws, {
            type: "error",
            code: 413,
            message: `Update exceeds ${MAX_YJS_UPDATE_BYTES / 1024} KB limit`,
          });
          docManager.logAudit(docId, userId, decoded.length, false, "payload too large");
          return;
        }

        Y.applyUpdate(ydoc, new Uint8Array(decoded), ws);
        send(ws, { type: WS_MESSAGE_TYPE.ACK, documentId: docId });
        docManager.logAudit(docId, userId, decoded.length, true, null);
        break;
      }
    }
  });

  // ── Cleanup on disconnect ───────────────────────────────────────────────
  ws.on("close", () => {
    ydoc.off("update", onUpdate);
  });
}
