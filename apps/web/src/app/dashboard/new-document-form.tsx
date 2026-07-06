"use client";

import { useActionState } from "react";
import { createDocumentAction } from "@/app/documents/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewDocumentForm() {
  const [state, formAction, pending] = useActionState(
    createDocumentAction,
    undefined,
  );

  return (
    <div className="flex flex-col gap-2">
      <form
        action={formAction}
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="title" className="sr-only">
            Document title
          </Label>
          <Input
            id="title"
            name="title"
            placeholder="New document title…"
            required
            maxLength={200}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "New document"}
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
