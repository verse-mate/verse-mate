import { t } from "elysia";

export const TopicDto = t.Object({
  name: t.String(),
  description: t.Optional(t.String()),
  category: t.String(),
  sort_order: t.Optional(t.Number()),
  is_active: t.Optional(t.Boolean()),
});

export const UpdateTopicDto = t.Object({
  name: t.Optional(t.String()),
  description: t.Optional(t.String()),
  category: t.Optional(t.String()),
  sort_order: t.Optional(t.Number()),
  is_active: t.Optional(t.Boolean()),
});
