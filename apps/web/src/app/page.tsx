import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { buttonVariants } from "@/components/ui/button";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start gap-6 p-8">
      <h1 className="text-3xl font-bold tracking-tight">
        Local-First Collaborative Editor
      </h1>
      <p className="text-muted-foreground">
        Works fully offline, syncs automatically on reconnect, and merges
        concurrent edits deterministically with a Yjs CRDT — no data lost, no
        last-write-wins.
      </p>
      <div className="flex gap-3">
        {user ? (
          <Link href="/dashboard" className={buttonVariants()}>
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link href="/login" className={buttonVariants()}>
              Sign in
            </Link>
            <Link
              href="/register"
              className={buttonVariants({ variant: "outline" })}
            >
              Register
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
