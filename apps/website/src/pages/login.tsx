import { useEffect } from "react";
import { navigateToLogin, getAppUrl } from "@/lib/navigation";

export default function Login() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      navigateToLogin();
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="text-center">
        <h1 className="mb-4 font-merriweather text-2xl font-bold text-brand-black">
          Redirecting to login&hellip;
        </h1>
        <p className="font-inter text-base text-brand-muted">
          You will be redirected to{" "}
          <a
            href={`${getAppUrl()}/login`}
            className="font-medium text-brand-gold underline"
          >
            app.versemate.org
          </a>
        </p>
      </div>
    </div>
  );
}
