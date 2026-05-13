"use client";
import { AuthWrapperPage, SignIn } from "frontend-base";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AdminRequiredBanner() {
  const params = useSearchParams();
  if (params?.get("error") !== "admin_required") return null;
  return (
    <div
      role="alert"
      style={{
        background: "#fdecea",
        color: "#611a15",
        border: "1px solid #f5c6cb",
        padding: "12px 16px",
        borderRadius: 6,
        marginBottom: 16,
        fontSize: 14,
      }}
    >
      Admin access required. Sign in with an admin account.
    </div>
  );
}

export default function Login() {
  return (
    <AuthWrapperPage>
      <Suspense fallback={null}>
        <AdminRequiredBanner />
      </Suspense>
      <SignIn mode="admin" />
    </AuthWrapperPage>
  );
}
