import { t } from "elysia";

/**
 * Standard error response structure used across all API endpoints
 */
export const ErrorResponse = t.Object({
  error: t.String({
    description: "Error type or code",
    examples: ["VALIDATION_ERROR", "UNAUTHORIZED", "NOT_FOUND"],
  }),
  message: t.String({
    description: "Human-readable error message",
  }),
  details: t.Optional(
    t.Any({
      description:
        "Additional error context (validation errors, stack traces, etc.)",
    }),
  ),
});

/**
 * Standard paginated response structure
 */
export const PaginatedResponse = <T extends ReturnType<typeof t.Any>>(
  dataSchema: T,
) =>
  t.Object({
    data: t.Array(dataSchema),
    pagination: t.Object({
      page: t.Number({ description: "Current page number" }),
      limit: t.Number({ description: "Items per page" }),
      total: t.Number({ description: "Total number of items" }),
      totalPages: t.Number({ description: "Total number of pages" }),
    }),
  });

/**
 * Type exports for use in handlers
 */
export type ErrorResponseType = {
  error: string;
  message: string;
  details?: any;
};

export type PaginatedResponseType<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
