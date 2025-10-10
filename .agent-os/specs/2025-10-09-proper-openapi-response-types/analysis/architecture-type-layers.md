# Type System Architecture: Four-Layer Design

**Date**: 2025-10-10
**Status**: Complete

## Overview

VerseMate backend uses a four-layer type system to separate concerns and ensure type safety across different use cases. Understanding when to use each layer is critical for maintainability.

## The Four Layers

```
┌─────────────────────────────────────────────────────────┐
│  1. Data Parsing Types (bible/types.ts)                │
│     Purpose: Parse source JSON files                    │
│     Format: TypeScript types                            │
│     Usage: Seed scripts, data loading                   │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  2. DTOs - Data Transfer Objects (*/dto/*.dto.ts)       │
│     Purpose: Validate API request inputs                │
│     Format: Elysia schemas (t.Object)                   │
│     Usage: Request body/query/param validation          │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  3. Common Entity Types (shared/schemas/common-types)   │
│     Purpose: Reusable entity definitions                │
│     Format: Elysia schemas (t.Object)                   │
│     Usage: Building blocks for response schemas         │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  4. Response Schemas (*/schemas/*-response.schema.ts)   │
│     Purpose: OpenAPI response documentation             │
│     Format: Elysia schemas (t.Object)                   │
│     Usage: API endpoint response definitions            │
└─────────────────────────────────────────────────────────┘
```

## Layer 1: Data Parsing Types

### Location
`packages/backend-base/src/bible/types.ts`

### Purpose
Parse Bible JSON files with abbreviated field names during data seeding and pre-generation.

### Format
Pure TypeScript types (not Elysia schemas)

### Characteristics
- Matches source JSON structure (abbreviated fields: b, c, n, g, t)
- Used exclusively for internal data transformation
- NOT for API layer or service responses

### Example
```typescript
export type Genre = {
  g: number;  // genre id
  n: string;  // genre name
};

export type BookMeta = {
  bookId: number;
  name: string;
  testament: Testament;
  genre: Genre;
  chaptersCount: number;
};
```

### Usage
```typescript
// In bible.ts - data parser
import type { Bible, Book, BookMeta } from "./types";

async function parseBibleData(file: BunFile): Promise<Bible> {
  // Parse JSON with abbreviated fields
  // Transform to internal structure
}
```

### When to Use
- ✅ Parsing source JSON files
- ✅ Database seeding scripts
- ✅ Pre-generation utilities
- ❌ API request/response handling
- ❌ Service layer logic

## Layer 2: DTOs (Data Transfer Objects)

### Location
`packages/backend-base/src/bible/dto/**/*.dto.ts`
`packages/backend-base/src/admin/dto/**/*.dto.ts`

### Purpose
Validate incoming API request data (body, query parameters, path parameters).

### Format
Elysia schemas with TypeScript type exports

### Characteristics
- Define input contract for API endpoints
- Use `t.Enum()` for database enums (imported from database models)
- Focused on validation, not documentation
- Mix of snake_case and camelCase based on API contract

### Example
```typescript
import RoleEnum from "database/src/models/public/RoleEnum";
import { type Static, t } from "elysia";

export const CreateMessageDto = t.Object({
  conversation_id: t.Number(),
  content: t.String(),
  role: t.Enum(RoleEnum),
});

export type CreateMessageDto = Static<typeof CreateMessageDto>;
```

### Usage
```typescript
// In bible.plugin.ts
import { CreateMessageDto } from "./dto/chat/add-message.dto";

export const biblePlugin = (app: Elysia) =>
  app.post("/messages", async ({ body }) => {
    // body is typed as CreateMessageDto
    return await chatService.saveMessage(body);
  }, {
    body: CreateMessageDto,  // Validates request body
  });
```

### When to Use
- ✅ Request body validation
- ✅ Query parameter validation
- ✅ Path parameter validation
- ✅ Input transformation
- ❌ Response documentation
- ❌ Service return types

## Layer 3: Common Entity Types

### Location
`packages/backend-base/src/shared/schemas/common-types.schema.ts`

### Purpose
Reusable entity type definitions that match database structures and service return types.

### Format
Elysia schemas with TypeScript type exports

### Characteristics
- Single source of truth for entity structures
- Match database models (snake_case fields)
- Include all database fields relevant to API responses
- Handle nullable fields with `t.Union([Type, t.Null()])`
- Serialize Date as String (ISO format)
- Export both Elysia schema and TypeScript type

### Example
```typescript
import { type Static, t } from "elysia";

// Enum definition
export const RoleEnum = t.Union([
  t.Literal("user"),
  t.Literal("assistant"),
]);

// Entity definition
export const MessageType = t.Object({
  message_id: t.Number(),
  conversation_id: t.Number(),
  role: RoleEnum,
  content: t.String(),
  created_at: t.String(), // Date serialized as ISO string
});

// TypeScript type export
export type Message = Static<typeof MessageType>;
```

### Contents
1. **Enum Types** (7): Testament, ExplanationType, Role, Status, HighlightColor, FavoriteType, PromptStatus
2. **Bible Content** (6): Book, Chapter, Verse, Subtitle, Testament, Language
3. **Explanations** (3): Explanation, ExplanationRating, RatingSummary
4. **Chat** (3): Conversation, Message, GroupedChatHistory
5. **User Content** (4): Bookmark, Note, Highlight, UserProgress
6. **Users** (1): User
7. **Batch** (2): BatchJob, BatchJobStatus
8. **Prompts** (2): SystemPrompt, UserPromptTemplate
9. **Wrappers** (2): SuccessResponse, CountResponse

### Usage
```typescript
// In bible-response.schema.ts
import { MessageType, ConversationType } from "../../shared/schemas/common-types.schema";
import { t } from "elysia";

export const MessagesHistorySchema = t.Object({
  messagesHistory: t.Array(MessageType),  // Reuse entity type
});

export const NewConversationSchema = t.Object({
  newConversation: ConversationType,  // Reuse entity type
  generatedTitle: t.String(),
});
```

### When to Use
- ✅ Building response schemas
- ✅ Defining API response structures
- ✅ Ensuring consistency across endpoints
- ✅ Type inference for Eden Treaty client
- ❌ Input validation (use DTOs)
- ❌ Data parsing (use data parsing types)

## Layer 4: Response Schemas

### Location
`packages/backend-base/src/bible/schemas/bible-response.schema.ts`
`packages/backend-base/src/admin/schemas/admin-response.schema.ts`

### Purpose
Define OpenAPI response documentation for API endpoints.

### Format
Elysia schemas (compose common types)

### Characteristics
- Import and compose types from `common-types.schema.ts`
- Add response-specific wrappers (success, message, etc.)
- Match actual service return structures
- Provide OpenAPI documentation
- Enable Eden Treaty type inference

### Example
```typescript
import {
  MessageType,
  ConversationType,
  GroupedChatHistoryType,
} from "../../shared/schemas/common-types.schema";
import { t } from "elysia";

// Simple wrapper
export const MessagesHistorySchema = t.Object({
  messagesHistory: t.Array(MessageType),
});

// Complex composition
export const UserChatHistorySchema = t.Object({
  userChatHistory: GroupedChatHistoryType,
});

// With additional fields
export const NewConversationSchema = t.Object({
  newConversation: ConversationType,
  generatedTitle: t.String(),
});
```

### Usage
```typescript
// In bible.plugin.ts
import { MessagesHistorySchema, NewConversationSchema } from "./schemas/bible-response.schema";

export const biblePlugin = (app: Elysia) =>
  app
    .get("/conversations/:id/messages", async ({ params }) => {
      const messages = await chatService.getMessages(params.id);
      return { messagesHistory: messages };
    }, {
      response: MessagesHistorySchema,  // OpenAPI docs
      detail: { tags: ["Chat"], summary: "Get conversation messages" },
    })
    .post("/conversations/new", async ({ body }) => {
      const result = await chatService.createConversation(body);
      return result;
    }, {
      response: NewConversationSchema,  // OpenAPI docs
      body: CreateConversationDto,       // Input validation
      detail: { tags: ["Chat"], summary: "Create new conversation" },
    });
```

### When to Use
- ✅ Defining endpoint responses
- ✅ OpenAPI documentation
- ✅ Eden Treaty type inference
- ✅ Wrapping entity types
- ❌ Input validation (use DTOs)
- ❌ Internal data structures

## Decision Tree: Which Layer to Use?

```
Are you parsing source JSON files for seeding?
├─ YES → Use Data Parsing Types (bible/types.ts)
└─ NO  ↓

Are you validating API request input?
├─ YES → Use DTOs (*/dto/*.dto.ts)
└─ NO  ↓

Are you defining an entity that could be reused?
├─ YES → Use or add to Common Types (common-types.schema.ts)
└─ NO  ↓

Are you defining an API response structure?
└─ YES → Use Response Schemas (*/schemas/*-response.schema.ts)
         (compose from Common Types)
```

## Import Patterns

### For Data Parsing (Layer 1)
```typescript
// Import parsing types
import type { Bible, Book, BookMeta } from "./types";
```

### For DTOs (Layer 2)
```typescript
// Import database enums
import RoleEnum from "database/src/models/public/RoleEnum";
import TestamentEnum from "database/src/models/public/TestamentEnum";

// Import Elysia
import { type Static, t } from "elysia";
```

### For Common Types (Layer 3)
```typescript
// Import Elysia and database enums
import { type Static, t } from "elysia";
// Define reusable schemas
```

### For Response Schemas (Layer 4)
```typescript
// Import from common types
import {
  MessageType,
  ConversationType,
  BookType,
  // ... other types
} from "../../shared/schemas/common-types.schema";

// Import Elysia
import { t } from "elysia";
```

## Anti-Patterns to Avoid

### ❌ Using Data Parsing Types for API Responses
```typescript
// WRONG: Don't use bible/types.ts for API
import type { Book } from "./types";

export const BookSchema = t.Object({
  books: t.Array(t.Any()), // Loses type info!
});
```

### ❌ Using DTOs for Response Documentation
```typescript
// WRONG: DTOs are for input, not output
import { MessageDto } from "./dto/chat/message.dto";

export const MessagesSchema = t.Object({
  messages: t.Array(MessageDto), // Should use MessageType from common-types
});
```

### ❌ Duplicating Entity Definitions
```typescript
// WRONG: Don't redefine entities in response schemas
export const MessageSchema = t.Object({
  message_id: t.Number(),
  content: t.String(),
  role: t.String(),
  // ... duplicating MessageType from common-types
});

// RIGHT: Import from common-types
import { MessageType } from "../../shared/schemas/common-types.schema";
export const MessagesSchema = t.Object({
  messages: t.Array(MessageType),
});
```

### ❌ Mixing t.Enum() Patterns
```typescript
// WRONG in Response Schema: Don't import database enums
import RoleEnum from "database/src/models/public/RoleEnum";
export const MessageSchema = t.Object({
  role: t.Enum(RoleEnum),
});

// RIGHT: Use the enum from common-types
import { MessageType } from "../../shared/schemas/common-types.schema";
export const MessagesSchema = t.Object({
  messages: t.Array(MessageType), // MessageType already has RoleEnum
});
```

## Summary

| Layer | Purpose | Location | Format | Import From |
|-------|---------|----------|--------|-------------|
| **1. Data Parsing** | Parse JSON files | `bible/types.ts` | TS types | - |
| **2. DTOs** | Validate input | `*/dto/` | Elysia schemas | Database enums |
| **3. Common Types** | Reusable entities | `shared/schemas/common-types.schema.ts` | Elysia schemas | Database enums |
| **4. Response Schemas** | Document output | `*/schemas/*-response.schema.ts` | Elysia schemas | Common types |

## Benefits of This Architecture

1. **Separation of Concerns**: Each layer has a clear, single responsibility
2. **Type Safety**: Full TypeScript inference from backend to frontend (Eden Treaty)
3. **Reusability**: Entity types defined once, used everywhere
4. **Maintainability**: Changes to entities update all response schemas automatically
5. **Consistency**: All endpoints use the same entity definitions
6. **Documentation**: OpenAPI spec accurately reflects API contracts
7. **Validation**: Input validation separate from output documentation

## Migration Path

When replacing `t.Any()` in response schemas:

1. Check if entity type exists in `common-types.schema.ts`
2. If not, add it to `common-types.schema.ts`
3. Import the type in the response schema file
4. Replace `t.Any()` with the imported type
5. Verify TypeScript compilation
6. Run tests to ensure no breaking changes
7. Check OpenAPI spec shows concrete types

## References

- **Analysis Documents**:
  - `t-any-audit.md` - All t.Any() instances
  - `service-return-types.md` - Service method signatures
  - `database-models.md` - Database entity structures
  - `type-mapping-strategy.md` - Implementation patterns
  - `existing-types-consolidation.md` - Consolidation analysis

- **Implementation Files**:
  - `packages/backend-base/src/bible/types.ts` - Data parsing types
  - `packages/backend-base/src/bible/dto/` - Input DTOs
  - `packages/backend-base/src/shared/schemas/common-types.schema.ts` - Entity types
  - `packages/backend-base/src/bible/schemas/bible-response.schema.ts` - Response schemas
