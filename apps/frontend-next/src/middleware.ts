import { BOOK_SLUGS } from "@/lib/bookSlugs";
import { type NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "./lib/utils";

const publicRoutes = [
  { path: "/", whenAuthenticated: "allow" },
  { path: "/login", whenAuthenticated: "redirect" },
  { path: "/create-account", whenAuthenticated: "redirect" },
] as const;

const REDIRECT_WHEN_NOT_AUTHENTICATED_ROUTE = "/login";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const searchParams = request.nextUrl.searchParams;

  // Redirect query param URLs to slug-based URLs (SEO improvement)
  if (
    path === "/" &&
    searchParams.has("bookId") &&
    searchParams.has("verseId")
  ) {
    const bookIdStr = searchParams.get("bookId");
    const verseIdStr = searchParams.get("verseId");
    const testament = searchParams.get("testament");

    // Only redirect for Bible chapters (not topics)
    if (bookIdStr && verseIdStr && testament !== "TOPIC") {
      const bookId = Number.parseInt(bookIdStr, 10);
      const chapterNumber = Number.parseInt(verseIdStr, 10);

      if (
        !Number.isNaN(bookId) &&
        !Number.isNaN(chapterNumber) &&
        bookId >= 1 &&
        bookId <= 66 &&
        chapterNumber >= 1
      ) {
        const bookSlug = BOOK_SLUGS[bookId];
        if (bookSlug) {
          // Build new URL with slug
          const newUrl = request.nextUrl.clone();
          newUrl.pathname = `/bible/${bookSlug}/${chapterNumber}`;

          // Preserve other query params (explanationType, bibleVersion, etc.)
          // But NOT bookId, verseId, testament - they're in the path now
          const newSearchParams = new URLSearchParams();
          searchParams.forEach((value, key) => {
            if (key !== "bookId" && key !== "verseId" && key !== "testament") {
              newSearchParams.append(key, value);
            }
          });

          newUrl.search = newSearchParams.toString();

          // Use 301 redirect for SEO
          return NextResponse.redirect(newUrl, 301);
        }
      }
    }
  }

  const publicRoute = publicRoutes.find((route) => route.path === path);
  const authToken = request.cookies.get(ACCESS_TOKEN_COOKIE);

  if (!authToken) {
    if (publicRoute) {
      return NextResponse.next();
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = REDIRECT_WHEN_NOT_AUTHENTICATED_ROUTE;
    return NextResponse.redirect(redirectUrl);
  }

  if (publicRoute) {
    if (publicRoute.whenAuthenticated === "redirect") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/";
      return NextResponse.redirect(redirectUrl);
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|assets/logo|assets/fonts|icons|screenshots|favicon.ico|sitemap.xml|robots.txt|sw.js|manifest.json|workbox-.*.js).*)",
  ],
};
