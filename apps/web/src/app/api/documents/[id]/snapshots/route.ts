import { NextResponse } from "next/server";
import * as docs from "@/lib/documents";
import { DocsError } from "@/lib/documents";
import { createSnapshotSchema } from "@/lib/validations";

function errorResponse(e: unknown) {
  if (e instanceof DocsError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const snapshots = await docs.listSnapshots(id);
    return NextResponse.json({ snapshots });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = createSnapshotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 },
      );
    }
    const snapshot = await docs.createSnapshot(
      id,
      parsed.data.label,
      parsed.data.yjsState,
    );
    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
