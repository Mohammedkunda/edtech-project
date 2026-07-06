import { NextResponse } from "next/server";
import * as docs from "@/lib/documents";
import { DocsError } from "@/lib/documents";

function errorResponse(e: unknown) {
  if (e instanceof DocsError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { id, userId } = await params;
    await docs.revokeAccess(id, userId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
