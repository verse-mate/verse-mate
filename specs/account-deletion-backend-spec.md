# Account Deletion Backend Specification

## Overview
Implement a secure account deletion feature that allows users to permanently delete their accounts and all associated data from the VerseMate platform.

## Current State Analysis

### Existing Infrastructure
- **No deletion endpoint** currently exists in the auth or user plugins
- **Partial database cleanup**: A PostgreSQL trigger (`trigger_cleanup_user_data` from migration `20250913000001-add-user-cleanup-triggers.ts`) only handles `verse_highlights` deletion
- **Session management**: Redis-based access tokens (15 min) + database-persisted refresh tokens (90 days)
- **Authentication**: Bearer token-based with `authGuard` middleware

### Data Dependencies
The following tables have foreign key relationships to `user.id` and require cleanup:

1. `refresh_tokens` - User session tokens
2. `user_sso_accounts` - OAuth provider links (Google, Apple)
3. `user_progress` - Bible reading progress
4. `user_recently_viewed_books` - Browsing history
5. `user_viewed_book_introductions` - Viewed book intros tracking
6. `user_theme_preferences` - Highlight theme preferences
7. `verse_highlights` - User highlights/annotations (partially handled by existing trigger)
8. `notes` - User notes on verses
9. `favorites` - Bookmarked chapters
10. `conversations` - Chat sessions (cascades to messages via FK)
11. `explanation_ratings` - User feedback ratings
12. `user_prompt_templates` - Custom prompt templates (unclear FK relationship - needs investigation)

### Cache Dependencies
- Redis access tokens: `cacheConstants.accessToken(userId)`
- Any cached user sessions or data

## Requirements

### Functional Requirements

#### FR-1: Account Deletion Endpoint
- **Endpoint**: `DELETE /auth/account`
- **Authentication**: Required (bearer token)
- **Authorization**: Users can only delete their own account
- **Rate Limiting**: Apply rate limiting (max 3 attempts per hour to prevent abuse)
- **Idempotency**: Multiple deletion requests should be handled gracefully

#### FR-2: Data Deletion
- Delete user record from `user` table
- Cascade delete all related records from dependent tables
- Clear all access tokens from Redis cache
- Remove all refresh tokens from database
- Remove all SSO account links

#### FR-3: Session Invalidation
- Immediately invalidate all active sessions (all devices)
- Clear all access tokens from Redis
- Delete all refresh tokens from database
- Return 401 Unauthorized for any subsequent requests with deleted user's tokens

#### FR-4: Password Verification
- **For email/password accounts**: Require current password verification before deletion
- **For SSO-only accounts** (password is null): Skip password verification
- Prevent accidental deletion through password confirmation

### Non-Functional Requirements

#### NFR-1: Security
- Require authentication for deletion endpoint
- Verify user can only delete their own account
- Require password confirmation for email/password accounts
- Rate limit deletion attempts to prevent abuse
- Log all deletion attempts (success and failure) for audit trail

#### NFR-2: Data Privacy (GDPR/CCPA Compliance)
- Permanently delete all user data (no soft delete)
- Ensure data is irrecoverable after deletion
- Complete deletion within reasonable time frame (immediate)
- Maintain audit log of deletion (user_id, timestamp, IP address)

#### NFR-3: Performance
- Deletion operation should complete in <5 seconds
- Use database transactions to ensure atomicity
- No impact on other users during deletion

#### NFR-4: Reliability
- Use database transactions to prevent partial deletions
- Rollback on any failure during deletion process
- Comprehensive error handling and logging

## Technical Design

### API Endpoint

#### DELETE /auth/account

**Request Body Schema:**
```typescript
{
  password?: string; // Required for email/password accounts, optional for SSO-only
}
```

**Request Example:**
```json
{
  "password": "userPassword123"
}
```

**Response Codes:**
- `200 OK` - Account successfully deleted
- `400 Bad Request` - Invalid request (e.g., missing password for email/password account)
- `401 Unauthorized` - Invalid password or not authenticated
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error during deletion

**Success Response (200):**
```json
{
  "success": true,
  "message": "Account successfully deleted"
}
```

**Error Response Examples:**
```json
// Invalid password
{
  "error": "INVALID_PASSWORD",
  "message": "The password provided is incorrect"
}

// Missing password for email/password account
{
  "error": "PASSWORD_REQUIRED",
  "message": "Password is required to delete your account"
}

// Rate limit exceeded
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many deletion attempts. Please try again later."
}
```

### Implementation Approach

#### Option 1: Service Method (Recommended)
Create a new method in `AuthService` (`packages/backend-base/src/auth/auth.service.ts`)

**Advantages:**
- Keeps deletion logic with authentication business logic
- Reuses existing password verification from `changePassword` method
- Consistent with existing architecture

**Method Signature:**
```typescript
async deleteAccount(userId: string, password?: string): Promise<void>
```

#### Option 2: User Plugin Method
Create deletion method in `UserService` and expose via user plugin

**Advantages:**
- Groups user-related operations together
- Separates auth concerns from user management

**Disadvantage:**
- Requires duplicating password verification logic

**Decision**: Use Option 1 (AuthService method)

### Database Deletion Strategy

#### Option A: Database Transaction with Manual Cascading (Recommended)
Use Kysely transaction to manually delete from all dependent tables in correct order

**Advantages:**
- Full control over deletion order
- Explicit cleanup logic
- Better error handling and logging
- Can track what was deleted

**Example:**
```typescript
await db.transaction().execute(async (trx) => {
  // Delete dependent data first
  await trx.deleteFrom('explanation_ratings').where('user_id', '=', userId).execute();
  await trx.deleteFrom('conversations').where('user_id', '=', userId).execute();
  await trx.deleteFrom('favorites').where('user_id', '=', userId).execute();
  await trx.deleteFrom('notes').where('user_id', '=', userId).execute();
  await trx.deleteFrom('verse_highlights').where('user_id', '=', userId).execute();
  await trx.deleteFrom('user_theme_preferences').where('user_id', '=', userId).execute();
  await trx.deleteFrom('user_viewed_book_introductions').where('user_id', '=', userId).execute();
  await trx.deleteFrom('user_recently_viewed_books').where('user_id', '=', userId).execute();
  await trx.deleteFrom('user_progress').where('user_id', '=', userId).execute();
  await trx.deleteFrom('user_sso_accounts').where('user_id', '=', userId).execute();
  await trx.deleteFrom('refresh_tokens').where('user_id', '=', userId).execute();

  // Delete user record last
  await trx.deleteFrom('user').where('id', '=', userId).execute();
});
```

#### Option B: Database Foreign Key Cascade
Add `ON DELETE CASCADE` to all foreign key constraints in migration

**Advantages:**
- Database ensures referential integrity
- Less code to maintain

**Disadvantages:**
- Less visibility into what's being deleted
- Harder to debug issues
- Existing tables require migration to add cascade

**Decision**: Use Option A (Manual Cascading) for better control and logging

### Implementation Steps

1. **Add deletion method to AuthService**
   - File: `packages/backend-base/src/auth/auth.service.ts`
   - Implement password verification (reuse from changePassword)
   - Implement data cleanup in transaction
   - Clear Redis cache for access tokens

2. **Add deletion endpoint to AuthPlugin**
   - File: `packages/backend-base/src/auth/auth.plugin.ts`
   - Route: `DELETE /auth/account`
   - Apply `authGuard` middleware
   - Apply rate limiting (3 attempts/hour)
   - Call `authService.deleteAccount()`

3. **Update existing database trigger (optional)**
   - Current trigger only handles `verse_highlights`
   - Consider removing trigger in favor of explicit service method
   - OR extend trigger to log deletion to audit table

4. **Add audit logging**
   - Create new table `user_deletion_audit` (optional but recommended):
     ```sql
     CREATE TABLE user_deletion_audit (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id UUID NOT NULL,
       email VARCHAR(250) NOT NULL,
       deleted_at TIMESTAMP NOT NULL DEFAULT NOW(),
       deleted_by_ip VARCHAR(50),
       deletion_method VARCHAR(20) -- 'user_requested', 'admin', etc.
     );
     ```

### Testing Requirements

#### Unit Tests
- Test password verification (correct password, incorrect password, SSO-only account)
- Test data deletion completeness (verify all tables cleaned)
- Test transaction rollback on failure
- Test cache invalidation

#### Integration Tests
- Test full deletion flow via API endpoint
- Test session invalidation after deletion
- Test rate limiting
- Test concurrent deletion requests (idempotency)
- Test deletion with various account states (verified, unverified, SSO-linked)

#### Test Cases
1. Delete email/password account with correct password → Success
2. Delete email/password account with incorrect password → Error
3. Delete email/password account without password → Error
4. Delete SSO-only account without password → Success
5. Attempt deletion after account already deleted → Graceful handling
6. Verify all user data is deleted from all tables
7. Verify all sessions invalidated after deletion
8. Verify rate limiting after 3 attempts

### Security Considerations

1. **Authentication**: Require valid bearer token
2. **Authorization**: Verify userId from token matches account being deleted
3. **Password Verification**: Require password for email/password accounts
4. **Rate Limiting**: Prevent brute force or abuse (3 attempts/hour)
5. **Audit Logging**: Log all deletion attempts with IP address and timestamp
6. **CSRF Protection**: Not applicable (API endpoint, no state parameter needed)
7. **Data Sanitization**: Ensure all user data is permanently deleted (no soft delete)

### Error Handling

| Error Condition | HTTP Code | Error Code | Action |
|----------------|-----------|------------|--------|
| Not authenticated | 401 | UNAUTHORIZED | Reject request |
| Invalid password | 401 | INVALID_PASSWORD | Reject request |
| Password required but not provided | 400 | PASSWORD_REQUIRED | Reject request |
| Rate limit exceeded | 429 | RATE_LIMIT_EXCEEDED | Reject request |
| Database error during deletion | 500 | INTERNAL_ERROR | Rollback transaction, log error |
| User not found | 404 | USER_NOT_FOUND | Return success (idempotent) |
| Cache clear failure | 500 | CACHE_ERROR | Log error, continue with deletion |

### Migration Plan

1. **Phase 1: Implementation**
   - Implement deletion service method
   - Add API endpoint
   - Add unit and integration tests

2. **Phase 2: Testing**
   - Test in development environment
   - Test with various account types
   - Verify data cleanup completeness

3. **Phase 3: Deployment**
   - Deploy to staging environment
   - Run integration tests in staging
   - Deploy to production

4. **Phase 4: Monitoring**
   - Monitor deletion requests
   - Track errors and failures
   - Collect metrics (deletion count, errors, timing)

### Future Enhancements (Out of Scope)

1. **Soft Delete Option**: Allow account deactivation instead of permanent deletion
2. **Deletion Delay**: 30-day grace period before permanent deletion
3. **Data Export**: Allow users to download their data before deletion (GDPR requirement)
4. **Admin Deletion**: Allow admins to delete user accounts
5. **Deletion Confirmation Email**: Send confirmation email after deletion
6. **Account Recovery**: Allow recovery within grace period
7. **Anonymization Option**: Replace deletion with data anonymization

## Open Questions

1. Should we send a confirmation email after account deletion?
2. Do we want a grace period (e.g., 30 days) before permanent deletion?
3. Should admins be able to delete user accounts?
4. Do we need to provide data export before deletion (GDPR requirement)?
5. What happens to shared data (e.g., if user created public content)?
6. Should we track deletion metrics in analytics (PostHog)?

## Dependencies

- Kysely ORM (`packages/database`)
- Elysia auth plugin (`packages/backend-base/src/auth`)
- Redis for cache invalidation
- PostgreSQL database

## Acceptance Criteria

- [ ] DELETE /auth/account endpoint implemented with authentication
- [ ] Password verification required for email/password accounts
- [ ] All user data deleted from all 12+ dependent tables
- [ ] All active sessions invalidated (all devices)
- [ ] Redis access tokens cleared
- [ ] Database refresh tokens deleted
- [ ] Rate limiting applied (3 attempts/hour)
- [ ] Comprehensive error handling with appropriate HTTP codes
- [ ] Unit tests with >80% code coverage
- [ ] Integration tests for full deletion flow
- [ ] Audit logging implemented
- [ ] Transaction rollback on failure
- [ ] Documentation updated
