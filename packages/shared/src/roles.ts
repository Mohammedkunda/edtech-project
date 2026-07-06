import { ROLE } from "./constants";

export type Role = (typeof ROLE)[keyof typeof ROLE];

export const ROLES: readonly Role[] = [ROLE.OWNER, ROLE.EDITOR, ROLE.VIEWER] as const;

/** Owners and editors may mutate a document; viewers are read-only. */
export function canWrite(role: Role): boolean {
  return role === ROLE.OWNER || role === ROLE.EDITOR;
}

export function isRole(value: unknown): value is Role {
  return value === ROLE.OWNER || value === ROLE.EDITOR || value === ROLE.VIEWER;
}
