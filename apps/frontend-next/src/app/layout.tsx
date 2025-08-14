import "frontend-base/styles/global.css";
import { $env, type Env, StoreInitializer } from "frontend-envs";
import { PWAServiceWorkerRegistration } from "../components/PWAServiceWorkerRegistration";
import MyMainPage from "./components/MainPage";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  console.log("process.env.API_URL", process.env.API_URL);
  const envValues: Env = {
    apiUrl: process.env.API_URL ?? "http://localhost:3000",
    askVerseMate: process.env.NEXT_PUBLIC_ASK_VERSE_MATE === "true",
  };
  $env.set(envValues);

  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1a365d" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="VerseMate" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <StoreInitializer {...envValues} />

      <body>
        <PWAServiceWorkerRegistration />
        <MyMainPage>{children}</MyMainPage>
      </body>
    </html>
  );
}
