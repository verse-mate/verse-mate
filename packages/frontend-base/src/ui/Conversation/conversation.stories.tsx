import type { Story, StoryDefault } from "@ladle/react";
import { messages } from "../../utils/user-ai-messages";
import { VerseMateIcon } from "../Icons";
import { Conversation } from "./index";
export default {
  title: "ui/Conversation",
} satisfies StoryDefault;

export const Default: Story = () => {
  return (
    <div style={{ backgroundColor: "var(--fantasy)" }}>
      <Conversation.Root>
        <Conversation.Content>
          {messages.map((data, index) => {
            if (data.role === "user" && typeof data.content === "string") {
              return (
                <Conversation.UserMessageBlock
                  key={index.toString()}
                  message={data.content}
                />
              );
            }

            if (data.role === "assistant" && typeof data.content === "object") {
              return (
                <Conversation.AIMessageBlock
                  icon={<VerseMateIcon />}
                  key={index.toString()}
                  message={data.content.content}
                />
              );
            }

            return null;
          })}
        </Conversation.Content>
      </Conversation.Root>
    </div>
  );
};
