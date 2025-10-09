# Spec Tasks

## Tasks

- [ ] 1. Create shared response schema infrastructure
  - [ ] 1.1 Create `packages/backend-base/src/common/response-schemas.ts` with standard error and success response types
  - [ ] 1.2 Verify the shared schemas export correctly and can be imported by plugins

- [ ] 2. Create entity response schemas for Auth plugin
  - [ ] 2.1 Create `packages/backend-base/src/auth/schemas/` directory
  - [ ] 2.2 Create `auth-response.schema.ts` with AuthPayload and User entity schemas
  - [ ] 2.3 Verify schemas match the TypeScript entity types in `auth/entities/`

- [ ] 3. Add response schemas to Auth plugin endpoints
  - [ ] 3.1 Import shared response schemas and entity schemas in `auth.plugin.ts`
  - [ ] 3.2 Add response parameter to all 13 auth endpoints with status code mappings (200, 400, 500)
  - [ ] 3.3 Run `cd packages/backend-base && bun test` to verify no breaking changes
  - [ ] 3.4 Verify OpenAPI spec includes auth endpoint response schemas via `/openapi/json`

- [ ] 4. Create entity response schemas for User plugin
  - [ ] 4.1 Create `packages/backend-base/src/user/schemas/` directory
  - [ ] 4.2 Create `user-response.schema.ts` with User entity schema
  - [ ] 4.3 Verify schema matches the TypeScript User entity type

- [ ] 5. Add response schemas to User plugin endpoints
  - [ ] 5.1 Import shared response schemas and User entity schema in `user.plugin.ts`
  - [ ] 5.2 Add response parameter to all 3 user endpoints with status code mappings
  - [ ] 5.3 Run `cd packages/backend-base && bun test` to verify no breaking changes
  - [ ] 5.4 Verify OpenAPI spec includes user endpoint response schemas

- [ ] 6. Create entity response schemas for Bible plugin
  - [ ] 6.1 Create `packages/backend-base/src/bible/schemas/` directory
  - [ ] 6.2 Create `bible-response.schema.ts` with Book, Chapter, Explanation, Chat, Message, Note, Bookmark, and Highlight entity schemas
  - [ ] 6.3 Verify schemas match the TypeScript entity types and DTOs in `bible/dto/`

- [ ] 7. Add response schemas to Bible plugin endpoints (Part 1: Books & Chapters)
  - [ ] 7.1 Import shared response schemas and Bible entity schemas in `bible.plugin.ts`
  - [ ] 7.2 Add response parameter to endpoints: `/books`, `/languages`, `/book/:bookId/:chapterNumber`, `/book/explanation/:bookId/:chapterNumber`, `/testaments`, `/chapter-id/:bookId/:chapterNumber`
  - [ ] 7.3 Run tests and verify no breaking changes
  - [ ] 7.4 Verify OpenAPI spec includes these endpoint response schemas

- [ ] 8. Add response schemas to Bible plugin endpoints (Part 2: Chat & Conversations)
  - [ ] 8.1 Add response parameter to endpoints: `/book/conversations-history`, `/book/messages-history`, `/book/conversation-exists`, `/book/new-conversation`, `/book/ask-verse-mate/save-user-message`, `/book/ask-verse-mate/save-ai-message`, `/book/delete-chat/:conversation_id`
  - [ ] 8.2 Run tests and verify no breaking changes
  - [ ] 8.3 Verify OpenAPI spec includes these endpoint response schemas

- [ ] 9. Add response schemas to Bible plugin endpoints (Part 3: Ratings & Reading Progress)
  - [ ] 9.1 Add response parameter to endpoints: `/book/explanation/save-rating`, `/book/explanation/update-rating`, `/book/explanation/ratings`, `/book/chapter/save-last-read`, `/book/chapter/last-read`
  - [ ] 9.2 Run tests and verify no breaking changes
  - [ ] 9.3 Verify OpenAPI spec includes these endpoint response schemas

- [ ] 10. Add response schemas to Bible plugin endpoints (Part 4: Notes & Bookmarks)
  - [ ] 10.1 Add response parameter to endpoints: `/book/bookmarks/:user_id`, `/book/notes/:user_id`, `/book/note/add`, `/book/note/update`, `/book/note/remove`, `/book/bookmark/add`, `/book/bookmark/remove` (DELETE & POST)
  - [ ] 10.2 Run tests and verify no breaking changes
  - [ ] 10.3 Verify OpenAPI spec includes these endpoint response schemas

- [ ] 11. Add response schemas to Bible plugin endpoints (Part 5: Highlights)
  - [ ] 11.1 Add response parameter to endpoints: `/highlights/:user_id`, `/highlights/:user_id/:book_id/:chapter_number`, `/highlight/add`, `/highlight/:highlight_id` (PUT & DELETE)
  - [ ] 11.2 Run tests and verify no breaking changes
  - [ ] 11.3 Verify OpenAPI spec includes these endpoint response schemas

- [ ] 12. Handle remaining plugins (Admin & Healthcheck)
  - [ ] 12.1 Review `admin.plugin.ts` and add response schemas to all admin endpoints
  - [ ] 12.2 Review `healthcheck.plugin.ts` and add response schema to health check endpoint
  - [ ] 12.3 Run full test suite: `cd packages/backend-base && bun test`
  - [ ] 12.4 Verify all endpoints have response schemas in OpenAPI spec

- [ ] 13. Documentation and final verification
  - [ ] 13.1 Update CLAUDE.md with API Response Schemas section documenting the pattern and shared schemas
  - [ ] 13.2 Start backend server and fetch full OpenAPI spec: `curl http://localhost:3001/openapi/json | jq . > openapi-spec.json`
  - [ ] 13.3 Verify representative endpoints from each plugin have complete response type definitions in the spec
  - [ ] 13.4 Run TypeScript compiler to ensure Eden Treaty client types still work correctly
  - [ ] 13.5 Test at least one endpoint from each plugin (auth, user, bible) with curl to validate response matches schema
