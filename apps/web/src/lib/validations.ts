import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required.").max(80),
  email: z.string().email("Enter a valid email."),
  password: z.string().min(6, "Password must be at least 6 characters.").max(100),
});

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
});

export const renameDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title cannot be empty.").max(200),
});

export const shareDocumentSchema = z.object({
  email: z.string().email("Enter a valid email."),
  role: z.enum(["editor", "viewer"]),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type RenameDocumentInput = z.infer<typeof renameDocumentSchema>;
export type ShareDocumentInput = z.infer<typeof shareDocumentSchema>;

export const createSnapshotSchema = z.object({
  label: z.string().trim().max(100).optional(),
  yjsState: z.string().optional(),
});
export type CreateSnapshotInput = z.infer<typeof createSnapshotSchema>;

