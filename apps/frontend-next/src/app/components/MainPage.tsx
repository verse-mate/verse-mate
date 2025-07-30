"use client";
import { MainPage } from "frontend-base";
import NextDynamic from "next/dynamic";
import type { ReactNode } from "react";

const DynamicBrowserRouter = NextDynamic(
  () => import("frontend-base").then((mod) => mod.MainPage.BrowserRouter),
  { ssr: false },
);

const DynamicOfflineIndicator = NextDynamic(
  () => import("frontend-base").then((mod) => mod.OfflineIndicator),
  { ssr: false },
);

const MyMainPage = ({ children }: { children: ReactNode }) => {
  return (
    <MainPage.QueryProvider>
      <DynamicOfflineIndicator position="top" showWhenOnline={true} />
      <DynamicBrowserRouter>{children}</DynamicBrowserRouter>
    </MainPage.QueryProvider>
  );
};

export default MyMainPage;
