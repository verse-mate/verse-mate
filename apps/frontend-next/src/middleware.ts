import { type NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "./lib/utils";

const LOGIN_PATH = "/login";
const ADMIN_HOME = "/admin";
const _ADMIN_REQUIRED_REDIRECT = `${LOGIN_PATH}?error=admin_required`;
// Admin app — never cache HTML at the CDN. Overrides the default
// s-maxage=31536000 that OpenNext applies to statically prerendered routes.
const NO_STORE = "private, no-store";

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", NO_STORE);
  return response;
}

function isPublicPath(pathname: string): boolean {
  if (pathname === LOGIN_PATH) return true;
  if (pathname === "/auth/callback" || pathname.startsWith("/auth/callback/")) {
    return true;
  }
  return false;
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = "";
  return withNoStore(NextResponse.redirect(url));
}

function redirectAdminRequired(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = "?error=admin_required";
  const response = NextResponse.redirect(url);
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  return withNoStore(response);
}

async function fetchIsAdmin(accessToken: string): Promise<boolean | null> {
  const apiUrl = process.env.API_URL || "https://api.versemate.org";
  try {
    const res = await fetch(`${apiUrl}/user/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { is_admin?: boolean };
    return body.is_admin === true;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const accessTokenCookie = request.cookies.get(ACCESS_TOKEN_COOKIE);
  const accessToken = accessTokenCookie?.value;

  if (isPublicPath(path)) {
    if (path === LOGIN_PATH && accessToken) {
      const isAdmin = await fetchIsAdmin(accessToken);
      if (isAdmin === true) {
        const url = request.nextUrl.clone();
        url.pathname = ADMIN_HOME;
        url.search = "";
        return withNoStore(NextResponse.redirect(url));
      }
      if (isAdmin === false) {
        return redirectAdminRequired(request);
      }
    }
    return withNoStore(NextResponse.next());
  }

  if (!accessToken) {
    return redirectToLogin(request);
  }

  const isAdmin = await fetchIsAdmin(accessToken);

  if (isAdmin === null) {
    return redirectToLogin(request);
  }

  if (isAdmin !== true) {
    return redirectAdminRequired(request);
  }

  if (path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_HOME;
    url.search = "";
    return withNoStore(NextResponse.redirect(url));
  }

  return withNoStore(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|assets/logo|assets/fonts|icons|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
