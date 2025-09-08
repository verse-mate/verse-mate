import type { Story, StoryDefault } from "@ladle/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { fetchAllChaptersByBook, fetchExplanation } from "../../hooks/useBible";
import { useConversationManager } from "../../hooks/useConversationManager";
import { useHandleTab } from "../../hooks/useHandleTab";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { userSession } from "../../hooks/userSession";
import { RightPanel } from "./index";

import { useSwipeable } from "react-swipeable";

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

  const { chapters } = fetchAllChaptersByBook(bookId);
  const { explanation } = fetchExplanation(
    bookId,
    Number(verseId),
    explanationType,
  );
  const { activeTab, setActiveTab } = useHandleTab();

  const { conversationsHistory, selectConversation } =
    useConversationManager(session);

  const askVerseMate = process.env.NEXT_PUBLIC_ASK_VERSE_MATE === "true";

  const [rightPanelContent, setRightPanelContent] = React.useState<any>(null);

  const handleDesktopSwipe = useSwipeable({
    onSwipedRight: () => console.log("swiped right"),
    onSwipedLeft: () => console.log("swiped left"),
  });

  return (
    <RightPanel.Root
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      rightPanelContent={rightPanelContent}
      setRightPanelContent={setRightPanelContent}
    >
      <RightPanel.Nav
        activeTab={activeTab}
        askVerseMate={askVerseMate}
        setActiveTab={setActiveTab}
        rightPanelContent={rightPanelContent}
        setRightPanelContent={setRightPanelContent}
      />
      <RightPanel.Content
        conversationsHistory={conversationsHistory}
        explanation={explanation}
        chapters={chapters}
        session={session}
        selectConversation={selectConversation}
        askVerseMate={askVerseMate}
        rightPanelContent={rightPanelContent}
        setRightPanelContent={setRightPanelContent}
        selectedBibleVersion="NASB1995"
        handleBibleVersionSelected={() => {}}
        handleDesktopSwipe={handleDesktopSwipe}
      />
    </RightPanel.Root>
  );
};
