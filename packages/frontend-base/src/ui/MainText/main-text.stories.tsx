import type { Story, StoryDefault } from "@ladle/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fetchBookVerse } from "../../hooks/useBible.ts";
import { MainText } from "./index.ts";

export default {
  title: "ui/MainText",
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies StoryDefault;

export const Default: Story = () => {
  const bookId = 40;
  const verseId = "22";

  const { bookVerseData } = fetchBookVerse(bookId, Number(verseId), "NASB1995");

  return (
    <MainText.Root>
      {bookVerseData && (
        <MainText.Content
          bookId={String(bookId)}
          verseId={verseId}
          book={bookVerseData}
        />
      )}
    </MainText.Root>
  );
};
