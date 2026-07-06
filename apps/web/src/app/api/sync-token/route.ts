import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserRole } from "@localfirst/db";
import { signSyncToken } from "@/lib/sync-token";

/**
 * GET /api/sync-token?docId=...
 * Returns a short-lived JWT that the browser client uses to authenticate
 * with the standalone WS sync server.  Keeps the long-lived Auth.js session
 * cookie out of the WebSocket connection.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const docId = url.searchParams.get("docId");
  if (!docId) {
    return NextResponse.json({ error: "Missing docId parameter" }, { status: 400 });
  }

  const role = await getUserRole(session.user.id, docId);
  if (!role) {
    return NextResponse.json({ error: "No access to this document" }, { status: 403 });
  }

  const token = await signSyncToken(session.user.id, docId, role);
  return NextResponse.json({ token });
}
