import { t } from "elysia";

export const DateTime = t.String({ format: "date-time" });

export const DateTimeOrNull = t.Union([DateTime, t.Null()]);

export const ErrorResponse = t.Object({
  error: t.String(),
  message: t.String(),
  retryAfter: t.Optional(t.Number()),
  data: t.Optional(t.Any()),
  details: t.Optional(t.Object({}, { additionalProperties: true })),
});

export const GuardErrorResponse = t.Object({
  name: t.String(),
  message: t.String(),
});

export const StandardErrorResponses = {
  400: ErrorResponse,
  422: ErrorResponse,
  429: ErrorResponse,
  500: ErrorResponse,
};

export const AuthErrorResponses = {
  401: ErrorResponse,
  403: ErrorResponse,
};

export const UnauthorizedResponse = { 401: ErrorResponse };

export const GuardedUnauthorizedResponse = {
  401: t.Union([ErrorResponse, GuardErrorResponse]),
};

export const ForbiddenResponse = { 403: ErrorResponse };

export const NotFoundResponse = { 404: ErrorResponse };

export const ConflictResponse = { 409: ErrorResponse };

export const BooleanResponse = t.Boolean();

export const SuccessResponse = t.Object({
  success: t.Boolean(),
});
