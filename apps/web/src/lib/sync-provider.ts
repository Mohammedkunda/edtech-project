"use client";

import * as Y from "yjs";
import { SYNC_DEBOUNCE_MS } from "@localfirst/shared";

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
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export type SyncStatus = "connecting" | "connected" | "disconnected";

/**
 * Lightweight client-side sync provider.
 * Connects to the WS server, exchanges Yjs state vectors, and relays
 * live edits bidirectionally.  Uses a debounced outbox for local edits
 * (plan §6.1 — batch rapid keystrokes into a single message).
 */
export class SyncProvider {
  private ws: WebSocket | null = null;
  private ydoc: Y.Doc;
  private documentId: string;
  private token: string;
  private wsUrl: string;
  private seq = 0;
  private updateBuffer: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private onStatus?: (s: SyncStatus) => void;
  private onUpdateUnbind?: () => void;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(opts: {
    documentId: string;
    ydoc: Y.Doc;
    token: string;
    wsUrl: string;
    onStatus?: (s: SyncStatus) => void;
  }) {
    this.documentId = opts.documentId;
    this.ydoc = opts.ydoc;
    this.token = opts.token;
    this.wsUrl = opts.wsUrl;
    this.onStatus = opts.onStatus;
  }

  connect() {
    if (this.destroyed) return;
    this.setStatus("connecting");

    const url =
      `${this.wsUrl}?token=${encodeURIComponent(this.token)}` +
      `&docId=${encodeURIComponent(this.documentId)}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.setStatus("connected");
    };

    this.ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      this.setStatus("disconnected");
      this.unbindYdoc();
      // Simple reconnect with back-off (full offline reconciliation is milestone 6).
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3_000);
      }
    };

    this.ws.onerror = () => {
      /* onclose fires right after */
    };

    // Listen for local Yjs updates and buffer them.
    const handler = (update: Uint8Array, origin: unknown) => {
      if (origin === "sync") return; // skip server-originated updates
      this.updateBuffer.push(update);
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(
          () => this.flush(),
          SYNC_DEBOUNCE_MS,
        );
      }
    };
    this.ydoc.on("update", handler);
    this.onUpdateUnbind = () => this.ydoc.off("update", handler);
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.unbindYdoc();
    this.ws?.close();
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private setStatus(s: SyncStatus) {
    this.onStatus?.(s);
  }

  private unbindYdoc() {
    this.onUpdateUnbind?.();
    this.onUpdateUnbind = undefined;
  }

  private send(data: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private flush() {
    if (this.updateBuffer.length === 0) return;
    const merged = Y.mergeUpdates(this.updateBuffer);
    this.updateBuffer = [];
    this.flushTimer = null;
    this.send({
      type: "update",
      documentId: this.documentId,
      update: toBase64(merged),
      clientId: 0,
      seq: this.seq++,
    });
  }

  private handleMessage(msg: Record<string, unknown>) {
    switch (msg.type) {
      case "auth-ok":
        // Server confirmed our role; send our state vector to start the sync.
        {
          const sv = Y.encodeStateVector(this.ydoc);
          this.send({
            type: "sync-step1",
            documentId: this.documentId,
            stateVector: toBase64(sv),
          });
        }
        break;

      case "sync-step1":
        // Server sent its state vector — respond with the diff.
        {
          const serverSV = fromBase64(msg.stateVector as string);
          const diff = Y.encodeStateAsUpdate(this.ydoc, serverSV);
          this.send({
            type: "sync-step2",
            documentId: this.documentId,
            update: toBase64(diff),
          });
        }
        break;

      case "sync-step2":
        // Server sent updates we're missing.
        Y.applyUpdate(this.ydoc, fromBase64(msg.update as string), "sync");
        break;

      case "update":
        // Regular live edit from another client.
        Y.applyUpdate(this.ydoc, fromBase64(msg.update as string), "sync");
        break;

      case "ack":
        // Server acknowledged our update.
        break;

      case "error":
        console.error(
          `[sync] server error ${(msg.code as number) ?? "?"}: ${msg.message}`,
        );
        break;
    }
  }
}
