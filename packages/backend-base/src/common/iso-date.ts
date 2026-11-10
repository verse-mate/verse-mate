export const isoDate = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value;

export const isoDateOrNull = (value: Date | string | null): string | null =>
  value === null ? null : isoDate(value);
