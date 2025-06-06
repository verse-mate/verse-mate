import type { Story, StoryDefault } from "@ladle/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { fetchExplanation } from "../../hooks/useBible";
import { useConversationManager } from "../../hooks/useConversationManager";
import { useHandleTab } from "../../hooks/useHandleTab";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { userSession } from "../../hooks/userSession";
import { RightPanel } from "./index";

export default {
  title: "ui/RightPanel",
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <BrowserRouter>
          <Story />
        </BrowserRouter>
      </QueryClientProvider>
    ),
  ],
} satisfies StoryDefault;

export const Default: Story = () => {
  const { session } = userSession();

  const { bookId, verseId, explanationType } = useGetSearchParams();

  const { explanation } = fetchExplanation(
    bookId,
    Number(verseId),
    explanationType,
  );
  const { activeTab, setActiveTab } = useHandleTab();

  const { conversationsHistory, selectConversation, handleChatExists } =
    useConversationManager(session);

  const askVerseMate = process.env.NEXT_PUBLIC_ASK_VERSE_MATE === "true";

  return (
    <RightPanel.Root setActiveTab={setActiveTab}>
      <RightPanel.Nav activeTab={activeTab} askVerseMate={askVerseMate} />
      <RightPanel.Content
        conversationsHistory={conversationsHistory}
        explanation={explanation}
        session={session}
        selectConversation={selectConversation}
        askVerseMate={askVerseMate}
      />
    </RightPanel.Root>
  );
};
