# VerseMate Notes Feature - Production Deployment Guide

## 🚀 Pre-Deployment Checklist

### 1. Database Migration
```bash
# Run the notes table migration in production
cd packages/database
bun run migrate
```

### 2. Environment Variables
Set these environment variables in production:

**Frontend (.env.production):**
```bash
# Enable notes feature in production
NEXT_PUBLIC_NOTES_ENABLED=true

# Production API URL (optional - defaults to https://api.verse-mate.apegro.dev)
NEXT_PUBLIC_NOTES_API_URL=https://api.verse-mate.apegro.dev
```

**Backend (.env.production):**
```bash
# PostgreSQL connection for notes storage
POSTGRES_URL=postgresql://prod_user:secure_password@prod-db-host:5432/versemate_prod
```

### 3. Feature Flag Strategy

#### Option A: Gradual Rollout (Recommended)
1. **Initial Deploy**: `NEXT_PUBLIC_NOTES_ENABLED=false` (disabled for all users)
2. **Beta Testing**: Enable for specific users/environments
3. **Full Rollout**: `NEXT_PUBLIC_NOTES_ENABLED=true` (enabled for all users)

#### Option B: Immediate Rollout
1. **Deploy with**: `NEXT_PUBLIC_NOTES_ENABLED=true`

### 4. Authentication Integration
**Current Status**: Uses mock authentication for development
**Production Requirement**: Integrate with real user authentication system

```typescript
// TODO: Replace mock authentication in production
const getMockUserId = () => '550e8400-e29b-41d4-a716-446655440000';
// Should become:
const getUserId = () => getCurrentUser().id;
```

## 🔧 Post-Deployment Verification

### 1. Database Verification
```sql
-- Verify notes table exists
SELECT * FROM information_schema.tables WHERE table_name = 'notes';

-- Verify table structure
\d notes;
```

### 2. API Endpoints Testing
```bash
# Test GET endpoint
curl -H "Authorization: Bearer <token>" \
  "https://api.verse-mate.apegro.dev/notes/Matthew/1/NASB1995?userId=<user-id>"

# Test POST endpoint
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"userId":"<user-id>","bookName":"Matthew","chapterNumber":1,"translation":"NASB1995","content":"Test note"}' \
  "https://api.verse-mate.apegro.dev/notes"
```

### 3. Frontend Verification
- Notes button appears in header for authenticated users
- Modal opens with correct book/chapter title
- CRUD operations work end-to-end
- Click-outside-to-close functionality works

## 🚨 Rollback Plan

If issues arise, quickly disable the feature:

```bash
# Disable notes feature immediately
NEXT_PUBLIC_NOTES_ENABLED=false
```

This will hide the notes button and disable all notes functionality without requiring a code deployment.

## 📊 Monitoring

Monitor these metrics post-deployment:
- Notes creation rate
- API error rates for notes endpoints
- Database performance for notes queries
- User engagement with notes feature

## 🔒 Security Considerations

1. **User Isolation**: Notes are properly filtered by user_id
2. **Authentication**: Verify JWT tokens on all endpoints
3. **Input Validation**: Sanitize note content to prevent XSS
4. **Rate Limiting**: Consider rate limiting for note creation

## 📝 Current Implementation Status

✅ **Ready for Production:**
- Full CRUD functionality
- PostgreSQL integration
- Feature flag support
- Environment-aware configuration
- Error handling and logging

⚠️ **Requires Production Setup:**
- Real user authentication integration
- Database migration execution
- Environment variable configuration
- Monitoring and alerting setup
