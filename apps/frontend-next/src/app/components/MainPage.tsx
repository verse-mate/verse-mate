"use client";
import { MainPage, Notifications } from "frontend-base";
import NextDynamic from "next/dynamic";
import type { ReactNode } from "react";

const DynamicBrowserRouter = NextDynamic(
  () => import("frontend-base").then((mod) => mod.MainPage.BrowserRouter),
  { ssr: false },
);

const MyMainPage = ({ children }: { children: ReactNode }) => {
  return (
    <MainPage.QueryProvider>
      <DynamicBrowserRouter>
        {children}
        <Notifications />
      </DynamicBrowserRouter>
    </MainPage.QueryProvider>
  );
};

export default MyMainPage;
