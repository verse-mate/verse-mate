import { t } from "elysia";

/** Result of an admin broadcast — how many tokens were targeted + pruned. */
export const BroadcastResponseSchema = t.Object({
  recipientCount: t.Integer(),
  pruned: t.Integer(),
});

/** Active-device count for the broadcast preview. */
export const RecipientCountResponseSchema = t.Object({
  count: t.Integer(),
});
