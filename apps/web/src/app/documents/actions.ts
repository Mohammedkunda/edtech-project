"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as docs from "@/lib/documents";
import {
  createDocumentSchema,
  renameDocumentSchema,
  shareDocumentSchema,
} from "@/lib/validations";

export type FormState = { error?: string } | undefined;

export async function createDocumentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createDocumentSchema.safeParse({ title: formData.get("title") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  let doc;
  try {
    doc = await docs.createDocument(parsed.data.title);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create document." };
  }
  revalidatePath("/dashboard");
  redirect(`/documents/${doc.id}`);
}

export async function renameDocumentAction(
  documentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = renameDocumentSchema.safeParse({
    title: formData.get("title"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await docs.renameDocument(documentId, parsed.data.title);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to rename." };
  }
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/dashboard");
  return undefined;
}

export async function deleteDocumentAction(
  documentId: string,
): Promise<void> {
  await docs.deleteDocument(documentId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function shareDocumentAction(
  documentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = shareDocumentSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await docs.shareDocument(documentId, parsed.data.email, parsed.data.role);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to share." };
  }
  revalidatePath(`/documents/${documentId}`);
  return undefined;
}

export async function revokeAccessAction(
  documentId: string,
  userId: string,
): Promise<void> {
  await docs.revokeAccess(documentId, userId);
  revalidatePath(`/documents/${documentId}`);
}
