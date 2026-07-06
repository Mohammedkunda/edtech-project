import { prisma } from "./client";
import { isRole, type Role } from "@localfirst/shared";

/**
 * Returns the user's role for a document, or null if they have no access.
 * Used by both the Next.js API layer and the WS sync server.
 */
export async function getUserRole(
  userId: string,
  documentId: string,
): Promise<Role | null> {
  const access = await prisma.documentAccess.findUnique({
    where: { documentId_userId: { documentId, userId } },
    select: { role: true },
  });
  const role = access?.role;
  return role && isRole(role) ? role : null;
}

/** True if the user may mutate the document (owner or editor with access). */
export async function canUserWrite(
  userId: string,
  documentId: string,
): Promise<boolean> {
  const role = await getUserRole(userId, documentId);
  return role === "owner" || role === "editor";
}
