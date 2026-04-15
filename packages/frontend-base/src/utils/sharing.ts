import { getBookSlug } from "./bookSlugs";

interface ShareablePassageParams {
  bookId?: string | null;
  verseId?: string | null;
  testament?: string | null;
  explanationType?: string | null;
  bibleVersion?: string | null;
  chapterNumber?: string | number | null;
  startVerse?: string | number | null;
  endVerse?: string | number | null;
}

// Allowed hosts for security validation
const ALLOWED_HOSTS = ["localhost", "versemate.org", "versemate.com"];

/**
 * Validates and sanitizes a URL origin
 */
function validateOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    // Check if hostname is in allowed list
    const isAllowed = ALLOWED_HOSTS.some(
      (allowedHost) =>
        hostname === allowedHost || hostname.endsWith(`.${allowedHost}`),
    );

    if (!isAllowed) {
      throw new Error(`Origin ${hostname} not allowed`);
    }

    // Normalize to https for allowed public hosts; keep http only for localhost
    const isLocalhost = hostname === "localhost";
    const normalized = isLocalhost
      ? `http://${hostname}:3000`
      : `https://${hostname}`;
    return normalized;
  } catch (error) {
    console.warn("Invalid origin detected, using fallback:", error);
    return "https://app.versemate.org";
  }
}

/**
 * Sanitizes a parameter value to prevent XSS
 */
function sanitizeParam(value: string): string {
  return value.replace(/[<>"'&]/g, (match) => {
    const escapeMap: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#x27;",
      "&": "&amp;",
    };
    return escapeMap[match] || match;
  });
}

/**
 * Gets the base URL from environment or window location with security validation
 */
function getBaseUrl(): string {
  // In SSR context, use environment variable
  if (typeof window === "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    if (envUrl) {
      return validateOrigin(envUrl);
    }
    return "https://app.versemate.org";
  }

  // In browser context, validate the current origin
  return validateOrigin(window.location.origin);
}

export function generateShareableUrl(params: ShareablePassageParams): string {
  const baseUrl = getBaseUrl();
  const url = new URL(baseUrl);

  const bookIdNum = params.bookId ? Number.parseInt(params.bookId, 10) : null;
  // Use chapterNumber if available, otherwise verseId (legacy mapping)
  const chapterNum = params.chapterNumber
    ? params.chapterNumber
    : params.verseId;

  // Try to generate a modern slug-based URL
  if (bookIdNum && chapterNum) {
    const slug = getBookSlug(bookIdNum);
    if (slug) {
      url.pathname = `/bible/${slug}/${chapterNum}`;

      // Add clean query params
      if (params.explanationType && params.explanationType !== "summary") {
        url.searchParams.set("t", sanitizeParam(params.explanationType));
      }
      if (params.bibleVersion && params.bibleVersion !== "NASB1995") {
        url.searchParams.set("v", sanitizeParam(params.bibleVersion));
      }

      // Support verse ranges (e.g., verses=1-5 or verses=1)
      if (params.startVerse !== null && params.startVerse !== undefined) {
        const startVerse = sanitizeParam(String(params.startVerse));
        if (params.endVerse && params.endVerse !== params.startVerse) {
          const endVerse = sanitizeParam(String(params.endVerse));
          url.searchParams.set("verses", `${startVerse}-${endVerse}`);
        } else {
          url.searchParams.set("verses", startVerse);
        }
      }

      return url.toString();
    }
  }

  // Fallback to legacy query parameters if slug generation fails
  if (params.bookId) {
    url.searchParams.set("bookId", sanitizeParam(params.bookId));
  }
  if (params.verseId) {
    url.searchParams.set("verseId", sanitizeParam(params.verseId));
  }
  if (params.testament) {
    url.searchParams.set("testament", sanitizeParam(params.testament));
  }
  if (params.explanationType) {
    url.searchParams.set(
      "explanationType",
      sanitizeParam(params.explanationType),
    );
  }
  if (params.bibleVersion) {
    url.searchParams.set("bibleVersion", sanitizeParam(params.bibleVersion));
  }
  if (params.chapterNumber) {
    url.searchParams.set(
      "chapter",
      sanitizeParam(String(params.chapterNumber)),
    );
  }
  // Support verse ranges (e.g., verses=1-5 or verses=1)
  if (params.startVerse !== null && params.startVerse !== undefined) {
    const startVerse = sanitizeParam(String(params.startVerse));
    if (params.endVerse && params.endVerse !== params.startVerse) {
      const endVerse = sanitizeParam(String(params.endVerse));
      url.searchParams.set("verses", `${startVerse}-${endVerse}`);
    } else {
      url.searchParams.set("verses", startVerse);
    }
  }

  return url.toString();
}

export function getPassageTitle(
  params: ShareablePassageParams,
  bookName?: string,
): string {
  // Sanitize parameters to prevent XSS in titles
  const bookId = params.bookId ? sanitizeParam(params.bookId) : null;
  const verseId = params.verseId ? sanitizeParam(params.verseId) : null;
  const chapter = params.chapterNumber
    ? sanitizeParam(String(params.chapterNumber))
    : null;
  const startVerse = params.startVerse
    ? sanitizeParam(String(params.startVerse))
    : null;
  const endVerse = params.endVerse
    ? sanitizeParam(String(params.endVerse))
    : null;
  const name = bookName ? sanitizeParam(bookName) : null;

  // Build title based on available parameters
  if (name && chapter) {
    if (startVerse && endVerse && startVerse !== endVerse) {
      return `${name} ${chapter}:${startVerse}-${endVerse}`;
    }
    if (startVerse) {
      return `${name} ${chapter}:${startVerse}`;
    }
    return `${name} ${chapter}`;
  }

  if (bookId && verseId) {
    return `Bible Passage - Book ${bookId}, Verse ${verseId}`;
  }
  return "Bible Passage";
}

export function getPassageDescription(
  params: ShareablePassageParams,
  bookName?: string,
): string {
  const version = params.bibleVersion
    ? sanitizeParam(params.bibleVersion)
    : "NASB1995";
  const explanation = params.explanationType
    ? sanitizeParam(params.explanationType)
    : "standard";
  const bookId = params.bookId ? sanitizeParam(params.bookId) : null;
  const verseId = params.verseId ? sanitizeParam(params.verseId) : null;
  const name = bookName ? sanitizeParam(bookName) : null;
  const chapter = params.chapterNumber
    ? sanitizeParam(String(params.chapterNumber))
    : null;
  const startVerse = params.startVerse
    ? sanitizeParam(String(params.startVerse))
    : null;
  const endVerse = params.endVerse
    ? sanitizeParam(String(params.endVerse))
    : null;

  // Build description based on available parameters
  if (name && chapter) {
    if (startVerse && endVerse && startVerse !== endVerse) {
      return `Read ${name} ${chapter}:${startVerse}-${endVerse} from the ${version} Bible on VerseMate`;
    }
    if (startVerse) {
      return `Read ${name} ${chapter}:${startVerse} from the ${version} Bible on VerseMate`;
    }
    return `Read ${name} chapter ${chapter} from the ${version} Bible on VerseMate`;
  }

  if (bookId && verseId) {
    return `Read this passage from the ${version} Bible with ${explanation} explanation on VerseMate`;
  }
  return "Read this Bible passage on VerseMate";
}
