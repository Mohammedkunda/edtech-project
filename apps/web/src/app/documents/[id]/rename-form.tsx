"use client";

import { useActionState } from "react";
import { renameDocumentAction } from "../actions";
import { Button } from "@/components/ui/button";

export function RenameForm({
  documentId,
  title,
}: {
  documentId: string;
  title: string;
}) {
  const [state, formAction, pending] = useActionState(
    renameDocumentAction.bind(null, documentId),
    undefined,
  );

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} className="flex items-end gap-2">
        <input
          name="title"
          defaultValue={title}
          aria-label="Document title"
          className="flex-1 rounded-lg border border-transparent border-b-border bg-transparent px-1 py-1 text-2xl font-semibold outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
          required
          maxLength={200}
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
      {state?.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
