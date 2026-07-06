import { NextResponse } from "next/server";
import { prisma, getUserRole } from "@localfirst/db";
import { getCurrentUser } from "@/lib/session";
import * as Y from "yjs";

function generateMockSummary(xmlText: string) {
  // Strip XML/HTML tags
  const clean = xmlText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  return `### Document Summary (Fallback Mode)

This mock summary has been generated because no \`OPENROUTER_API_KEY\` environment variable was found.

* **Length:** ${wordCount} words (${xmlText.length} characters).
* **Snippet:** "${clean.slice(0, 150)}${clean.length > 150 ? "..." : ""}"
* **Recommendation:** Define \`OPENROUTER_API_KEY\` in your \`.env.local\` to activate the live OpenRouter AI summarization model.`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getUserRole(user.id, id);
    if (!role) {
      return NextResponse.json(
        { error: "Forbidden: no access to this document" },
        { status: 403 },
      );
    }

    // Load Yjs state from DB
    const doc = await prisma.document.findUnique({
      where: { id },
      select: { yjsState: true },
    });

    if (!doc || !doc.yjsState) {
      return NextResponse.json(
        { error: "Document has no content to summarize" },
        { status: 400 },
      );
    }

    // Decode Yjs state and extract text
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(doc.yjsState));
    const text = ydoc.getXmlFragment("content").toString();

    if (!text.replace(/<[^>]*>/g, "").trim()) {
      return NextResponse.json(
        { error: "Document is empty" },
        { status: 400 },
      );
    }

    // Retrieve user settings from database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { openRouterApiKey: true, openRouterModel: true },
    });

    const apiKey = dbUser?.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    const model = dbUser?.openRouterModel || process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

    if (!apiKey) {
      return NextResponse.json({ summary: generateMockSummary(text) });
    }

    // Call OpenRouter API using OpenAI Chat Completion shape
    const openrouterUrl = "https://openrouter.ai/api/v1/chat/completions";

    const response = await fetch(openrouterUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Local-First Editor",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: `You are an AI assistant helping summarize a collaborative document.
Summarize the following document content in a concise, bulleted format.
Structure the summary with a short overall summary paragraph followed by 3-5 key bullet points.
Document content (XML/HTML format):
${text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(
        `OpenRouter API failed with status ${response.status}:`,
        await response.text(),
      );
      return NextResponse.json({ summary: generateMockSummary(text) });
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content;

    if (!summary) {
      return NextResponse.json({ summary: generateMockSummary(text) });
    }

    return NextResponse.json({ summary });
  } catch (e) {
    console.error("AI Summarizer route error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
