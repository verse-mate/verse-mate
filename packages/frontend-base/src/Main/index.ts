"use client";

import { MainContent } from "./Content/main-content";
import { Footer } from "./Footer/footer";
import { Header } from "./Header/header";
import { BrowserRouter } from "./Providers/browserRouter";
import { QueryProvider } from "./Providers/useQueryProvider";

export const MainPage = {
  QueryProvider,
  BrowserRouter,
  Header,
  Footer,
  MainContent,
};
