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
