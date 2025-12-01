# Book Introduction Pages - Implementation Plan

## Overview

**Goal**: Provide a contextual intro page for each Bible book, offering historical background, author info, major themes, and continuity with surrounding books.

**Approach**: Static content stored in database, generated once during development (not at runtime).

**MVP Scope**: Genesis (Old Testament) as proof of concept.

---

## Feature Requirements

### User Experience
- Introduction page shown **once per book** before the user begins reading chapter 1
- Can be **skipped** via "Skip to Chapter 1" button
- Can be **returned to later** via "Book Overview" button in header
- Works on mobile and desktop
- Integrates seamlessly with existing Bible reading experience

### Introduction Content Includes
1. **Author and Date** - Who wrote it and when (approximate)
2. **Biblical Role** - The book's place in the biblical narrative
3. **Key Themes** - Major theological and narrative themes
4. **Related Books** - Continuity with surrounding books
5. **Literary Style** - Genre and writing approach (narrative, poetry, prophecy, etc.)

---

## Architecture Overview

### Content Strategy
- **Static content** - Intros generated once, stored in database
- **Seed data** - Created during development, committed to repo
- **Versioning support** - Allow future improvements/translations
- **Language support** - Start with English, support multi-language later

### Data Flow
```
Development Time:
GPT Script → JSON Files → Database Seed → book_introductions table

Runtime:
User selects book → Check if viewed → API fetch intro → Display → Mark as viewed
```

---

## Database Schema

### Table 1: `book_introductions`

Stores the introduction content for each book.

```sql
CREATE TABLE book_introductions (
  introduction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id INTEGER NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  author TEXT,
  date_written TEXT,
  biblical_role TEXT,
  key_themes TEXT[], -- Array of theme strings
  related_books TEXT,
  literary_style TEXT,
  full_intro_text TEXT NOT NULL, -- Formatted markdown
  language_code TEXT NOT NULL DEFAULT 'en',
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_book_language_version UNIQUE (book_id, language_code, version)
);

CREATE INDEX idx_book_intros_active ON book_introductions(book_id, is_active);
CREATE INDEX idx_book_intros_language ON book_introductions(language_code);
```

**Key Design Decisions**:
- `full_intro_text` contains complete formatted content (markdown supported)
- Individual fields (`author`, `key_themes`, etc.) allow structured queries
- `version` supports future content improvements
- `is_active` allows multiple versions with one active
- `created_by_admin` distinguishes manual curation from GPT-generated

### Table 2: `user_viewed_book_introductions`

Tracks which users have viewed which book introductions.

```sql
CREATE TABLE user_viewed_book_introductions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_user_book_intro UNIQUE (user_id, book_id)
);

CREATE INDEX idx_user_viewed_intros ON user_viewed_book_introductions(user_id);
```

**Key Design Decisions**:
- Unique constraint prevents duplicate viewing records
- Simple boolean: viewed or not (no view count needed)
- Soft tracking: doesn't block access if not authenticated

---

## Backend Implementation

### 1. Database Migrations

**Files to create:**
- `packages/database/src/migrations/XXXXXX_create_book_introductions.ts`
- `packages/database/src/migrations/XXXXXX_create_user_viewed_book_intros.ts`

**Commands:**
```bash
cd packages/database
bun run migrate:dev  # Creates migration files
bun run migrate:deploy  # Applies to database
bun run model:generate  # Generates Kysely types
```

### 2. Repository Layer

**File**: `packages/backend-base/src/bible/repository/bible.repository.ts`

**Methods to add:**
```typescript
// Fetch active intro with language fallback (requested → 'en' → none)
getBookIntroduction(bookId: number, languageCode: string): Promise<BookIntroduction | null>

// Check if user has viewed intro
hasUserViewedIntro(userId: string, bookId: number): Promise<boolean>

// Mark intro as viewed (upsert)
markIntroAsViewed(userId: string, bookId: number): Promise<void>

// Get all intros for a book (admin, all versions)
getAllBookIntros(bookId: number): Promise<BookIntroduction[]>

// Save new intro (manual curation or seed)
saveBookIntroduction(data: InsertableBookIntroduction): Promise<BookIntroduction>
```

### 3. Service Layer

**File**: `packages/backend-base/src/bible/services/bible.service.ts`

**Methods to add:**
```typescript
// Business logic: fetch intro with viewing status
async getBookIntroduction(bookId: number, languageCode: string, userId?: string) {
  const intro = await repository.getBookIntroduction(bookId, languageCode);
  if (!intro) return null;

  const hasViewed = userId
    ? await repository.hasUserViewedIntro(userId, bookId)
    : false;

  return { ...intro, hasViewed };
}

// Mark as viewed
async markIntroAsViewed(userId: string, bookId: number) {
  await repository.markIntroAsViewed(userId, bookId);
}
```

### 4. API Routes

**File**: `packages/backend-base/src/bible/bible.plugin.ts`

**Endpoints to add:**

```typescript
// GET /bible/book/:bookId/introduction?languageCode=en
app.get('/bible/book/:bookId/introduction', async ({ params, query, authDerive }) => {
  const bookId = Number(params.bookId);
  const languageCode = query.languageCode || 'en';
  const userId = authDerive?.userId; // Optional auth

  const intro = await bibleService.getBookIntroduction(bookId, languageCode, userId);

  if (!intro) {
    return { error: 'Introduction not found' };
  }

  return intro;
});

// POST /bible/book/:bookId/introduction/viewed
// Body: { userId: string }
app.post('/bible/book/:bookId/introduction/viewed', async ({ params, body }) => {
  const bookId = Number(params.bookId);
  await bibleService.markIntroAsViewed(body.userId, bookId);
  return { success: true };
});
```

### 5. Seed Data

**File**: `packages/database/src/seeds/data/book-intros.json` (new)

**Genesis Example**:
```json
{
  "1": {
    "book_id": 1,
    "author": "Moses",
    "date_written": "Approximately 1450-1400 BC",
    "biblical_role": "Genesis serves as the foundation of the entire biblical narrative, explaining the origins of the world, humanity, sin, and God's covenant relationship with His people. It sets the stage for the story of redemption that unfolds throughout Scripture.",
    "key_themes": [
      "Creation and the nature of God",
      "The Fall and the problem of sin",
      "God's covenant promises",
      "Faith and obedience",
      "God's sovereignty in human history"
    ],
    "related_books": "Genesis is the first book of the Pentateuch (Genesis-Deuteronomy) and is followed by Exodus, which continues the story of Israel's deliverance from Egypt. The themes introduced here echo throughout the Old and New Testaments.",
    "literary_style": "Genesis combines narrative prose with genealogies, using literary techniques like symmetry, repetition, and dramatic dialogue. It includes both primeval history (chapters 1-11) and patriarchal narratives (chapters 12-50).",
    "full_intro_text": "# Introduction to Genesis\n\n## Author and Date\nMoses is traditionally recognized as the author of Genesis, written during Israel's wilderness journey around 1450-1400 BC. While Moses compiled and shaped the material, it likely draws from earlier oral traditions and written sources passed down through the patriarchs.\n\n## The Book's Role in Scripture\nGenesis serves as the foundation of the entire biblical narrative. The name \"Genesis\" comes from the Greek word meaning \"origin\" or \"beginning,\" and the book lives up to its name by explaining the origins of the world, humanity, sin, and God's covenant relationship with His people. Everything that follows in Scripture builds upon the theological and historical framework established here.\n\n## Key Themes and Keywords\n\n- **Creation and the nature of God**: God as sovereign Creator who brings order from chaos\n- **The Fall and the problem of sin**: Humanity's rebellion and its devastating consequences\n- **God's covenant promises**: The foundational promise to Abraham that shapes all of salvation history\n- **Faith and obedience**: The pattern of trusting God's promises despite circumstances\n- **God's sovereignty in human history**: Divine providence working through human choices\n\n## Related Books\nGenesis is the first of five books written by Moses, collectively called the Pentateuch or Torah. Exodus immediately follows, narrating Israel's deliverance from Egyptian slavery—a direct continuation of the story that ends with Joseph's death in Egypt. The promises made to Abraham, Isaac, and Jacob in Genesis become the driving force behind God's actions in Exodus and beyond. Themes introduced in Genesis—creation, fall, promise, and redemption—echo throughout both Old and New Testaments, culminating in Christ.\n\n## Literary Style and Genre\nGenesis masterfully blends several literary forms. The opening chapters (1-11) present primeval history using elevated, almost poetic prose that addresses universal human questions. The patriarchal narratives (12-50) shift to engaging storytelling with vivid characters, dramatic tension, and profound theological insight woven seamlessly into the narrative. The book employs literary techniques such as chiastic structure, repetition for emphasis, genealogies that mark transitions, and type-scenes that invite comparison between characters and events.",
    "language_code": "en",
    "version": 1,
    "is_active": true,
    "created_by_admin": true
  }
}
```

**Seed Script**: `packages/database/src/seeds/book-introductions.seed.ts`
```typescript
export async function seedBookIntroductions(db: Kysely<Database>) {
  const introsData = require('./data/book-intros.json');

  for (const [bookId, intro] of Object.entries(introsData)) {
    await db
      .insertInto('book_introductions')
      .values(intro)
      .onConflict((oc) => oc
        .columns(['book_id', 'language_code', 'version'])
        .doNothing()
      )
      .execute();
  }

  console.log('✅ Book introductions seeded');
}
```

**Run seed**:
```bash
cd packages/database
bun run db:seed
```

---

## Frontend Implementation

### 1. UI Components

**File Structure**:
```
packages/frontend-base/src/ui/BookIntroduction/
├── index.ts
├── book-introduction.tsx (Root component)
├── book-introduction.module.css
├── IntroContent/
│   ├── index.ts
│   ├── intro-content.tsx
│   └── intro-content.module.css
└── IntroActions/
    ├── index.ts
    ├── intro-actions.tsx
    └── intro-actions.module.css
```

**Component: `BookIntroduction.Root`**
```tsx
interface BookIntroductionProps {
  bookId: number;
  bookName: string;
  testament: string;
  onSkip: () => void;
  onContinue: () => void;
}

export function BookIntroduction({
  bookId,
  bookName,
  testament,
  onSkip,
  onContinue
}: BookIntroductionProps) {
  const { introduction, isLoading } = useBookIntroduction(bookId);

  if (isLoading) return <LoadingSpinner />;
  if (!introduction) return null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>{bookName}</h1>
        <span className={styles.testament}>{testament} • Law</span>
        <button onClick={onSkip} className={styles.skipButton}>Skip</button>
      </header>

      <IntroContent content={introduction.full_intro_text} />

      <IntroActions onContinue={onContinue} />
    </div>
  );
}
```

**Component: `IntroContent`**
```tsx
import ReactMarkdown from 'react-markdown';

export function IntroContent({ content }: { content: string }) {
  return (
    <article className={styles.content}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  );
}
```

**Component: `IntroActions`**
```tsx
export function IntroActions({ onContinue }: { onContinue: () => void }) {
  return (
    <div className={styles.actions}>
      <button onClick={onContinue} className={styles.continueButton}>
        Continue to Chapter 1
      </button>
    </div>
  );
}
```

### 2. State Management Hook

**File**: `packages/frontend-base/src/Main/hooks/useBookIntroduction.ts`

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@vm/backend-api';

export function useBookIntroduction(bookId: number) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['bookIntroduction', bookId],
    queryFn: async () => {
      const response = await api.bible.book[bookId].introduction.get({
        query: { languageCode: 'en' }
      });
      return response.data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour (intros rarely change)
  });

  const markAsViewed = useMutation({
    mutationFn: async (userId: string) => {
      await api.bible.book[bookId].introduction.viewed.post({
        userId
      });
    },
  });

  return {
    introduction: data,
    isLoading,
    error,
    markAsViewed: markAsViewed.mutate,
  };
}
```

### 3. Routing Logic

**File**: `packages/frontend-base/src/Main/Content/main-content.tsx`

**Changes to add**:

```typescript
// Add to URL params
const showIntro = searchParams?.get('showIntro') === 'true';

// Check if user has viewed intro for this book
const { hasViewed } = useIntroViewingStatus(bookId, session?.id);

// When book changes, check if we should show intro
useEffect(() => {
  if (bookId && !hasViewed && !showIntro) {
    saveSearchParams({ showIntro: true });
  }
}, [bookId, hasViewed]);

// Conditional rendering
return (
  <div className={styles.mainContent}>
    {showIntro ? (
      <BookIntroduction
        bookId={bookId}
        bookName={selectedBook}
        testament={testament}
        onSkip={() => {
          markIntroAsViewed(session?.id, bookId);
          saveSearchParams({ showIntro: false, verseId: 1 });
        }}
        onContinue={() => {
          markIntroAsViewed(session?.id, bookId);
          saveSearchParams({ showIntro: false, verseId: 1 });
        }}
      />
    ) : (
      <MainText {...props} />
    )}
  </div>
);
```

### 4. "Book Overview" Button

**File**: `packages/frontend-base/src/ui/LeftPanel/HeaderPanel/header-panel.tsx`

**Add button to header**:
```tsx
<button
  onClick={() => saveSearchParams({ showIntro: true })}
  className={styles.overviewButton}
  title="View Book Overview"
>
  <InfoIcon size={20} />
  Overview
</button>
```

### 5. Local Storage Fallback (Offline Support)

**File**: `packages/frontend-base/src/Main/utils/useIntroTracking.ts`

```typescript
const STORAGE_KEY = 'vm_viewed_intros';

export function useIntroTracking() {
  const getViewedIntros = (): number[] => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  };

  const markAsViewed = (bookId: number) => {
    const viewed = getViewedIntros();
    if (!viewed.includes(bookId)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...viewed, bookId]));
    }
  };

  const hasViewed = (bookId: number): boolean => {
    return getViewedIntros().includes(bookId);
  };

  return { hasViewed, markAsViewed };
}
```

---

## MVP Implementation Steps (Genesis Only)

### Phase 1: Database (30 min)
1. Create `book_introductions` migration
2. Create `user_viewed_book_introductions` migration
3. Run migrations: `bun migrate:deploy`
4. Generate Kysely models: `bun model:generate`

### Phase 2: Seed Data (20 min)
1. Create `book-intros.json` with Genesis data only
2. Write seed script
3. Run seed: `bun db:seed`
4. Verify in Prisma Studio

### Phase 3: Backend API (1 hour)
1. Add repository methods
2. Add service methods
3. Add API routes
4. Test with Postman/curl

### Phase 4: Frontend Components (2 hours)
1. Create `BookIntroduction` component
2. Create `IntroContent` subcomponent
3. Create `IntroActions` subcomponent
4. Style with CSS modules

### Phase 5: Frontend Integration (1.5 hours)
1. Add `useBookIntroduction` hook
2. Update `main-content.tsx` routing logic
3. Add `showIntro` URL parameter
4. Add localStorage tracking

### Phase 6: Testing (30 min)
1. Test Genesis intro display
2. Test skip functionality
3. Test continue functionality
4. Test "already viewed" logic
5. Test mobile/desktop layouts

**Total MVP Time**: ~5.5 hours

---

## Testing Checklist

### Backend
- [ ] Migration runs successfully
- [ ] Kysely types generated
- [ ] Seed data loads into database
- [ ] GET `/bible/book/1/introduction` returns Genesis intro
- [ ] POST `/bible/book/1/introduction/viewed` saves viewing record
- [ ] Viewing check returns `hasViewed: true` after marking

### Frontend
- [ ] Selecting Genesis shows intro page (first time)
- [ ] "Skip" button navigates to Genesis 1:1
- [ ] "Continue" button navigates to Genesis 1:1
- [ ] Both buttons mark intro as viewed
- [ ] Returning to Genesis does NOT show intro again
- [ ] "Book Overview" button (if added) shows intro
- [ ] Mobile layout is responsive
- [ ] Desktop layout looks good
- [ ] Dark mode works correctly
- [ ] Markdown renders properly

---

## Future Enhancements

### Phase 2: All Books
- Generate intros for all 66 books
- Add genre-specific prompt templates
- Curate and review all content

### Phase 3: Multi-language
- Add Spanish, French, Portuguese translations
- Language selector in UI
- Fallback logic: requested → en → none

### Phase 4: Admin Panel
- Edit intro content
- Preview before publishing
- Version management UI
- Batch generate/update

### Phase 5: Analytics
- Track intro engagement
- A/B test intro lengths
- User feedback mechanism

---

## File Reference

### Backend Files
- `packages/database/src/migrations/XXXXXX_create_book_introductions.ts`
- `packages/database/src/migrations/XXXXXX_create_user_viewed_book_intros.ts`
- `packages/database/src/seeds/data/book-intros.json`
- `packages/database/src/seeds/book-introductions.seed.ts`
- `packages/backend-base/src/bible/repository/bible.repository.ts` (modify)
- `packages/backend-base/src/bible/services/bible.service.ts` (modify)
- `packages/backend-base/src/bible/bible.plugin.ts` (modify)

### Frontend Files
- `packages/frontend-base/src/ui/BookIntroduction/` (new folder)
- `packages/frontend-base/src/Main/hooks/useBookIntroduction.ts` (new)
- `packages/frontend-base/src/Main/utils/useIntroTracking.ts` (new)
- `packages/frontend-base/src/Main/Content/main-content.tsx` (modify)
- `packages/frontend-base/src/Main/utils/useSearchParams.ts` (verify showIntro param)

---

## Success Criteria

✅ User selects Genesis for the first time → sees introduction page
✅ User can skip intro → goes directly to Genesis 1:1
✅ User can read intro and continue → goes to Genesis 1:1
✅ Intro viewing is tracked (not shown again)
✅ Works on mobile and desktop
✅ Integrates seamlessly with existing Bible reading flow
✅ No runtime GPT calls (all static content)
✅ Fast page loads (< 1 second)

---

## Notes

- This is a **minimal viable feature** focusing on Genesis only
- Once proven, expand to all 66 books
- Content is **static** and stored in database (no runtime generation)
- User tracking works offline via localStorage, syncs when authenticated
- Design matches existing VerseMate UI patterns
