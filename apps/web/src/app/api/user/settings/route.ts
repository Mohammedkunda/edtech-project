import { NextResponse } from "next/server";
import { prisma } from "@localfirst/db";
import { getCurrentUser } from "@/lib/session";
import { z } from "zod";

const settingsUpdateSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: {
        openRouterApiKey: true,
        openRouterModel: true,
      },
    });

    return NextResponse.json({
      model: user?.openRouterModel ?? "google/gemini-2.5-flash",
      hasApiKey: !!user?.openRouterApiKey,
    });
  } catch (e) {
    console.error("Failed to fetch user settings:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = settingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    }

    const updateData: { openRouterApiKey?: string | null; openRouterModel?: string | null } = {};

    if (parsed.data.apiKey !== undefined) {
      const trimmedKey = parsed.data.apiKey.trim();
      updateData.openRouterApiKey = trimmedKey || null;
    }

    if (parsed.data.model !== undefined) {
      const trimmedModel = parsed.data.model.trim();
      updateData.openRouterModel = trimmedModel || "google/gemini-2.5-flash";
    }

    await prisma.user.update({
      where: { id: currentUser.id },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Failed to update user settings:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
