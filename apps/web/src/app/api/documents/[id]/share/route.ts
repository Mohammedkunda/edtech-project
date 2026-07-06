import { NextResponse } from "next/server";
import * as docs from "@/lib/documents";
import { DocsError } from "@/lib/documents";
import { shareDocumentSchema } from "@/lib/validations";

function errorResponse(e: unknown) {
  if (e instanceof DocsError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = shareDocumentSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    const target = await docs.shareDocument(
      id,
      parsed.data.email,
      parsed.data.role,
    );
    return NextResponse.json({ sharedWith: target }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
