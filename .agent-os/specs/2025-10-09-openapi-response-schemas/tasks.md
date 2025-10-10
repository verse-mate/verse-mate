# Spec Tasks

## Tasks

- [x] 1. Create shared response schema infrastructure
  - [x] 1.1 Create `packages/backend-base/src/common/response-schemas.ts` with standard error and success response types
  - [x] 1.2 Verify the shared schemas export correctly and can be imported by plugins

- [x] 2. Create entity response schemas for Auth plugin
  - [x] 2.1 Create `packages/backend-base/src/auth/schemas/` directory
  - [x] 2.2 Create `auth-response.schema.ts` with AuthPayload and User entity schemas
  - [x] 2.3 Verify schemas match the TypeScript entity types in `auth/entities/`

- [x] 3. Add response schemas to Auth plugin endpoints
  - [x] 3.1 Import shared response schemas and entity schemas in `auth.plugin.ts`
  - [x] 3.2 Add response parameter to all 13 auth endpoints with status code mappings (200, 400, 500)
  - [x] 3.3 Run `cd packages/backend-base && bun test` to verify no breaking changes
  - [x] 3.4 Verify OpenAPI spec includes auth endpoint response schemas via `/openapi/json`

- [x] 4. Create entity response schemas for User plugin
  - [x] 4.1 Create `packages/backend-base/src/user/schemas/` directory
  - [x] 4.2 Create `user-response.schema.ts` with User entity schema
  - [x] 4.3 Verify schema matches the TypeScript User entity type

- [x] 5. Add response schemas to User plugin endpoints
  - [x] 5.1 Import shared response schemas and User entity schema in `user.plugin.ts`
  - [x] 5.2 Add response parameter to all 3 user endpoints with status code mappings
  - [x] 5.3 Run `cd packages/backend-base && bun test` to verify no breaking changes
  - [x] 5.4 Verify OpenAPI spec includes user endpoint response schemas

- [x] 6. Create entity response schemas for Bible plugin
  - [x] 6.1 Create `packages/backend-base/src/bible/schemas/` directory
  - [x] 6.2 Create `bible-response.schema.ts` with Book, Chapter, Explanation, Chat, Message, Note, Bookmark, and Highlight entity schemas
  - [x] 6.3 Verify schemas match the TypeScript entity types and DTOs in `bible/dto/`

- [x] 7. Add response schemas to Bible plugin endpoints (Part 1: Books & Chapters)
  - [x] 7.1 Import shared response schemas and Bible entity schemas in `bible.plugin.ts`
  - [x] 7.2 Add response parameter to endpoints: `/books`, `/languages`, `/book/:bookId/:chapterNumber`, `/book/explanation/:bookId/:chapterNumber`, `/testaments`, `/chapter-id/:bookId/:chapterNumber`
  - [x] 7.3 Run tests and verify no breaking changes
  - [x] 7.4 Verify OpenAPI spec includes these endpoint response schemas

- [x] 8. Add response schemas to Bible plugin endpoints (Part 2: Chat & Conversations)
  - [x] 8.1 Add response parameter to endpoints: `/book/conversations-history`, `/book/messages-history`, `/book/conversation-exists`, `/book/new-conversation`, `/book/ask-verse-mate/save-user-message`, `/book/ask-verse-mate/save-ai-message`, `/book/delete-chat/:conversation_id`
  - [x] 8.2 Run tests and verify no breaking changes
  - [x] 8.3 Verify OpenAPI spec includes these endpoint response schemas

- [x] 9. Add response schemas to Bible plugin endpoints (Part 3: Ratings & Reading Progress)
  - [x] 9.1 Add response parameter to endpoints: `/book/explanation/save-rating`, `/book/explanation/update-rating`, `/book/explanation/ratings`, `/book/chapter/save-last-read`, `/book/chapter/last-read`
  - [x] 9.2 Run tests and verify no breaking changes
  - [x] 9.3 Verify OpenAPI spec includes these endpoint response schemas

- [x] 10. Add response schemas to Bible plugin endpoints (Part 4: Notes & Bookmarks)
  - [x] 10.1 Add response parameter to endpoints: `/book/bookmarks/:user_id`, `/book/notes/:user_id`, `/book/note/add`, `/book/note/update`, `/book/note/remove`, `/book/bookmark/add`, `/book/bookmark/remove` (DELETE & POST)
  - [x] 10.2 Run tests and verify no breaking changes
  - [x] 10.3 Verify OpenAPI spec includes these endpoint response schemas

- [x] 11. Add response schemas to Bible plugin endpoints (Part 5: Highlights)
  - [x] 11.1 Add response parameter to endpoints: `/highlights/:user_id`, `/highlights/:user_id/:book_id/:chapter_number`, `/highlight/add`, `/highlight/:highlight_id` (PUT & DELETE)
  - [x] 11.2 Run tests and verify no breaking changes
  - [x] 11.3 Verify OpenAPI spec includes these endpoint response schemas

- [x] 12. Handle remaining plugins (Admin & Healthcheck)
  - [x] 12.1 Review `admin.plugin.ts` and add response schemas to all admin endpoints
  - [x] 12.2 Review `healthcheck.plugin.ts` and add response schema to health check endpoint
  - [x] 12.3 Run full test suite: `cd packages/backend-base && bun test`
  - [x] 12.4 Verify all endpoints have response schemas in OpenAPI spec

- [x] 13. Documentation and final verification
  - [x] 13.1 Update CLAUDE.md with API Response Schemas section documenting the pattern and shared schemas
  - [x] 13.2 Start backend server and fetch full OpenAPI spec: `curl http://localhost:3001/openapi/json | jq . > openapi-spec.json`
  - [x] 13.3 Verify representative endpoints from each plugin have complete response type definitions in the spec
  - [x] 13.4 Run TypeScript compiler to ensure Eden Treaty client types still work correctly
  - [x] 13.5 Test at least one endpoint from each plugin (auth, user, bible) with curl to validate response matches schema
