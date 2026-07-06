import * as jose from "jose";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-jwt-secret-change-me-please",
);

export type SyncTokenPayload = {
  userId: string;
  documentId: string;
  role: string;
};

export async function verifySyncToken(
  token: string,
): Promise<SyncTokenPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.documentId !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      documentId: payload.documentId,
      role: payload.role,
    };
  } catch {
    return null;
  }
}
