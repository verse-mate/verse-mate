"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { userSession } from "../../hooks/userSession";

interface AdminGuardProps {
  children: ReactNode;
}

export const AdminGuard = ({ children }: AdminGuardProps) => {
  const { session, loading } = userSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!session || !session.is_admin)) {
      router.push("/");
    }
  }, [session, loading, router]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        Loading...
      </div>
    );
  }

  if (!session || !session.is_admin) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        Unauthorized - Admin access required
      </div>
    );
  }

  return <>{children}</>;
};
