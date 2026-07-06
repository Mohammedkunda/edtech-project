import * as Y from "yjs";
import { prisma } from "@localfirst/db";

type DocEntry = {
  ydoc: Y.Doc;
  saveTimeout: ReturnType<typeof setTimeout> | null;
};

/**
 * Manages server-authoritative Yjs documents, one per document ID.
 * Loads current state from Postgres on first access and debounced-saves
 * after every update so state survives server restarts.
 */
export class DocManager {
  private docs = new Map<string, DocEntry>();

  async getDoc(docId: string): Promise<Y.Doc> {
    const existing = this.docs.get(docId);
    if (existing) return existing.ydoc;

    const ydoc = new Y.Doc();

    // Cache immediately so concurrent callers share the same Y.Doc
    // even while the initial DB load is still in-flight.
    const entry: DocEntry = { ydoc, saveTimeout: null };
    this.docs.set(docId, entry);

    // Load the persisted Yjs state (if any) into the fresh doc.
    try {
      const doc = await prisma.document.findUnique({
        where: { id: docId },
        select: { yjsState: true },
      });
      if (doc?.yjsState) {
        Y.applyUpdate(ydoc, new Uint8Array(doc.yjsState));
      }
    } catch (e) {
      console.error(`[doc-manager] failed to load ${docId}:`, e);
    }

    // Debounced save: flush the current state to Postgres 5 s after the last edit.
    ydoc.on("update", () => {
      if (entry.saveTimeout) clearTimeout(entry.saveTimeout);
      entry.saveTimeout = setTimeout(() => this.save(docId, entry), 5_000);
    });

    return ydoc;
  }

  private async save(docId: string, entry: DocEntry): Promise<void> {
    try {
      const state = Y.encodeStateAsUpdate(entry.ydoc);
      await prisma.document.update({
        where: { id: docId },
        data: { yjsState: Buffer.from(state) },
      });
      entry.saveTimeout = null;
    } catch (e) {
      console.error(`[doc-manager] failed to save ${docId}:`, e);
    }
  }

  async logAudit(
    docId: string,
    userId: string,
    sizeBytes: number,
    accepted: boolean,
    reason: string | null,
  ): Promise<void> {
    try {
      await prisma.syncAuditLog.create({
        data: {
          documentId: docId,
          userId,
          payloadSizeBytes: sizeBytes,
          accepted,
          rejectionReason: reason,
        },
      });
    } catch {
      // Best-effort; never let audit logging break the sync path.
    }
  }

  async shutdown(): Promise<void> {
    for (const [docId, entry] of this.docs) {
      if (entry.saveTimeout) clearTimeout(entry.saveTimeout);
      await this.save(docId, entry);
      entry.ydoc.destroy();
    }
    this.docs.clear();
    await prisma.$disconnect();
  }
}
