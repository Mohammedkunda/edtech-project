"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import * as Y from "yjs";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Collaboration } from "@tiptap/extension-collaboration";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { History, Save, RotateCcw, Eye } from "lucide-react";

// Base64 helpers for Yjs update transmission
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

type Snapshot = {
  id: string;
  label: string | null;
  createdAt: string;
  createdBy: string;
  creator: {
    name: string | null;
    email: string;
  };
};

type VersionHistoryProps = {
  documentId: string;
  ydoc: Y.Doc;
  mainEditor: any;
  readOnly: boolean;
};

export function VersionHistory({
  documentId,
  ydoc,
  mainEditor,
  readOnly,
}: VersionHistoryProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [previewSnapshotId, setPreviewSnapshotId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Fetch snapshots
  const fetchSnapshots = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/snapshots`);
      if (!res.ok) throw new Error("Failed to fetch snapshots");
      const data = await res.json();
      setSnapshots(data.snapshots || []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load version history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSnapshots();
    }
  }, [open, documentId]);

  // Create snapshot (Save current version)
  const handleSaveVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setSaving(true);
    try {
      // Serialize current Yjs document state vector
      const currentUpdate = Y.encodeStateAsUpdate(ydoc);
      const yjsStateB64 = toBase64(currentUpdate);

      const res = await fetch(`/api/documents/${documentId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || undefined,
          yjsState: yjsStateB64,
        }),
      });

      if (!res.ok) throw new Error("Failed to save version");
      toast.success("Version saved successfully");
      setLabel("");
      fetchSnapshots();
    } catch (e) {
      console.error(e);
      toast.error("Failed to save version snapshot");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = (contentJson: any) => {
    if (!mainEditor || readOnly) return;
    try {
      // Apply the restore as a new transaction on the main editor
      mainEditor.commands.setContent(contentJson);
      toast.success("Document restored to version successfully");
      setPreviewSnapshotId(null);
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to restore document version");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <History className="h-3.5 w-3.5" />
              History
            </Button>
          }
        />
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              View past snapshots of this document. You can preview their contents or restore the document to that state.
            </DialogDescription>
          </DialogHeader>

          {/* Save Version Form (only for writers) */}
          {!readOnly && (
            <form onSubmit={handleSaveVersion} className="flex gap-2 border-b pb-4 mt-2">
              <Input
                placeholder="Name this version (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={saving}
                className="flex-1 text-xs"
              />
              <Button type="submit" disabled={saving || loading} size="sm" className="gap-1 text-xs">
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </form>
          )}

          {/* Snapshot Timeline list */}
          <ScrollArea className="flex-1 max-h-[40vh] mt-4 pr-3">
            {loading ? (
              <p className="text-center text-xs text-muted-foreground py-8">Loading history...</p>
            ) : snapshots.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">No saved versions found.</p>
            ) : (
              <div className="space-y-3">
                {snapshots.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card text-card-foreground shadow-sm gap-4"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold truncate">
                        {snapshot.label || "Unnamed snapshot"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(snapshot.createdAt).toLocaleString()} • {snapshot.creator.name || snapshot.creator.email}
                      </span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button
                        variant="secondary"
                        size="icon-sm"
                        onClick={() => setPreviewSnapshotId(snapshot.id)}
                        title="Preview Version"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Snapshot Preview Modal */}
      {previewSnapshotId && (
        <Dialog open={!!previewSnapshotId} onOpenChange={(o) => !o && setPreviewSnapshotId(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-6">
            <SnapshotPreview
              documentId={documentId}
              snapshotId={previewSnapshotId}
              onRestore={handleRestore}
              readOnly={readOnly}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

type SnapshotPreviewProps = {
  documentId: string;
  snapshotId: string;
  onRestore: (contentJson: any) => void;
  readOnly: boolean;
};

function SnapshotPreview({
  documentId,
  snapshotId,
  onRestore,
  readOnly,
}: SnapshotPreviewProps) {
  const [snapshotData, setSnapshotData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshotB64, setSnapshotB64] = useState<string | null>(null);

  // Initialize a fresh Yjs document for preview
  const previewYdoc = useMemo(() => new Y.Doc(), [snapshotId]);

  // Fetch the full snapshot state
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch(`/api/documents/${documentId}/snapshots/${snapshotId}`);
        if (!res.ok) throw new Error("Failed to load snapshot details");
        const data = await res.json();
        if (active) {
          setSnapshotData(data.snapshot);
          setSnapshotB64(data.snapshot.yjsState);
        }
      } catch (e) {
        console.error(e);
        toast.error("Failed to load version preview");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [documentId, snapshotId]);

  // Apply update to preview Ydoc
  useEffect(() => {
    if (snapshotB64) {
      try {
        const bytes = fromBase64(snapshotB64);
        Y.applyUpdate(previewYdoc, bytes);
      } catch (e) {
        console.error("Failed to apply snapshot update:", e);
      }
    }
  }, [snapshotB64, previewYdoc]);

  // Instantiate read-only Tiptap editor bound to preview Ydoc
  const previewEditor = useEditor(
    {
      extensions: [
        StarterKit,
        Collaboration.configure({ document: previewYdoc, field: "content" }),
      ],
      editable: false,
      editorProps: {
        attributes: {
          class:
            "prose-editor min-h-[300px] max-h-[50vh] overflow-y-auto p-4 focus:outline-none border rounded-lg bg-muted/20",
        },
      },
    },
    [previewYdoc],
  );

  if (loading) {
    return <p className="text-center text-sm text-muted-foreground py-16">Loading version details...</p>;
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span>Preview: {snapshotData?.label || "Unnamed snapshot"}</span>
        </DialogTitle>
        <DialogDescription>
          Showing document state from {snapshotData ? new Date(snapshotData.createdAt).toLocaleString() : ""} saved by {snapshotData?.creator.name || snapshotData?.creator.email}.
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 mt-2 min-h-[300px]">
        <EditorContent editor={previewEditor} />
      </div>

      <DialogFooter className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onRestore(null)}>
          Close Preview
        </Button>
        {!readOnly && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              if (previewEditor) {
                onRestore(previewEditor.getJSON());
              }
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore to this version
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
