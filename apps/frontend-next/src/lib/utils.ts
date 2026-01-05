export function getUrl(path?: string): string {
  const baseUrl = process.env.APP_URL || "https://app.versemate.org";
  const normalizedPath =
    path && !path.startsWith("/") ? `/${path}` : path || "";
  return `${baseUrl}${normalizedPath}`;
}

export const ACCESS_TOKEN_COOKIE = "accessToken";
