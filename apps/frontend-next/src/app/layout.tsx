import "frontend-base/styles/global.css";
import { $env, type Env, StoreInitializer } from "frontend-envs";
import MyMainPage from "./components/MainPage";

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  console.log("process.env.API_URL", process.env.API_URL);
  const envValues: Env = {
    apiUrl: process.env.API_URL ?? "http://localhost:4000",
    askVerseMate: process.env.NEXT_PUBLIC_ASK_VERSE_MATE === "true",
  };
  $env.set(envValues);

  return (
    <html lang="en">
      <StoreInitializer {...envValues} />

      <body>
        <MyMainPage>{children}</MyMainPage>
      </body>
    </html>
  );
}
