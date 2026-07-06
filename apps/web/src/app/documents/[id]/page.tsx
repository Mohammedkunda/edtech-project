import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocumentForUser, listCollaborators } from "@/lib/documents";
import { deleteDocumentAction, revokeAccessAction } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { RenameForm } from "./rename-form";
import { ShareDialog } from "./share-dialog";
import { EditorPanel } from "./editor";
import { AISummary } from "./ai-summary";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getDocumentForUser(id);
  if (!result) notFound();
  const { doc, role } = result;
  const collab = await listCollaborators(id);

  const canEdit = role === "owner" || role === "editor";
  const isOwner = role === "owner";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      {/* Header: back link + role badge */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          ← Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <AISummary documentId={doc.id} />
          <Badge
            variant={
              isOwner ? "default" : role === "editor" ? "secondary" : "outline"
            }
          >
            {role}
          </Badge>
        </div>
      </div>

      {/* Title: editable for owner/editor, static for viewer */}
      {canEdit ? (
        <RenameForm documentId={doc.id} title={doc.title} />
      ) : (
        <h1 className="text-2xl font-semibold">{doc.title}</h1>
      )}

      {/* Rich-text editor (Yjs + Tiptap + y-indexeddb, no network sync yet) */}
      <EditorPanel documentId={doc.id} readOnly={!canEdit} />

      {/* Collaborators */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Collaborators</h2>
        {collab && collab.collaborators.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-lg border">
            {collab.collaborators.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-4 p-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {c.name ?? c.email}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.email}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      c.role === "owner"
                        ? "default"
                        : c.role === "editor"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {c.role}
                  </Badge>
                  {isOwner && c.role !== "owner" && (
                    <form
                      action={revokeAccessAction.bind(null, doc.id, c.userId)}
                    >
                      <Button type="submit" variant="ghost" size="sm">
                        Revoke
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No collaborators.</p>
        )}
        {isOwner && <ShareDialog documentId={doc.id} />}
      </section>

      {/* Delete (owner only) */}
      {isOwner && (
        <section className="flex justify-end">
          <form action={deleteDocumentAction.bind(null, doc.id)}>
            <Button type="submit" variant="destructive" size="sm">
              Delete document
            </Button>
          </form>
        </section>
      )}
    </main>
  );
}
