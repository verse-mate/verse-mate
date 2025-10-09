import type { StoryDefault } from "@ladle/react";
import { useSidebar } from "../../hooks/useSidebar";
import { options } from "../../utils/menu-options";
import { Accordion } from "../Accordion";
import { Menu } from "./index";

export default {
  title: "ui/Menu",
} satisfies StoryDefault;

export const Default = () => {
  const { buttonRef, isOpened, sidebarRef, toggleSidebar } = useSidebar();

  return (
    <Menu.Root>
      <Menu.Trigger
        buttonRef={buttonRef}
        isOpened={isOpened}
        toggleSidebar={toggleSidebar}
      />
      <Menu.Sidebar isOpened={isOpened} sidebarRef={sidebarRef}>
        <Accordion.Root>
          {options.map((option) => (
            <Accordion.Item key={option.name} value={option.name}>
              <Accordion.Trigger label={option.label} icon={option.icon} />
              <Accordion.Content styles={{ padding: "20px 24px" }}>
                {option.content}
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </Menu.Sidebar>
    </Menu.Root>
  );
};
