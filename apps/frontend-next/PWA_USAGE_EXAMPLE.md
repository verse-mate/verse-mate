# VerseMate PWA Implementation - Usage Examples

## Overview
VerseMate now supports Progressive Web App (PWA) functionality with comprehensive offline capabilities for Bible reading and study.

## PWA Features Implemented

### 1. **Basic PWA Setup**
- ✅ Web App Manifest with proper metadata
- ✅ Service Worker with caching strategies
- ✅ PWA icons in all required sizes
- ✅ Mobile-optimized experience

### 2. **Offline Bible Reading**
- ✅ Cache Bible chapters for offline access
- ✅ Cache AI-generated explanations
- ✅ Store user reading progress
- ✅ Smart sync when back online

### 3. **Cache Management**
- ✅ Automatic cache cleanup
- ✅ Configurable cache limits
- ✅ Storage usage monitoring
- ✅ Manual cache management

## Component Usage Examples

### 1. Offline Status Indicator
```tsx
import { OfflineIndicator } from 'frontend-base';

function App() {
  return (
    <div>
      <OfflineIndicator position="top" />
      {/* Your app content */}
    </div>
  );
}
```

### 2. Offline Bible Chapter Hook
```tsx
import { useOfflineBibleChapter } from 'frontend-base';

function BibleChapter({ bookId, chapterNumber }) {
  const { data, loading, error, isFromCache, cacheChapter } = useOfflineBibleChapter({
    bookId,
    chapterNumber,
    fetchFunction: () => api.bible.chapter.get({ bookId, chapterNumber }),
    enableOffline: true
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {isFromCache && <div>📱 Viewing cached content</div>}
      <h1>{data.name}</h1>
      <button onClick={cacheChapter}>
        💾 Save for Offline
      </button>
      {/* Render chapter content */}
    </div>
  );
}
```

### 3. Download Book for Offline
```tsx
import { OfflineDownload } from 'frontend-base';

function BookPage({ book }) {
  const fetchChapter = async (chapterNumber) => {
    return api.bible.chapter.get({ 
      bookId: book.id, 
      chapterNumber 
    });
  };

  return (
    <div>
      <h1>{book.name}</h1>
      <OfflineDownload
        bookId={book.id}
        bookName={book.name}
        totalChapters={book.totalChapters}
        fetchChapterFunction={fetchChapter}
      />
      {/* Book content */}
    </div>
  );
}
```

### 4. Offline Status Hook
```tsx
import { useOfflineStatus } from 'frontend-base';

function NetworkStatus() {
  const { isOnline, isOffline, wasOffline, connectionType } = useOfflineStatus();

  return (
    <div>
      <p>Status: {isOnline ? '🟢 Online' : '🔴 Offline'}</p>
      {wasOffline && isOnline && <p>🔄 Syncing data...</p>}
      {connectionType && <p>Connection: {connectionType}</p>}
    </div>
  );
}
```

### 5. Cache Settings Management
```tsx
import { CacheSettings } from 'frontend-base';

function SettingsPage() {
  return (
    <div>
      <h1>App Settings</h1>
      <CacheSettings />
    </div>
  );
}
```

### 6. Data Synchronization
```tsx
import { 
  saveUserProgressForSync, 
  startSync, 
  onSyncStatusChange 
} from 'frontend-base';

function BibleReader({ userId, bookId, chapterNumber }) {
  useEffect(() => {
    // Save reading progress (works offline)
    saveUserProgressForSync(userId, bookId, chapterNumber);

    // Listen for sync status changes
    const unsubscribe = onSyncStatusChange((status) => {
      console.log('Sync status:', status);
      if (status === 'complete') {
        toast.success('Data synced successfully!');
      }
    });

    return unsubscribe;
  }, [userId, bookId, chapterNumber]);

  // Component content...
}
```

## Installation

Users can install VerseMate as a PWA by:

1. **On mobile browsers**: Look for "Add to Home Screen" or "Install App" prompt
2. **On desktop Chrome/Edge**: Click the install icon in the address bar
3. **Manual installation**: Open browser menu → "Install VerseMate"

## Cache Configuration

Default cache settings:
- **Max cache size**: 50MB
- **Max cache age**: 30 days  
- **Auto cleanup**: Enabled every 24 hours
- **Bible chapters**: Cached for 24 hours
- **Explanations**: Cached for 7 days
- **Books metadata**: Cached for 7 days

## Testing PWA Features

1. **Install app**: Build the project and test installation
2. **Offline mode**: Turn off internet and verify cached content loads
3. **Cache management**: Check browser DevTools → Application → Storage
4. **Lighthouse audit**: Run PWA audit to verify compliance
5. **Sync testing**: Go offline, make changes, go online, verify sync

## Browser Support

- ✅ Chrome 67+
- ✅ Firefox 68+
- ✅ Safari 14+
- ✅ Edge 79+
- ✅ Mobile browsers with PWA support

## Performance Benefits

- **Faster loading**: Cached static assets and API responses
- **Offline access**: Continue reading without internet
- **Reduced data usage**: Smart caching reduces network requests
- **Native app feel**: Installable with app-like experience