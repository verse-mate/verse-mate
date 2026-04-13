# VerseMate Mobile App — Claude Code Development Guide

How to develop the VerseMate Lovable prototype using Claude Code. This guide covers setup, the development loop, automation, and contributing PRs back to the production mobile repo.

## Architecture

```
                              ┌───────────────────┐    2-way sync    ┌──────────┐
                 git push     │ verse-mate/       │ ◀──────────────▶ │ Lovable  │
              ┌──────────────▶│ versemate         │                  │ (preview)│
              │               │ (Lovable repo)    │                  └──────────┘
              │               └───────────────────┘
              │
┌─────────────┴──┐
│   Claude Code   │
│   (local CLI)   │
└──┬──────────┬──┘
   │          │
   │          │  git push (PRs for production features)
   │          │
   │          ▼
   │   ┌───────────────────┐
   │   │ verse-mate/       │  ← PR TARGET for production features
   │   │ verse-mate-mobile │     e.g. PR #256 (font size setting)
   │   └───────────────────┘
   │
   │  reads design tokens, components, patterns (READ-ONLY)
   ▼
┌───────────────────┐
│ verse-mate/       │  ← PRIMARY REFERENCE (cloned locally as ./mobile)
│ verse-mate-mobile │     React Native / Expo
│                   │     constants/bible-design-tokens.ts = design system
│                   │     components/bible/ = reading components
│                   │     components/settings/ = settings components
│                   │     hooks/bible/ = state hooks (AsyncStorage)
│                   │     app/ = Expo Router screens
└───────────────────┘

┌───────────────────┐
│ verse-mate/       │  ← SECONDARY (API endpoints only, DO NOT port frontend)
│ verse-mate        │     apps/backend = API server
└───────────────────┘
```

### Flow summary

1. **Prototype development**: Claude Code edits web code → pushes to `verse-mate/versemate` → Lovable auto-syncs and deploys preview
2. **Design reference**: Claude Code reads `verse-mate/verse-mate-mobile` (cloned locally) for design tokens, component patterns, and mobile-specific logic
3. **Production PRs**: When a feature is proven in the Lovable prototype, Claude Code creates a PR against `verse-mate/verse-mate-mobile` with the feature ported to React Native
4. **API reference**: Backend API endpoints are documented in `verse-mate/verse-mate` (the web monorepo), but frontend code should NOT be ported from there

**Important:** The mobile repo (`verse-mate/verse-mate-mobile`) is the PRIMARY reference for design tokens, component patterns, and feature PRs. The web repo (`verse-mate/verse-mate`) is secondary — only reference it for backend API endpoints. DO NOT port web frontend styles into the Lovable build.

## Repos

| Repo | Purpose | Role |
|---|---|---|
| `verse-mate/versemate` | Lovable prototype (this repo) | Read + Write — where you develop |
| `verse-mate/verse-mate-mobile` | **Production mobile app** (React Native / Expo) | Read + Write — primary reference + PR target |
| `verse-mate/verse-mate` | Production web app + backend | Read only — for API endpoints |

## Quick Start

```bash
# 1. Clone the Lovable prototype
git clone https://github.com/verse-mate/versemate.git
cd versemate

# 2. Install dependencies
bun install

# 3. Start the dev server
bun run dev
# Opens at http://localhost:5173

# 4. Clone the production MOBILE repo (primary reference)
cd ..
git clone --depth 1 https://github.com/verse-mate/verse-mate-mobile.git mobile

# 5. Start Claude Code
cd versemate
claude
```

## Design Reference

### Primary: Figma Mobile App section

The canonical design is the **Figma Mobile App section** (node `5162:5662`):

```
https://www.figma.com/design/GOiiI0yRby5mWqCji8e4pp/VerseMate?node-id=5162-5662
```

### Secondary: Production mobile design tokens

The mobile repo has a comprehensive design system at `constants/bible-design-tokens.ts`:

```typescript
// Light + dark mode colors, typography, spacing, animation specs
import { colors, fontSizes, fontWeights, lineHeights, spacing } from '@/constants/bible-design-tokens';

// Key colors (dark mode — matches Figma Mobile App section)
colors.dark.background       // '#121212'
colors.dark.backgroundSecondary // '#1A1A1A'  
colors.dark.backgroundElevated  // '#222222'
colors.dark.textPrimary      // '#E8E8E8'
colors.dark.textSecondary    // '#B8B8B8'
colors.dark.gold             // '#b09a6d'
colors.dark.border           // '#3A3A3A'

// Key colors (light mode)
colors.light.bookBackground  // '#f6f3ec' (cream reading bg)
colors.light.background      // '#ffffff'
colors.light.textPrimary     // '#1a1a1a'
colors.light.gold            // '#b09a6d'

// Typography
fontSizes.displayMedium      // 32 (chapter titles)
fontSizes.heading2           // 20 (section headings)
fontSizes.bodyLarge          // 18 (verse text — user adjustable)
fontSizes.caption            // 12 (verse numbers)

// Spacing (4px grid)
spacing.lg                   // 16
spacing.xl                   // 20
spacing.xxl                  // 24
spacing.xxxl                 // 32
```

### Figma API access

```bash
export FIGMA_TOKEN="figd_..."
FILE_KEY="GOiiI0yRby5mWqCji8e4pp"

# Fetch Mobile App section
curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/files/$FILE_KEY/nodes?ids=5162:5662&depth=8"

# Export a frame as PNG
curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/images/$FILE_KEY?ids=5147:5080&format=png&scale=2"
```

## Backend API

Base URL: `https://api.versemate.org`

OpenAPI spec: `https://api.versemate.org/openapi/json`

### Key endpoints

```bash
GET /bible/books                              # All 66 books
GET /bible/book/{bookId}/{chapterNumber}      # Chapter text + subtitles (no versionKey!)
GET /bible/book/explanation/{bookId}/{ch}?explanationType=summary|byline|detailed
GET /bible/auto-highlights/{bookId}/{ch}
GET /bible/book/bookmarks/{userId}
GET /bible/book/notes/{userId}
GET /bible/highlights/{userId}
GET /topics/categories
GET /topics/search?category=EVENT&limit=50
GET /topics/{id}/references
POST /auth/login { email, password }
POST /auth/sso { provider: "google", token, platform: "web" }
```

## Development Workflow

### The Loop

```
1. You describe the change
2. Claude Code edits source files
3. Claude Code runs `bunx vite build` to verify
4. Claude Code commits + pushes to GitHub
5. Lovable auto-syncs (60s) and deploys preview
6. You QA in the preview, report bugs
7. Repeat
```

### Critical rule: always build before pushing

```bash
bunx vite build
```

A broken build = blank Lovable preview = wasted iteration.

## Contributing PRs to the Mobile Repo

When a feature is proven in the Lovable prototype, port it to the production mobile app.

### Setup

```bash
cd mobile  # verse-mate/verse-mate-mobile clone
git checkout main && git pull origin main
git checkout -b feat/your-feature
```

### Key mobile repo paths

```
verse-mate-mobile/
├── app/                          # Expo Router screens
│   ├── settings.tsx               # Settings screen
│   ├── bookmarks.tsx              # Bookmarks
│   ├── highlights/                # Highlights (index + detail)
│   ├── notes/                     # Notes (index + detail)
│   ├── bible/[bookId]/[chapterNumber].tsx  # Reading screen
│   └── auth/                      # Login/signup
├── components/
│   ├── bible/ChapterReader.tsx    # Main verse rendering
│   ├── bible/BookmarkToggle.tsx   # Bookmark button
│   ├── bible/NotesButton.tsx      # Notes button
│   ├── bible/ShareButton.tsx      # Share button
│   ├── settings/ThemeSelector.tsx # Theme picker
│   └── settings/FontSizeSelector.tsx # Font size (if merged)
├── constants/
│   └── bible-design-tokens.ts     # THE design system — colors, fonts, spacing
├── contexts/
│   ├── ThemeContext.tsx            # Light/dark mode
│   ├── AuthContext.tsx             # Auth state
│   └── BibleInteractionContext.tsx # Highlights, selections
├── hooks/bible/
│   ├── use-font-size.ts           # Font size preference (if merged)
│   ├── use-active-tab.ts          # Commentary tab state
│   ├── use-bookmarks.ts           # Bookmark CRUD
│   ├── use-highlights.ts          # Highlight CRUD
│   └── use-chapter-navigation.ts  # Chapter nav
└── types/
    └── bible.ts                   # Domain types
```

### Hook pattern (follow exactly)

Every persistent preference uses this pattern (from `use-active-tab.ts`):

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

let inMemoryCache: MyType | null = null;  // prevents flicker on remount

export function __TEST_ONLY_RESET_CACHE() { inMemoryCache = null; }

export function useMyHook() {
  const [value, setValue] = useState(inMemoryCache || DEFAULT);
  const [isLoading, setIsLoading] = useState(!inMemoryCache);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Load from AsyncStorage on mount
  }, []);

  const update = async (newValue) => {
    setValue(newValue);
    inMemoryCache = newValue;
    await AsyncStorage.setItem(KEY, String(newValue));
  };

  return { value, update, isLoading, error };
}
```

### Component pattern (follow ThemeSelector)

Settings sections use `Pressable` + `StyleSheet.create` + design tokens:

```typescript
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type getColors, spacing } from '@/constants/bible-design-tokens';
import { useTheme } from '@/contexts/ThemeContext';

export function MySelector() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  // ...
}

const createStyles = (colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({ /* ... */ });
```

### Lint before committing

The mobile repo uses Biome + ESLint. The pre-commit hook runs both automatically:

```bash
# Install deps (one time)
bun install

# Format + lint your changed files
./node_modules/.bin/biome check --write path/to/your/file.tsx

# Verify clean
./node_modules/.bin/biome check path/to/your/file.tsx
```

The pre-commit hook runs `biome check` AND `eslint --fix`. If it fails, fix the issues before committing.

### Key gotchas

1. **No `@nanostores/react`** in the mobile repo — use `useSyncExternalStore` or the AsyncStorage hook pattern instead.

2. **No external slider dependency** — use `Pressable` buttons instead of `@react-native-community/slider`.

3. **Import order matters** — Biome enforces alphabetical import sorting.

4. **`@/` path alias** — maps to the repo root (not `src/`).

5. **Design tokens, not hardcoded values** — always use `colors.textPrimary` not `'#1a1a1a'`, `spacing.lg` not `16`.

### Creating the PR

```bash
git push origin feat/your-feature

gh pr create \
  --repo verse-mate/verse-mate-mobile \
  --title "feat: Your feature title" \
  --base main \
  --body "## Summary
- What this does

## Changes
| File | What |
|---|---|
| path/to/file.tsx | Description |

## Test plan
- [ ] Step 1
- [ ] Step 2"
```

### Verifying CI passes

```bash
# Check PR status
gh pr checks <PR_NUMBER> --repo verse-mate/verse-mate-mobile

# CI checks: Chromatic Visual Regression, EAS Preview Build,
# Jest Tests, Quality Checks, Test Lint-staged
```

## Environment Variables

```bash
# .env.local (not committed)
VITE_API_URL=https://api.versemate.org
VITE_GOOGLE_CLIENT_ID=94126503648-2fb9dakdfi8pmi8ep78bk5nsrv94db6o.apps.googleusercontent.com
```

## Troubleshooting

### Lovable preview is blank

1. Run `bunx vite build` locally — if it fails, fix the error
2. Run `bunx tsc --noEmit` — catches type errors vite misses
3. Push a trivial commit to force rebuild:
   ```bash
   echo "/* $(date +%s) */" >> src/index.css
   git add . && git commit -m "chore: force rebuild" && git push
   ```

### API returns 404 for chapter text

The API doesn't support `versionKey` — omit it:
```
BAD:  GET /bible/book/1/1?versionKey=ESV  → 404
GOOD: GET /bible/book/1/1                  → 200
```

### Google SSO doesn't work in Lovable preview

Add the Lovable preview origin as an **Authorized JavaScript origin** in Google Cloud Console.

### Books appear in random order

Sort by `bookId`: `books.sort((a, b) => a.bookId - b.bookId)`

### Figma API rate limited

You get ~30 requests/minute. All 28 Mobile App PNGs are already downloaded in `figma_mobile_app/`. Use those instead of re-fetching.
