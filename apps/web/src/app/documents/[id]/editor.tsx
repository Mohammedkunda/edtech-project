"use client";

import { useEffect, useRef, useState } from "react";
import {
  useEditor,
  EditorContent,
  type Editor as TiptapEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Collaboration } from "@tiptap/extension-collaboration";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { SyncProvider, type SyncStatus } from "@/lib/sync-provider";
import { VersionHistory } from "./version-history";


// ── Toolbar ──────────────────────────────────────────────────────────────────
function ToolbarBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-2 py-1 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: TiptapEditor }) {
  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b p-2"
      role="toolbar"
      aria-label="Text formatting"
    >
      <ToolbarBtn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolbarBtn>
      <ToolbarBtn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarBtn>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <ToolbarBtn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        H2
      </ToolbarBtn>
      <ToolbarBtn
        active={editor.isActive("heading", { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      >
        H3
      </ToolbarBtn>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <ToolbarBtn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </ToolbarBtn>
      <ToolbarBtn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </ToolbarBtn>
      <ToolbarBtn
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        Quote
      </ToolbarBtn>
      <ToolbarBtn
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        Code
      </ToolbarBtn>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <ToolbarBtn
        active={false}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        ―
      </ToolbarBtn>
    </div>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────
export function EditorPanel({
  documentId,
  readOnly,
}: {
  documentId: string;
  readOnly: boolean;
}) {
  const [dbSynced, setDbSynced] = useState(false);
  const [connStatus, setConnStatus] = useState<SyncStatus>("connecting");
  const ydocRef = useRef<Y.Doc>(null);
  if (!ydocRef.current) ydocRef.current = new Y.Doc();
  const ydoc = ydocRef.current!;

  // Create the Tiptap editor bound to the shared Yjs fragment.
  const editor = useEditor({
    extensions: [
      StarterKit,
      Collaboration.configure({ document: ydoc, field: "content" }),
    ],
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: "prose-editor min-h-[300px] p-4 focus:outline-none",
      },
    },
  });

  // IndexedDB persistence — the local-first store. Runs regardless of connectivity.
  useEffect(() => {
    const persistence = new IndexeddbPersistence(
      `yjs-doc-${documentId}`,
      ydoc,
    );
    persistence.on("synced", () => setDbSynced(true));
    return () => {
      persistence.destroy();
    };
  }, [documentId, ydoc]);

  // Realtime sync provider — connects to the WS server when online.
  useEffect(() => {
    let provider: SyncProvider | null = null;

    async function start() {
      try {
        const res = await fetch(`/api/sync-token?docId=${documentId}`);
        if (!res.ok) {
          setConnStatus("disconnected");
          return;
        }
        const { token } = (await res.json()) as { token: string };
        const wsUrl =
          process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";

        provider = new SyncProvider({
          documentId,
          ydoc,
          token,
          wsUrl,
          onStatus: setConnStatus,
        });
        provider.connect();
      } catch {
        setConnStatus("disconnected");
      }
    }

    start();

    return () => {
      provider?.destroy();
    };
  }, [documentId, ydoc]);

  // Keep editable flag in sync with the role.
  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  const statusLabel =
    connStatus === "connected"
      ? "Synced"
      : connStatus === "connecting"
        ? "Connecting…"
        : "Offline — edits saved locally";

  return (
    <div className="flex flex-col rounded-lg border">
      {editor && !readOnly && <Toolbar editor={editor} />}

      <div className="relative flex-1">
        {!dbSynced && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-sm text-muted-foreground">
            Loading from local storage…
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      <div className="flex items-center justify-between border-t px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          {readOnly
            ? "Read-only mode (viewer)"
            : "Editing — changes saved locally"}
        </span>
        <div className="flex items-center gap-3">
          <span
            className={
              connStatus === "connected"
                ? "text-green-600"
                : connStatus === "connecting"
                  ? "text-yellow-600"
                  : "text-muted-foreground"
            }
          >
            {statusLabel}
          </span>
          <span className="h-3 w-px bg-border" aria-hidden />
          <VersionHistory
            documentId={documentId}
            ydoc={ydoc}
            mainEditor={editor}
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  );
}
