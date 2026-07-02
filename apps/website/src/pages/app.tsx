import { useEffect } from "react";
import { getAppUrl, navigateToApp } from "@/lib/navigation";

export default function App() {
  useEffect(() => {
    // Redirect to the app (helper guards for SSR + resolves the right origin).
    navigateToApp();
  }, []);

  return (
    <div
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-white px-6"
    >
      <div className="text-center">
        <h1 className="mb-4 font-merriweather text-2xl font-bold text-brand-black">
          Redirecting to app&hellip;
        </h1>
        <p className="font-inter text-base text-brand-muted">
          You will be redirected to{" "}
          <a
            href={getAppUrl()}
            className="font-medium text-brand-gold underline"
          >
            app.versemate.org
          </a>
        </p>
      </div>
    </div>
  );
}
