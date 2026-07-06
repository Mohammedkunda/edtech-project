import { NextResponse } from "next/server";
import * as docs from "@/lib/documents";
import { DocsError } from "@/lib/documents";
import { createDocumentSchema } from "@/lib/validations";

function errorResponse(e: unknown) {
  if (e instanceof DocsError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET() {
  try {
    const documents = await docs.listDocumentsForUser();
    return NextResponse.json({ documents });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = createDocumentSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    const doc = await docs.createDocument(parsed.data.title);
    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
