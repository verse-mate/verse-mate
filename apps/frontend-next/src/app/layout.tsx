import "frontend-base/styles/global.css";
import { CookieConsent } from "frontend-base";
import { $env, type Env, StoreInitializer } from "frontend-envs";
import { PWAServiceWorkerRegistration } from "../components/PWAServiceWorkerRegistration";
import { PostHogProvider } from "../providers/PostHogProvider";
import MyMainPage from "./components/MainPage";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const envValues: Env = {
    apiUrl: process.env.API_URL ?? "http://localhost:4000",
    askVerseMate: process.env.NEXT_PUBLIC_ASK_VERSE_MATE === "true",
    ssoGoogleEnabled: process.env.NEXT_PUBLIC_SSO_GOOGLE_ENABLED === "true",
    ssoAppleEnabled: process.env.NEXT_PUBLIC_SSO_APPLE_ENABLED === "true",
    posthogKey: process.env.POSTHOG_KEY ?? "",
    posthogHost: process.env.POSTHOG_HOST ?? "https://app.posthog.com",
    posthogSessionReplay: process.env.POSTHOG_SESSION_REPLAY === "true",
  };
  $env.set(envValues);

  return (
    <html lang="en">
      <head>
        {/* Favicon - multiple formats for browser compatibility */}
        <link rel="icon" type="image/x-icon" href="/favicon_io/favicon.ico" />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon_io/favicon-16x16.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon_io/favicon-32x32.png"
        />

        {/* Apple iOS */}
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/favicon_io/apple-touch-icon.png"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="VerseMate" />

        {/* Android / Chrome */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#1a365d" />
      </head>
      <StoreInitializer {...envValues} />

      <body>
        <PostHogProvider>
          <PWAServiceWorkerRegistration />
          <MyMainPage>{children}</MyMainPage>
          <CookieConsent privacyPolicyUrl="/privacy" />
        </PostHogProvider>
      </body>
    </html>
  );
}
