import type { StoryDefault } from "@ladle/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fetchAllChaptersByBook } from "../../hooks/useBible";
import { useProgressBar } from "../../hooks/useProgressBar";
import { ProgressBar } from "./index";

export default {
  title: "ui/ProgressBar",
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies StoryDefault;

export const Default = () => {
  const bookId = 40;
  const verseId = 22;

  const { chapters } = fetchAllChaptersByBook(bookId);

  const { progress } = useProgressBar({
    totalChapters: chapters,
    currentVerse: Number(verseId),
  });

  return (
    <ProgressBar.Root>
      <ProgressBar.IndicatorBackground>
        <ProgressBar.Indicator value={progress} />
      </ProgressBar.IndicatorBackground>
      <ProgressBar.Label value={progress} />
    </ProgressBar.Root>
  );
};
