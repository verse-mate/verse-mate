import type { Story, StoryDefault } from "@ladle/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { useHandleTab } from "../../hooks/useHandleTab";
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
  const { activeTab, setActiveTab } = useHandleTab();

  const [rightPanelContent, setRightPanelContent] = React.useState<any>(null);

  return (
    <RightPanel.Root
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      rightPanelContent={rightPanelContent}
      setRightPanelContent={setRightPanelContent}
    >
      <RightPanel.Nav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setRightPanelContent={setRightPanelContent}
      />
      <RightPanel.Content
        isViewingTopic={false}
        topicId=""
        session={null}
        explanation={null}
        conversationsHistory={[]}
        selectConversation={() => {}}
        askVerseMate={true}
        rightPanelContent="default"
        setRightPanelContent={() => {}}
        selectedBibleVersion="NASB1995"
        handleBibleVersionSelected={() => {}}
        handleDesktopSwipe={{ ref: () => {} }}
      />
    </RightPanel.Root>
  );
};
