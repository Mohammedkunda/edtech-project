import { z } from "zod";
import { WS_MESSAGE_TYPE } from "@localfirst/shared";

const base64 = z.string().min(1);

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(WS_MESSAGE_TYPE.SYNC_STEP_1),
    documentId: z.string().uuid(),
    stateVector: base64,
  }),
  z.object({
    type: z.literal(WS_MESSAGE_TYPE.SYNC_STEP_2),
    documentId: z.string().uuid(),
    update: base64,
  }),
  z.object({
    type: z.literal(WS_MESSAGE_TYPE.UPDATE),
    documentId: z.string().uuid(),
    update: base64,
    clientId: z.number(),
    seq: z.number().int().nonnegative(),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
