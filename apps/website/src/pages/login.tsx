import { getAppUrl, navigateToLogin } from "@/lib/navigation";
import { useEffect } from "react";

export default function Login() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      navigateToLogin();
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Redirecting to login...</h1>
        <p className="text-gray-600">
          You will be redirected to{" "}
          <a
            href={`${getAppUrl()}/login`}
            className="text-purple-600 underline"
          >
            app.versemate.org
          </a>
        </p>
      </div>
    </div>
  );
}
