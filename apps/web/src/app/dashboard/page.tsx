import Link from "next/link";
import { listDocumentsForUser } from "@/lib/documents";
import { LogoutButton } from "./logout-button";
import { NewDocumentForm } from "./new-document-form";
import { AISettings } from "./ai-settings";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const documents = await listDocumentsForUser();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your documents</h1>
        <LogoutButton />
      </header>

      <NewDocumentForm />

      <AISettings />

      {documents.length === 0 ? (
        <p className="text-muted-foreground">
          No documents yet — create one above to get started.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex flex-col gap-1">
                <Link
                  href={`/documents/${d.id}`}
                  className="font-medium hover:underline"
                >
                  {d.title}
                </Link>
                <span className="text-xs text-muted-foreground">
                  Owner: {d.owner.name ?? d.owner.email} · Updated{" "}
                  {d.updatedAt.toLocaleString()}
                </span>
              </div>
              <Badge
                variant={
                  d.role === "owner"
                    ? "default"
                    : d.role === "editor"
                      ? "secondary"
                      : "outline"
                }
              >
                {d.role}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
