import "server-only";
import { prisma, getUserRole, canUserWrite } from "@localfirst/db";
import { getCurrentUser } from "./session";
import { ROLE, type Role } from "@localfirst/shared";

/** Thrown by service functions; carries an HTTP-style status for API routes. */
export class DocsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DocsError";
    this.status = status;
  }
}

export type DocumentWithRole = {
  id: string;
  title: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  role: Role;
  owner: { name: string | null; email: string };
};

export async function listDocumentsForUser(): Promise<DocumentWithRole[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const access = await prisma.documentAccess.findMany({
    where: { userId: user.id },
    include: {
      document: { include: { owner: { select: { name: true, email: true } } } },
    },
    orderBy: { document: { updatedAt: "desc" } },
  });
  return access.map((a) => ({
    ...a.document,
    role: a.role as Role,
    owner: a.document.owner,
  }));
}

export async function createDocument(title: string) {
  const user = await getCurrentUser();
  if (!user) throw new DocsError("Unauthorized", 401);
  return prisma.document.create({
    data: {
      title: title.trim() || "Untitled document",
      ownerId: user.id,
      // Owner gets an explicit access row so role lookups + RLS work uniformly.
      access: { create: { userId: user.id, role: ROLE.OWNER } },
    },
  });
}

export async function getDocumentForUser(documentId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const role = await getUserRole(user.id, documentId);
  if (!role) return null;
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return null;
  return { doc, role };
}

export async function renameDocument(documentId: string, title: string) {
  const user = await getCurrentUser();
  if (!user) throw new DocsError("Unauthorized", 401);
  const allowed = await canUserWrite(user.id, documentId);
  if (!allowed) throw new DocsError("Forbidden: you have read-only access", 403);
  return prisma.document.update({
    where: { id: documentId },
    data: { title: title.trim() || "Untitled document" },
  });
}

export async function deleteDocument(documentId: string) {
  const user = await getCurrentUser();
  if (!user) throw new DocsError("Unauthorized", 401);
  const role = await getUserRole(user.id, documentId);
  if (role !== ROLE.OWNER)
    throw new DocsError("Forbidden: only the owner can delete", 403);
  await prisma.document.delete({ where: { id: documentId } });
}

export async function shareDocument(
  documentId: string,
  email: string,
  role: "editor" | "viewer",
) {
  const user = await getCurrentUser();
  if (!user) throw new DocsError("Unauthorized", 401);
  const ownRole = await getUserRole(user.id, documentId);
  if (ownRole !== ROLE.OWNER)
    throw new DocsError("Forbidden: only the owner can share", 403);
  const target = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!target) throw new DocsError("No user found with that email", 404);
  if (target.id === user.id)
    throw new DocsError("You cannot share with yourself", 400);
  await prisma.documentAccess.upsert({
    where: { documentId_userId: { documentId, userId: target.id } },
    update: { role },
    create: { documentId, userId: target.id, role },
  });
  return target;
}

export async function revokeAccess(documentId: string, userId: string) {
  const user = await getCurrentUser();
  if (!user) throw new DocsError("Unauthorized", 401);
  const ownRole = await getUserRole(user.id, documentId);
  if (ownRole !== ROLE.OWNER)
    throw new DocsError("Forbidden: only the owner can revoke access", 403);
  if (userId === user.id)
    throw new DocsError("Owner access cannot be revoked", 400);
  await prisma.documentAccess.deleteMany({
    where: { documentId, userId },
  });
}

export type Collaborator = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: Role;
};

export async function listCollaborators(documentId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const role = await getUserRole(user.id, documentId);
  if (!role) return null;
  const access = await prisma.documentAccess.findMany({
    where: { documentId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const collaborators: Collaborator[] = access.map((a) => ({
    id: a.id,
    userId: a.user.id,
    name: a.user.name,
    email: a.user.email,
    role: a.role as Role,
  }));
  return { role, collaborators };
}

export async function listSnapshots(documentId: string) {
  const user = await getCurrentUser();
  if (!user) throw new DocsError("Unauthorized", 401);
  const role = await getUserRole(user.id, documentId);
  if (!role) throw new DocsError("Forbidden: no access to this document", 403);

  return prisma.documentSnapshot.findMany({
    where: { documentId },
    include: {
      creator: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSnapshot(
  documentId: string,
  label?: string,
  yjsStateBase64?: string,
) {
  const user = await getCurrentUser();
  if (!user) throw new DocsError("Unauthorized", 401);
  const allowed = await canUserWrite(user.id, documentId);
  if (!allowed) throw new DocsError("Forbidden: you have read-only access", 403);

  let yjsState: Buffer;
  if (yjsStateBase64) {
    yjsState = Buffer.from(yjsStateBase64, "base64");
  } else {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { yjsState: true },
    });
    if (!doc?.yjsState) {
      throw new DocsError("Cannot snapshot document: no content found", 400);
    }
    yjsState = Buffer.from(doc.yjsState);
  }

  return prisma.documentSnapshot.create({
    data: {
      documentId,
      label: label?.trim() || null,
      yjsState: yjsState as any,
      createdBy: user.id,
    },
  });
}

export async function getSnapshot(documentId: string, snapshotId: string) {
  const user = await getCurrentUser();
  if (!user) throw new DocsError("Unauthorized", 401);
  const role = await getUserRole(user.id, documentId);
  if (!role) throw new DocsError("Forbidden: no access to this document", 403);

  const snapshot = await prisma.documentSnapshot.findUnique({
    where: { id: snapshotId },
    include: {
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  if (!snapshot || snapshot.documentId !== documentId) {
    throw new DocsError("Snapshot not found", 404);
  }

  return snapshot;
}

