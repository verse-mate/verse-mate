import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    // Redirect to app subdomain
    if (typeof window !== "undefined") {
      window.location.href = "https://app.versemate.org";
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Redirecting to app...</h1>
        <p className="text-gray-600">
          You will be redirected to{" "}
          <a
            href="https://app.versemate.org"
            className="text-purple-600 underline"
          >
            app.versemate.org
          </a>
        </p>
      </div>
    </div>
  );
}
