interface ShareablePassageParams {
  bookId?: string | null;
  verseId?: string | null;
  testament?: string | null;
  explanationType?: string | null;
  bibleVersion?: string | null;
}

// Allowed hosts for security validation
const ALLOWED_HOSTS = [
  "localhost",
  "verse-mate.apegro.dev",
  "versemate.com", // Add production domain when available
];

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
    return "https://verse-mate.apegro.dev";
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

  // Add query parameters if they exist, with sanitization
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

  return url.toString();
}

export function getPassageTitle(params: ShareablePassageParams): string {
  // Sanitize parameters to prevent XSS in titles
  const bookId = params.bookId ? sanitizeParam(params.bookId) : null;
  const verseId = params.verseId ? sanitizeParam(params.verseId) : null;

  if (bookId && verseId) {
    return `Bible Passage - Book ${bookId}, Verse ${verseId}`;
  }
  return "Bible Passage";
}

export function getPassageDescription(params: ShareablePassageParams): string {
  const version = params.bibleVersion
    ? sanitizeParam(params.bibleVersion)
    : "NASB1995";
  const explanation = params.explanationType
    ? sanitizeParam(params.explanationType)
    : "standard";
  const bookId = params.bookId ? sanitizeParam(params.bookId) : null;
  const verseId = params.verseId ? sanitizeParam(params.verseId) : null;

  if (bookId && verseId) {
    return `Read this passage from the ${version} Bible with ${explanation} explanation on VerseMate`;
  }
  return "Read this Bible passage on VerseMate";
}
