import "frontend-base/styles/global.css";
import { Notifications } from "frontend-base/admin";
import { $env, type Env, StoreInitializer } from "frontend-envs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VerseMate Admin",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const envValues: Env = {
    apiUrl: process.env.API_URL ?? "http://localhost:4000",
    askVerseMate: false,
    ssoGoogleEnabled: process.env.NEXT_PUBLIC_SSO_GOOGLE_ENABLED === "true",
    ssoAppleEnabled: process.env.NEXT_PUBLIC_SSO_APPLE_ENABLED === "true",
    posthogKey: "",
    posthogHost: "",
    posthogSessionReplay: false,
  };
  $env.set(envValues);

  return (
    <html lang="en">
      <head>
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
      </head>
      <StoreInitializer {...envValues} />
      <body>
        {children}
        <Notifications />
      </body>
    </html>
  );
}
