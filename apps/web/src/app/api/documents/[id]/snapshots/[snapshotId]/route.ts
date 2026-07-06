import { NextResponse } from "next/server";
import * as docs from "@/lib/documents";
import { DocsError } from "@/lib/documents";

function errorResponse(e: unknown) {
  if (e instanceof DocsError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; snapshotId: string }> },
) {
  try {
    const { id, snapshotId } = await params;
    const snapshot = await docs.getSnapshot(id, snapshotId);

    // Convert Buffer to base64 for transmitting over JSON API
    const base64State = Buffer.from(snapshot.yjsState).toString("base64");

    return NextResponse.json({
      snapshot: {
        id: snapshot.id,
        label: snapshot.label,
        createdAt: snapshot.createdAt,
        createdBy: snapshot.createdBy,
        creator: snapshot.creator,
        yjsState: base64State,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
