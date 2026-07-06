// Hardening limits (see plan §7). Applied at the WS server boundary.

/** Maximum decoded Yjs update size we will accept/apply (256 KB). */
export const MAX_YJS_UPDATE_BYTES = 256 * 1024;

/** Hard limit on a single WS message frame before we even attempt to parse it. */
export const MAX_WS_MESSAGE_BYTES = 512 * 1024;

/** Steady-state updates a single user may send per document per second. */
export const RATE_LIMIT_UPDATES_PER_SEC = 20;

/** Token-bucket burst size for the per-user/per-document update limiter. */
export const RATE_LIMIT_BURST = 40;

/** Client-side keystroke batching window before flushing a Yjs update. */
export const SYNC_DEBOUNCE_MS = 150;

export const ROLE = {
  OWNER: "owner",
  EDITOR: "editor",
  VIEWER: "viewer",
} as const;

export const WS_MESSAGE_TYPE = {
  SYNC_STEP_1: "sync-step1",
  SYNC_STEP_2: "sync-step2",
  UPDATE: "update",
  AWARENESS: "awareness",
  ACK: "ack",
  AUTH_OK: "auth-ok",
  ERROR: "error",
} as const;
