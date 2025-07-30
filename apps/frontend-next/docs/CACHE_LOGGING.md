# PWA Cache Logging

This document explains how to monitor and debug PWA cache behavior in VerseMate.

## What's Implemented

### 1. Service Worker Cache Logging
The service worker automatically logs all cache operations with detailed information:

- **Cache Hits**: When content is served from cache (`[SW Cache HIT]`)
- **Network Requests**: When network requests are made (`[SW Network]`)
- **Cache Updates**: When cache is updated with new content (`[SW Cache UPDATE]`)
- **Network Failures**: When network requests fail and fallback to cache (`[SW Network FAIL]`)
- **Cache Key Usage**: When cache keys are accessed (`[SW Cache]`)

### 2. Client-Side Logging
The PWAServiceWorkerRegistration component provides additional client-side monitoring:

- Service worker registration status
- Network online/offline status changes
- Connection state monitoring

### 3. Console Logging
In both development and production modes, you'll see:

- Detailed console logging for all cache operations
- Network status indicators
- Service worker registration messages

## How to Use

### 1. View Cache Logs
Open your browser's Developer Tools console to see detailed cache logging:

```
[SW Cache HIT] Serving from cache "bible-books-cache": http://localhost:3001/api/bible/books
[SW Network] 🌐 Making network request: http://localhost:3001/api/bible/book/1/1
[SW Cache UPDATE] 🔄 Cache "bible-chapters-cache" updated for: http://localhost:3001/api/bible/book/1/1
[SW Network FAIL] ❌ Network request failed for: http://localhost:3001/api/bible/books
[SW Network FAIL] 💾 Will attempt to serve from cache if available
[PWA] 🔴 Offline - serving content from cache
```

### 2. Test Cache Behavior

#### Manual Testing
1. Load the app normally (content will be cached)
2. Open DevTools > Network tab
3. Check "Offline" to simulate no network
4. Navigate around the app - you'll see cache hits in console
5. Uncheck "Offline" to go back online

### 3. Monitor Different Cache Types

The app uses different caching strategies:

- **CacheFirst**: Static assets (fonts, images, static JS/CSS)
- **NetworkFirst**: Dynamic content (Bible chapters, explanations)
- **StaleWhileRevalidate**: Resources that can show stale content while updating

Each cache type will show different logging patterns:

```
# CacheFirst - tries cache first, then network
[SW Cache] read request for: /_next/static/chunks/main.js
[SW Cache HIT] Serving from cache "next-static-js-assets": /_next/static/chunks/main.js

# NetworkFirst - tries network first, falls back to cache
[SW Network] 🌐 Making network request: /api/bible/book/1/1
[SW Cache HIT] Serving from cache "bible-chapters-cache": /api/bible/book/1/1

# When cache is updated
[SW Cache UPDATE] 🔄 Cache "bible-chapters-cache" updated for: /api/bible/book/1/1

# When network fails and fallback to cache
[SW Network] 🌐 Making network request: /api/bible/books
[SW Network FAIL] ❌ Network request failed for: /api/bible/books
[SW Network FAIL] 🔍 Error: Failed to fetch
[SW Network FAIL] 💾 Will attempt to serve from cache if available
[SW Cache HIT] Serving from cache "bible-books-cache": /api/bible/books

# When offline
[PWA] 🔴 Offline - serving content from cache
[SW Cache HIT] Serving from cache "bible-books-cache": /api/bible/books
```

## Cache Categories

| Cache Name | Strategy | Content | TTL |
|------------|----------|---------|-----|
| `bible-books-cache` | CacheFirst | Bible books list | 7 days |
| `bible-testaments-cache` | CacheFirst | Testaments list | 7 days |
| `bible-chapters-cache` | NetworkFirst | Bible chapters | 24 hours |
| `bible-explanations-cache` | NetworkFirst | AI explanations | 7 days |
| `chat-history-cache` | NetworkFirst | Chat conversations | 2 hours |
| `local-api-cache` | NetworkFirst | Local API responses | 24 hours |
| `static-font-assets` | StaleWhileRevalidate | Fonts | 1 year |
| `static-image-assets` | StaleWhileRevalidate | Images | 30 days |
| `next-static-js-assets` | CacheFirst | JS bundles | 1 year |
| `next-static-css-assets` | CacheFirst | CSS files | 1 year |

## Production vs Development

- **Development**: Full logging enabled in console
- **Production**: Logging still active in console (no visual utilities)

## Troubleshooting

### No Cache Logs Appearing
1. Ensure you're running in development mode with `bun dev`
2. Check that the service worker is registered (look for "Service worker is ready" message)
3. Make sure you're looking at the correct browser tab's console

### Cache Not Working Offline
1. Load the app while online first (to populate cache)
2. Verify the service worker is controlling the page
3. Check that you're testing URLs that match the cache patterns

### Clear Cache for Testing
```javascript
// In browser console, run:
navigator.serviceWorker.getRegistrations().then(function(registrations) {
  for(let registration of registrations) {
    registration.unregister();
  }
});

// Then refresh the page
```