# Type Mapping Strategy for OpenAPI Response Schemas

**Date**: 2025-10-10
**Status**: Complete

## Overview

This document outlines the strategy for mapping service return types to Elysia schema definitions for OpenAPI documentation. The goal is to replace all `t.Any()` usage with concrete type definitions while maintaining accuracy and consistency.

## Core Principles

1. **Match Database Models**: Response types should match database model structures
2. **Respect Service Layer Transformations**: Account for field renaming, abbreviations, and computed fields
3. **Handle Nullable Fields**: Use `t.Union([Type, t.Null()])` for nullable fields
4. **Use Optional Fields Sparingly**: Prefer nullable unions over `t.Optional()` to match database nullability
5. **Create Reusable Types**: Define common types once in `common-types.schema.ts`
6. **Type Safety**: Ensure TypeScript inference works correctly for Eden Treaty client

## Type Mapping Patterns

### Pattern 1: Direct Database Model Mapping

When a service returns a database model directly:

```typescript
// Database model
type UserProgress = {
  progress_id: number;
  user_id: number;
  book_id: number;
  chapter_number: number;
  last_verse_read: number | null;
  updated_at: Date;
};

// Elysia schema
export const UserProgressType = t.Object({
  progress_id: t.Number(),
  user_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  last_verse_read: t.Union([t.Number(), t.Null()]),
  updated_at: t.String(), // Date serialized as ISO string
});
```

**Key Points**:
- Map TypeScript types to Elysia equivalents
- Use `t.Union([Type, t.Null()])` for nullable fields
- Serialize `Date` objects as `t.String()` (ISO date strings)

### Pattern 2: Transformed/Computed Fields

When a service returns transformed data with abbreviated field names:

```typescript
// Service return
{
  b: number; // bookId
  n: string; // name
  t: "OT" | "NT"; // testament
  g: string; // genre
  c: number; // chapters
}

// Elysia schema
export const BookTypeCompact = t.Object({
  b: t.Number(), // bookId
  n: t.String(), // name
  t: TestamentEnum, // testament
  g: t.String(), // genre
  c: t.Number(), // chapters
});
```

**Key Points**:
- Match the actual service return structure, not the database model
- Add comments to document abbreviations
- Use enum types for union literals

### Pattern 3: Nested Complex Objects

When a service returns complex nested structures:

```typescript
// Service return
{
  book_id: number;
  chapter_number: number;
  verses: Array<Verse>;
  subtitles: Array<Subtitle> | null;
  explanations: Array<Explanation> | null;
}

// Elysia schema
export const ChapterType = t.Object({
  book_id: t.Number(),
  chapter_number: t.Number(),
  verses: t.Array(VerseType),
  subtitles: t.Union([t.Array(SubtitleType), t.Null()]),
  explanations: t.Union([t.Array(ExplanationType), t.Null()]),
});
```

**Key Points**:
- Define nested object types separately for reusability
- Use `t.Array(ItemType)` for arrays
- Nullable arrays: `t.Union([t.Array(Type), t.Null()])`

### Pattern 4: Grouped/Aggregated Data

When a service returns grouped or aggregated data:

```typescript
// Service return
{
  today: Array<Conversation>;
  yesterday: Array<Conversation>;
  lastSevenDays: Array<Conversation>;
  older: Array<Conversation>;
}

// Elysia schema
export const GroupedChatHistoryType = t.Object({
  today: t.Array(ConversationType),
  yesterday: t.Array(ConversationType),
  lastSevenDays: t.Array(ConversationType),
  older: t.Array(ConversationType),
});
```

**Key Points**:
- Create a dedicated type for the grouped structure
- Reuse item types across groups
- Ensure consistent typing for all groups

### Pattern 5: Union Types and Discriminated Unions

When a service can return different shapes:

```typescript
// Service return (varies based on favoriteType)
{
  favorite_id: number;
  user_id: number;
  favorite_type: "chapter" | "message";
  chapter_id: number | null;
  message_id: number | null;
}

// Elysia schema
export const BookmarkType = t.Object({
  favorite_id: t.Number(),
  user_id: t.Number(),
  favorite_type: FavoriteTypeEnum,
  chapter_id: t.Union([t.Number(), t.Null()]),
  message_id: t.Union([t.Number(), t.Null()]),
  created_at: t.String(),
});
```

**Key Points**:
- Use enum types for discriminator fields
- Make conditional fields nullable
- Consider creating separate types for each variant if needed

### Pattern 6: Wrapper Response Types

When a service wraps data in a response object:

```typescript
// Service return
{
  success: boolean;
  note: Note;
}

// Elysia schema
export const NoteAddSchema = t.Object({
  success: t.Boolean(),
  note: NoteType,
});
```

**Key Points**:
- Create response schemas that wrap entity types
- Reuse entity types from `common-types.schema.ts`
- Add additional metadata fields as needed (success, message, etc.)

## Enum Type Handling

All database enums should be defined as Elysia union literals:

```typescript
// Database enum: TestamentEnum = 'OT' | 'NT'
export const TestamentEnum = t.Union([t.Literal("OT"), t.Literal("NT")]);

// Database enum: ExplanationTypeEnum = 'summary' | 'byline' | 'detailed'
export const ExplanationTypeEnum = t.Union([
  t.Literal("summary"),
  t.Literal("byline"),
  t.Literal("detailed"),
]);

// Database enum: RoleEnum = 'user' | 'assistant'
export const RoleEnum = t.Union([t.Literal("user"), t.Literal("assistant")]);
```

**Defined Enums**:
1. `TestamentEnum` - OT, NT
2. `ExplanationTypeEnum` - summary, byline, detailed
3. `RoleEnum` - user, assistant
4. `StatusEnum` - active, inactive, archived
5. `HighlightColorEnum` - yellow, green, blue, pink, purple, orange
6. `FavoriteTypeEnum` - chapter, message
7. `PromptStatusEnum` - active, inactive

## Date/Timestamp Handling

**Database Type**: `Date` (PostgreSQL timestamp)
**JavaScript Type**: `Date` object
**Serialized Type**: ISO 8601 string
**Elysia Schema**: `t.String()`

```typescript
// Database model has: created_at: Date
// Service returns: created_at: Date
// JSON response: "created_at": "2025-10-10T12:34:56.789Z"
// Elysia schema: created_at: t.String()
```

**Rationale**: JavaScript serializes `Date` objects to ISO strings in JSON, so we document them as strings in OpenAPI.

## Nullable vs Optional Fields

### Use Nullable (`t.Union([Type, t.Null()])`) when:
- Database field is nullable (`column_name: type | null`)
- Service may return `null` as a valid value
- API clients need to distinguish between "null" and "absent"

### Use Optional (`t.Optional(Type)`) when:
- Field may not be present in response at all
- Service conditionally includes the field
- Backward compatibility with existing clients

**Example**:
```typescript
// Nullable field (database allows null)
last_verse_read: t.Union([t.Number(), t.Null()])

// Optional field (only included when user has a rating)
message: t.Optional(t.String())
```

## Response Schema Organization

### File Structure

```
packages/backend-base/src/
├── shared/schemas/
│   └── common-types.schema.ts         # Reusable entity types
├── bible/schemas/
│   └── bible-response.schema.ts       # Bible plugin response schemas
└── admin/schemas/
    └── admin-response.schema.ts       # Admin plugin response schemas
```

### Import Pattern

```typescript
// In bible-response.schema.ts or admin-response.schema.ts
import {
  BookType,
  ChapterType,
  ExplanationType,
  ConversationType,
  MessageType,
  // ... other types
} from "../../shared/schemas/common-types.schema";

// Define response wrappers
export const BookSchema = t.Object({
  books: t.Array(BookTypeCompact),
});

export const ChapterSchema = ChapterType; // Direct reuse

export const ExplanationSchema = t.Object({
  explanation: ExplanationType,
});
```

## Special Cases and Edge Cases

### 1. Empty Arrays vs Null

Some services return `[]` for no results, others return `null`:

```typescript
// Service returns [] or array with items
highlights: t.Array(HighlightType)

// Service returns null or array with items
explanations: t.Union([t.Array(ExplanationType), t.Null()])
```

**Strategy**: Match the actual service behavior documented in `service-return-types.md`

### 2. Abbreviated Field Names

The Bible service uses abbreviated field names for compact JSON:

```typescript
// Document the mapping clearly
export const BookTypeCompact = t.Object({
  b: t.Number(), // bookId
  n: t.String(), // name
  t: TestamentEnum, // testament
  g: t.String(), // genre
  c: t.Number(), // chapters
});
```

**Strategy**: Create both compact and full versions where needed

### 3. Mixed Snake Case and Camel Case

Database fields use `snake_case`, but some service methods transform to `camelCase`:

```typescript
// Database field: first_name
// Service returns: firstName

// Match service return
export const UserType = t.Object({
  firstName: t.Union([t.String(), t.Null()]),
});
```

**Strategy**: Always match the actual API response, not the database model

### 4. Computed/Derived Fields

Some responses include computed fields not in the database:

```typescript
// Database has: firstName, lastName
// Service returns: firstName, lastName, fullName (computed)

export const UserDetailsType = t.Object({
  firstName: t.Union([t.String(), t.Null()]),
  lastName: t.Union([t.String(), t.Null()]),
  fullName: t.String(), // Computed field
});
```

**Strategy**: Include all fields in the actual response, document computed fields

### 5. Batch Operation Status

Batch operations have complex nested structures:

```typescript
// Service returns different shapes during different phases
// Initial: { batchJobId, status }
// Progress: { batchJobId, status, progress, total, completed, failed }
// Complete: Full BatchJob object

// Define comprehensive type covering all phases
export const BatchJobStatusType = t.Object({
  batchJobId: t.String(),
  status: t.String(),
  progress: t.Number(),
  total: t.Number(),
  completed: t.Number(),
  failed: t.Number(),
});
```

**Strategy**: Define the most complete structure, mark varying fields as optional if needed

## Implementation Checklist

When creating a new response schema:

- [ ] Check `service-return-types.md` for actual return structure
- [ ] Check `database-models.md` for entity structure and nullable fields
- [ ] Determine if reusable types exist in `common-types.schema.ts`
- [ ] Use enum types from `common-types.schema.ts` where applicable
- [ ] Handle nullable fields with `t.Union([Type, t.Null()])`
- [ ] Handle optional fields with `t.Optional(Type)` only when appropriate
- [ ] Document abbreviated field names with comments
- [ ] Serialize Date fields as `t.String()`
- [ ] Export type using `Static<typeof Schema>` for TypeScript usage
- [ ] Test TypeScript compilation
- [ ] Verify OpenAPI spec output

## Validation Strategy

After implementing schemas:

1. **Type Check**: Run `bun tsc` to ensure TypeScript compilation
2. **Test Execution**: Run relevant test suite to ensure no runtime errors
3. **OpenAPI Verification**: Check `/openapi/json` endpoint for proper type generation
4. **Eden Treaty Testing**: Verify type inference works in frontend client

## Migration Path

For each `t.Any()` replacement:

1. **Identify** the schema in `t-any-audit.md`
2. **Research** the return type in `service-return-types.md`
3. **Reference** database model in `database-models.md`
4. **Import** or define reusable types from `common-types.schema.ts`
5. **Replace** `t.Any()` with proper type definition
6. **Test** the change with TypeScript and runtime tests
7. **Verify** OpenAPI spec shows concrete types

## Summary

This strategy ensures:

✅ **Accuracy**: Types match actual service returns
✅ **Consistency**: Reusable types used across plugins
✅ **Type Safety**: TypeScript inference works correctly
✅ **Maintainability**: Clear patterns for future updates
✅ **Documentation**: OpenAPI spec accurately reflects API
✅ **Client Generation**: Mobile apps get proper TypeScript types

Follow this strategy systematically for each schema replacement task in the implementation plan.
