# @vm/lexicon

Shared Strong's Concordance lexicon package for VerseMate web and mobile applications.

## Features

- ✅ **5,523 Greek** word definitions from Strong's Concordance
- ✅ **8,674 Hebrew** word definitions from Strong's Concordance
- ✅ **Lazy loading** - Only loads data when needed
- ✅ **Code splitting** - Separate Greek/Hebrew bundles
- ✅ **Cross-platform** - Works in web (Next.js) and mobile (React Native)
- ✅ **TypeScript** - Full type safety

## Installation

This package is part of the VerseMate monorepo and uses workspace dependencies:

```json
{
  "dependencies": {
    "lexicon": "workspace:*"
  }
}
```

## Usage

### Basic Lookup

```typescript
import { LexiconService } from 'lexicon';

// Look up a Greek word
const result = await LexiconService.lookup('G26');

if (result.found) {
  console.log(result.entry.lemma);           // "ἀγάπη"
  console.log(result.entry.transliteration); // "agapē"
  console.log(result.entry.definition);      // "love, affection..."
  console.log(result.entry.kjvTranslation);  // "love"
}
```

### Batch Lookup

```typescript
const results = await LexiconService.batchLookup(['G26', 'H430', 'G3056']);

results.forEach(result => {
  if (result.found) {
    console.log(result.entry.definition);
  }
});
```

### Preloading

```typescript
// Preload both lexicons for faster subsequent lookups
await LexiconService.preload();

// Now lookups are instant (already cached)
const result = await LexiconService.lookup('G26');
```

### Stats

```typescript
const stats = await LexiconService.getStats();
console.log(stats);
// {
//   greek: { totalEntries: 5523, cached: true },
//   hebrew: { totalEntries: 8674, cached: false }
// }
```

## Data Structure

Each Strong's entry contains:

```typescript
interface StrongsEntry {
  id: string;                    // "G26" or "H430"
  lemma: string;                 // Original Greek/Hebrew word
  transliteration?: string;      // Pronunciation
  definition: string;            // Strong's definition
  kjvTranslation?: string;       // KJV translation
  derivation?: string;           // Etymology
}
```

## React Native Support

This package works seamlessly in React Native with Expo:

```typescript
import { LexiconService } from 'lexicon';

// Same API works in React Native!
const result = await LexiconService.lookup('G26');
```
