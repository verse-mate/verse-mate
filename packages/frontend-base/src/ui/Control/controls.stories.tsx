import type { Story, StoryDefault } from "@ladle/react";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { BrowserRouter } from "react-router-dom";
import {
  useArrayFilter,
  useSelectDropdown,
} from "../../hooks/useSelectDropdown";
import { useSidebar } from "../../hooks/useSidebar";
import * as Icon from "../../ui/Icons";
import { bibleVersions } from "../../utils/bible-versions";
import { explanationTypes } from "../../utils/commentary-options";
import { homeOptions } from "../../utils/home-options";
import { options } from "../../utils/menu-options";
import { testaments } from "../../utils/testaments";
import { Accordion } from "../Accordion";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  HomeIcon,
  OpenedBook,
  PencilSquareIcon,
} from "../Icons";
import { Label } from "../Label";
import { LinkItem } from "../LinkItem/link-item";
import { Menu } from "../Menu";
import { SelectDropdown } from "../SelectDropdown";
import { FilterInput } from "../SelectDropdown/FilterInput/filter-input";
import { Tabs } from "../Tabs";
import { VerseGrid } from "../VerseGrid/verse-grid";
import { TestamentControl } from "./index";

export default {
  title: "ui/Controls",
  decorators: [
    (Story) => (
      <BrowserRouter>
        <Story />
      </BrowserRouter>
    ),
  ],
} satisfies StoryDefault;

export const Testament: Story = () => {
  const { buttonRef, isOpened, sidebarRef, toggleSidebar } = useSidebar();

  const {
    isOpen: versionIsOpen,
    setIsOpen: VersionSetIsOpen,
    selectedBook: versionSelectedBook,
    selectedVerse: versionSelectedVerse,
  } = useSelectDropdown();

  const {
    handleChange: handleOnChange,
    filteredArray,
    debouncedFilter: debounceOnFilter,
  } = useArrayFilter(bibleVersions);

  const {
    isOpen,
    setIsOpen,
    selectedBook,
    selectedVerse,
    selectedTab,
    filteredBooks,
    debouncedFilter,
    handleChange,
    handleTabChange,
    handleVerseSelect,
  } = useSelectDropdown(testaments);

  const oldTestamentBooks =
    testaments?.filter((testament) => testament.t === "OT") || [];
  const newTestamentBooks =
    testaments?.filter((testament) => testament.t === "NT") || [];

  return (
    <div
      style={{
        width: "936px",
        height: "768px",
        position: "relative",
      }}
    >
      <TestamentControl.Root>
        <Menu.Root
          style={{
            marginLeft: "24px",
          }}
        >
          <Menu.Trigger
            buttonRef={buttonRef}
            isOpened={isOpened}
            toggleSidebar={toggleSidebar}
          />
          <Menu.Sidebar
            isOpened={isOpened}
            sidebarRef={sidebarRef}
            style={{
              position: "absolute",
              top: "56px",
              height: "calc(100%)",
            }}
          >
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

        <div style={{ marginLeft: "48px", display: "flex", gap: "48px" }}>
          <SelectDropdown.Root
            label="Version: "
            open={versionIsOpen}
            onOpenChange={VersionSetIsOpen}
          >
            <SelectDropdown.Trigger
              selectedBook={versionSelectedBook}
              selectedVerse={versionSelectedVerse}
              icon={<ChevronDownIcon />}
              defaultPlaceholder="Version"
            />

            <SelectDropdown.Content
              align="start"
              style={{ width: "480px", marginTop: "16px" }}
            >
              <FilterInput
                placeholder="Filter Versions..."
                debouncedFilter={debounceOnFilter}
                handleChange={handleOnChange}
                filterable
                position="top"
              />

              <div
                style={{
                  marginTop: "64px",
                  maxHeight: "512px",
                  overflowY: "auto",
                }}
              >
                {filteredArray.map((version, index) => (
                  <SelectDropdown.Item
                    key={version.key}
                    icon={<CheckIcon />}
                    value={`item-${index}`}
                  >
                    {version.value}
                  </SelectDropdown.Item>
                ))}
              </div>
            </SelectDropdown.Content>
          </SelectDropdown.Root>

          <SelectDropdown.Root
            label="Book: "
            open={isOpen}
            onOpenChange={setIsOpen}
          >
            <SelectDropdown.Trigger
              selectedBook={selectedBook}
              selectedVerse={selectedVerse}
              icon={<ChevronDownIcon />}
              defaultPlaceholder="Book"
            />
            <SelectDropdown.Content
              align="start"
              style={{ width: "390px", marginTop: "16px" }}
            >
              <Tabs.Root value={selectedTab} onValueChange={handleTabChange}>
                <Tabs.List>
                  <Tabs.Trigger value="OT" label="Old Testament" />
                  <Tabs.Trigger value="NT" label="New Testament" />
                </Tabs.List>

                <FilterInput
                  placeholder="Filter Books..."
                  debouncedFilter={debouncedFilter}
                  handleChange={handleChange}
                  filterable
                  position="under"
                />

                <div
                  style={{
                    marginTop: "128px",
                    maxHeight: "512px",
                    overflowY: "auto",
                  }}
                >
                  <Tabs.Content value="OT">
                    <Accordion.Root>
                      {filteredBooks.map((bookName) => {
                        const book = oldTestamentBooks.find(
                          (t) => t.n === bookName,
                        );
                        if (!book) return null;

                        return (
                          <Accordion.Item value={book.n} key={book.n}>
                            <Accordion.Trigger
                              label={book.n}
                              highlightBook={selectedBook === book.n}
                            />
                            <Accordion.Content>
                              <VerseGrid
                                testament={book.t as TestamentEnum}
                                bookId={String(book.b)}
                                bookName={book.n}
                                verses={Array.from({ length: book.c }, (_, i) =>
                                  (i + 1).toString(),
                                )}
                                onVerseSelect={handleVerseSelect}
                                selectedVerse={selectedVerse}
                                selectedBook={selectedBook}
                              />
                            </Accordion.Content>
                          </Accordion.Item>
                        );
                      })}
                    </Accordion.Root>
                  </Tabs.Content>

                  <Tabs.Content value="NT">
                    <Accordion.Root>
                      {filteredBooks.map((bookName) => {
                        const book = newTestamentBooks.find(
                          (t) => t.n === bookName,
                        );
                        if (!book) return null;

                        return (
                          <Accordion.Item value={book.n} key={book.n}>
                            <Accordion.Trigger
                              label={book.n}
                              highlightBook={selectedBook === book.n}
                            />
                            <Accordion.Content>
                              <VerseGrid
                                testament={book.t as TestamentEnum}
                                bookId={String(book.b)}
                                bookName={book.n}
                                verses={Array.from({ length: book.c }, (_, i) =>
                                  (i + 1).toString(),
                                )}
                                onVerseSelect={handleVerseSelect}
                                selectedVerse={selectedVerse}
                                selectedBook={selectedBook}
                              />
                            </Accordion.Content>
                          </Accordion.Item>
                        );
                      })}
                    </Accordion.Root>
                  </Tabs.Content>
                </div>
              </Tabs.Root>
            </SelectDropdown.Content>
          </SelectDropdown.Root>
        </div>
      </TestamentControl.Root>
    </div>
  );
};

export const Commentary: Story = () => {
  const { isOpen, setIsOpen, selectedBook, selectedVerse } =
    useSelectDropdown();

  const { buttonRef, isOpened, sidebarRef, toggleSidebar } = useSidebar();

  return (
    <div
      style={{
        width: "504px",
        height: "768px",
        position: "relative",
      }}
    >
      <TestamentControl.Root flexBetween>
        <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
          <Menu.Root>
            <Menu.Trigger
              icon={
                <HomeIcon
                  fill={`${isOpened ? "var(--dust)" : "var(--snow)"}`}
                />
              }
              buttonRef={buttonRef}
              isOpened={isOpened}
              toggleSidebar={toggleSidebar}
            />
            <Menu.Sidebar
              isOpened={isOpened}
              sidebarRef={sidebarRef}
              style={{
                position: "absolute",
                top: "56px",
                height: "calc(100% - 56px)",
              }}
              fullWidth={true}
            >
              <Accordion.Root>
                {homeOptions.map((option) => (
                  <Accordion.Item key={option.name} value={option.name}>
                    <Accordion.Trigger
                      label={option.label}
                      icon={option.icon}
                    />
                    <Accordion.Content styles={{ padding: "20px 24px" }}>
                      {option.content}
                    </Accordion.Content>
                  </Accordion.Item>
                ))}
                <LinkItem
                  icon={<Icon.HistoryIcon />}
                  label={"Ask VerseMate History"}
                  link="/ask-verse-mate"
                />
              </Accordion.Root>
            </Menu.Sidebar>
          </Menu.Root>
          <OpenedBook fill={`${!isOpened ? "var(--dust)" : "var(--snow)"}`} />
        </div>

        <div style={{ display: isOpened ? "none" : "block" }}>
          <SelectDropdown.Root
            label="Commentary: "
            open={isOpen}
            onOpenChange={setIsOpen}
          >
            <SelectDropdown.Trigger
              selectedBook={selectedBook}
              selectedVerse={selectedVerse}
              icon={<ChevronDownIcon />}
              defaultPlaceholder="Commentary"
            />

            <SelectDropdown.Content
              align="end"
              style={{ width: "200px", marginTop: "16px" }}
            >
              {explanationTypes.map((option) => (
                <SelectDropdown.Item
                  key={option.value}
                  icon={<CheckIcon />}
                  value={option.value}
                >
                  {option.label}
                </SelectDropdown.Item>
              ))}
            </SelectDropdown.Content>
          </SelectDropdown.Root>
        </div>
      </TestamentControl.Root>
    </div>
  );
};

export const AskVerseMate: Story = () => {
  return (
    <TestamentControl.Root
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <ArrowLeftIcon
        style={{
          position: "absolute",
          left: "24px",
        }}
      />
      <Label>Ask VerseMate</Label>
    </TestamentControl.Root>
  );
};

export const ConversationHistory: Story = () => {
  return (
    <TestamentControl.Root
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0 32px",
      }}
    >
      <Label>Conversation History</Label>
      <PencilSquareIcon />
    </TestamentControl.Root>
  );
};
