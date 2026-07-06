import * as jose from "jose";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-jwt-secret-change-me-please",
);

/**
 * Sign a short-lived JWT that the browser client passes to the WS sync server.
 * Contains only what the server needs to verify access: userId, documentId, role.
 */
export async function signSyncToken(
  userId: string,
  documentId: string,
  role: string,
): Promise<string> {
  return new jose.SignJWT({ userId, documentId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .setIssuedAt()
    .sign(secret);
}
