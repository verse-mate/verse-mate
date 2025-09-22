"use client";

import {
  QueryClient,
  QueryClientProvider as ReactQueryClientProvider,
} from "@tanstack/react-query";
import { NotesProvider } from "../../contexts/NotesContext";

const queryClient = new QueryClient();

export const QueryProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <ReactQueryClientProvider client={queryClient}>
      <NotesProvider>{children}</NotesProvider>
    </ReactQueryClientProvider>
  );
};
