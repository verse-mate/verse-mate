"use client";
import { AdminGuard, Notifications } from "frontend-base";
import type { ReactNode } from "react";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AdminGuard>
      {children}
      <Notifications />
    </AdminGuard>
  );
}
