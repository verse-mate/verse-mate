import type { Story, StoryDefault } from "@ladle/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { useRef, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import {
  useGetSearchParams,
  useSaveSearchParams,
} from "../../hooks/useSearchParams";
import {
  useArrayFilter,
  useDropdownToggle,
  useSelectDropdown,
} from "../../hooks/useSelectDropdown";
import { bibleVersions } from "../../utils/bible-versions";
import { explanationTypes } from "../../utils/commentary-options";
import { testaments } from "../../utils/testaments";
import { Accordion } from "../Accordion/index";
import { CheckIcon, ChevronDownIcon } from "../Icons";
import { Tabs } from "../Tabs/index";
import { VerseGrid, useSelectedVerse } from "../VerseGrid/verse-grid";
import { FilterInput } from "./FilterInput/filter-input";
import { SelectDropdown } from "./index";

export default {
  title: "ui/SelectDropdown",
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

export const AccordionSelectWithFilter: Story = () => {
  const { bookId, verseId } = useGetSearchParams();
  const verseIdToString = verseId !== 0 ? verseId.toString() : "";

  const {
    isOpen: leftPanelIsOpen,
    setIsOpen: leftPanelSetIsOpen,
    selectedBook: leftPanelSelectedBook,
    selectedVerse: leftPanelSelectedVerse,
    selectedTab: leftPanelSelectedTab,
    filteredTestaments: leftPanelFilteredTestaments, // Use filteredTestaments instead of filteredBooks
    debouncedFilter: leftPanelDebouncedFilter,
    handleChange: leftPanelHandleChange,
    handleTabChange: leftPanelHandleTabChange,
    handleVerseSelect: leftPanelHandleVerseSelect,
  } = useSelectDropdown(testaments);

  const book = testaments?.find((testament) => testament.b === bookId)?.n;

  return (
    <SelectDropdown.Root
      label="Book: "
      open={leftPanelIsOpen}
      onOpenChange={leftPanelSetIsOpen}
    >
      <SelectDropdown.Trigger
        selectedBook={leftPanelSelectedBook || book || null}
        selectedVerse={leftPanelSelectedVerse || verseIdToString}
        icon={<ChevronDownIcon />}
        defaultPlaceholder="Book"
      />
      <SelectDropdown.Content
        align="start"
        style={{ width: "390px", marginTop: "16px" }}
      >
        <Tabs.Root
          value={leftPanelSelectedTab}
          onValueChange={leftPanelHandleTabChange}
        >
          <Tabs.List>
            <Tabs.Trigger value="OT" label="Old Testament" />
            <Tabs.Trigger value="NT" label="New Testament" />
          </Tabs.List>

          <FilterInput
            placeholder="Filter Books..."
            debouncedFilter={leftPanelDebouncedFilter}
            handleChange={leftPanelHandleChange}
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
                {leftPanelFilteredTestaments.map((book) => (
                  <Accordion.Item value={book.n} key={book.n}>
                    <Accordion.Trigger
                      label={book.n}
                      highlightBook={leftPanelSelectedBook === book.n}
                    />
                    <Accordion.Content>
                      <VerseGrid
                        testament={book.t as TestamentEnum}
                        bookId={String(book.b)}
                        bookName={book.n}
                        verses={Array.from({ length: book.c }, (_, i) =>
                          (i + 1).toString(),
                        )}
                        onVerseSelect={leftPanelHandleVerseSelect}
                        selectedVerse={leftPanelSelectedVerse}
                        selectedBook={leftPanelSelectedBook}
                      />
                    </Accordion.Content>
                  </Accordion.Item>
                ))}
              </Accordion.Root>
            </Tabs.Content>

            <Tabs.Content value="NT">
              <Accordion.Root>
                {leftPanelFilteredTestaments.map((book) => (
                  <Accordion.Item value={book.n} key={book.n}>
                    <Accordion.Trigger
                      label={book.n}
                      highlightBook={leftPanelSelectedBook === book.n}
                    />
                    <Accordion.Content>
                      <VerseGrid
                        testament={book.t as TestamentEnum}
                        bookId={String(book.b)}
                        bookName={book.n}
                        verses={Array.from({ length: book.c }, (_, i) =>
                          (i + 1).toString(),
                        )}
                        onVerseSelect={leftPanelHandleVerseSelect}
                        selectedVerse={leftPanelSelectedVerse}
                        selectedBook={leftPanelSelectedBook}
                      />
                    </Accordion.Content>
                  </Accordion.Item>
                ))}
              </Accordion.Root>
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </SelectDropdown.Content>
    </SelectDropdown.Root>
  );
};

// The rest of your stories remain the same...
export const AccordionSelectWithoutFilter: Story = () => {
  const { bookId, verseId } = useGetSearchParams();
  const verseIdToString = verseId !== 0 ? verseId.toString() : "";

  const {
    isOpen: leftPanelIsOpen,
    setIsOpen: leftPanelSetIsOpen,
    selectedBook: leftPanelSelectedBook,
    selectedVerse: leftPanelSelectedVerse,
    selectedTab: leftPanelSelectedTab,
    filteredBooks: leftPanelFilteredBooks,
    handleTabChange: leftPanelHandleTabChange,
    handleVerseSelect: leftPanelHandleVerseSelect,
  } = useSelectDropdown(testaments);

  const oldTestamentBooks =
    testaments?.filter((testament) => testament.t === "OT") || [];
  const newTestamentBooks =
    testaments?.filter((testament) => testament.t === "NT") || [];
  const book = testaments?.find((testament) => testament.b === bookId)?.n;

  return (
    <SelectDropdown.Root
      label="Book: "
      open={leftPanelIsOpen}
      onOpenChange={leftPanelSetIsOpen}
    >
      <SelectDropdown.Trigger
        selectedBook={leftPanelSelectedBook || book || null}
        selectedVerse={leftPanelSelectedVerse || verseIdToString}
        icon={<ChevronDownIcon />}
        defaultPlaceholder="Book"
      />
      <SelectDropdown.Content
        align="start"
        style={{ width: "390px", marginTop: "16px" }}
      >
        <Tabs.Root
          value={leftPanelSelectedTab}
          onValueChange={leftPanelHandleTabChange}
        >
          <Tabs.List>
            <Tabs.Trigger value="OT" label="Old Testament" />
            <Tabs.Trigger value="NT" label="New Testament" />
          </Tabs.List>

          <div
            style={{
              marginTop: "64px",
              maxHeight: "512px",
              overflowY: "auto",
            }}
          >
            <Tabs.Content value="OT">
              <Accordion.Root>
                {leftPanelFilteredBooks.map((bookName) => {
                  const book = oldTestamentBooks.find((t) => t.n === bookName);
                  if (!book) return null;

                  return (
                    <Accordion.Item value={book.n} key={book.n}>
                      <Accordion.Trigger
                        label={book.n}
                        highlightBook={leftPanelSelectedBook === book.n}
                      />
                      <Accordion.Content>
                        <VerseGrid
                          testament={book.t as TestamentEnum}
                          bookId={String(book.b)}
                          bookName={book.n}
                          verses={Array.from({ length: book.c }, (_, i) =>
                            (i + 1).toString(),
                          )}
                          onVerseSelect={leftPanelHandleVerseSelect}
                          selectedVerse={leftPanelSelectedVerse}
                          selectedBook={leftPanelSelectedBook}
                        />
                      </Accordion.Content>
                    </Accordion.Item>
                  );
                })}
              </Accordion.Root>
            </Tabs.Content>

            <Tabs.Content value="NT">
              <Accordion.Root>
                {leftPanelFilteredBooks.map((bookName) => {
                  const book = newTestamentBooks.find((t) => t.n === bookName);
                  if (!book) return null;

                  return (
                    <Accordion.Item value={book.n} key={book.n}>
                      <Accordion.Trigger
                        label={book.n}
                        highlightBook={leftPanelSelectedBook === book.n}
                      />
                      <Accordion.Content>
                        <VerseGrid
                          testament={book.t as TestamentEnum}
                          bookId={String(book.b)}
                          bookName={book.n}
                          verses={Array.from({ length: book.c }, (_, i) =>
                            (i + 1).toString(),
                          )}
                          onVerseSelect={leftPanelHandleVerseSelect}
                          selectedVerse={leftPanelSelectedVerse}
                          selectedBook={leftPanelSelectedBook}
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
  );
};

export const NormalSelect: Story = () => {
  const { isOpen, setIsOpen, selectedBook, selectedVerse } =
    useSelectDropdown();

  return (
    <SelectDropdown.Root
      label="Commentary: "
      open={isOpen}
      onOpenChange={setIsOpen}
      defaultValue="summary"
    >
      <SelectDropdown.Trigger
        selectedBook={selectedBook}
        selectedVerse={selectedVerse}
        icon={<ChevronDownIcon />}
        defaultPlaceholder="Commentary"
      />

      <SelectDropdown.Content
        align="end"
        style={{
          width: "200px",
          marginTop: "20px",
          zIndex: 1,
        }}
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
  );
};

export const NormalSelectWithFilter: Story = () => {
  const { isOpen, setIsOpen, selectedBook, selectedVerse } =
    useSelectDropdown();

  const { handleChange, filteredArray, debouncedFilter } =
    useArrayFilter(bibleVersions);

  return (
    <SelectDropdown.Root
      label="Version: "
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <SelectDropdown.Trigger
        selectedBook={selectedBook}
        selectedVerse={selectedVerse}
        icon={<ChevronDownIcon />}
        defaultPlaceholder="Book Version"
      />
      <SelectDropdown.Content align="center" style={{ width: "480px" }}>
        <FilterInput
          placeholder="Filter Versions..."
          debouncedFilter={debouncedFilter}
          handleChange={handleChange}
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
          {filteredArray.map((version, _index) => (
            <SelectDropdown.Item
              key={version.key}
              icon={<CheckIcon />}
              value={version.value}
            >
              {version.value}
            </SelectDropdown.Item>
          ))}
        </div>
      </SelectDropdown.Content>
    </SelectDropdown.Root>
  );
};

export const GroupedSelect: Story = () => {
  const {
    isOpen: dropdownIsOpened,
    toggleDropdown: toggleMobileDropdown,
    closeDropdown,
  } = useDropdownToggle();

  const [selectedBibleVersion, setSelectedBibleVersion] = useState<string>("");
  const {
    handleChange: handleMobileChange,
    debouncedFilter: debouncedMobileFilter,
    filteredArray: filteredMobileArray,
  } = useArrayFilter(bibleVersions);

  const handleBibleVersionSelected = (bibleVersion: string) => {
    setSelectedBibleVersion(bibleVersion);
  };

  const {
    handleVerseSelect: handleMobileVerseSelect,
    selectedBookName: selectedMobileBookName,
    selectedTestament: selectedMobileTestament,
    selectedVerse: selectedMobileVerse,
  } = useSelectedVerse();

  const { saveBibleVersionOnURL } = useSaveSearchParams();
  saveBibleVersionOnURL(selectedBibleVersion);

  const {
    selectedBook: leftPanelSelectedBook,
    selectedVerse: leftPanelSelectedVerse,
    selectedTab: leftPanelSelectedTab,
    filteredTestaments: leftPanelFilteredTestaments, // Use filteredTestaments here too
    debouncedFilter: leftPanelDebouncedFilter,
    handleChange: leftPanelHandleChange,
    handleTabChange: leftPanelHandleTabChange,
    handleVerseSelect: leftPanelHandleVerseSelect,
  } = useSelectDropdown(testaments);

  const testamentLabelMap = {
    OT: "Old Testament",
    NT: "New Testament",
  };

  const selectedTestamentLabel = selectedMobileTestament
    ? testamentLabelMap[selectedMobileTestament]
    : "";

  const _contentRef = useRef<HTMLDivElement>(null);

  return (
    <div
      style={{
        backgroundColor: "var(--charcoal-grey)",
        position: "relative",
        zIndex: "1",
        height: 80,
      }}
    >
      <SelectDropdown.GroupedSelect.GroupedRoot>
        <SelectDropdown.GroupedSelect.GroupedTrigger
          selectedBook={null}
          selectedVerse={null}
          defaultPlaceholder="Select a Verse"
          isOpen={dropdownIsOpened}
          toggleDropdown={toggleMobileDropdown}
          onClose={closeDropdown}
          resetFilter={() => {}}
        />

        {dropdownIsOpened && (
          <div>
            <Accordion.Root type="multiple">
              <Accordion.Item value="bibleVersion">
                <Accordion.GroupedTrigger
                  description="Bible Version"
                  selectedContent={selectedBibleVersion || "Select a Version"}
                />
                <Accordion.Content>
                  <FilterInput
                    placeholder="Filter Versions..."
                    debouncedFilter={debouncedMobileFilter}
                    handleChange={handleMobileChange}
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
                    {filteredMobileArray.map((bibleVersion, _index) => (
                      <SelectDropdown.GroupedSelect.GroupedItem
                        key={bibleVersion.key}
                        value={bibleVersion.key}
                        onClick={() =>
                          handleBibleVersionSelected(bibleVersion.key)
                        }
                        highlighted={bibleVersion.key === selectedBibleVersion}
                      />
                    ))}
                  </div>
                </Accordion.Content>
              </Accordion.Item>

              <Accordion.Item value="book">
                <Accordion.GroupedTrigger
                  description="Testament, Book, Verse"
                  selectedContent={
                    selectedMobileTestament
                      ? `${selectedTestamentLabel}, ${selectedMobileBookName}, ${selectedMobileVerse}`
                      : "Select a book"
                  }
                />

                <Accordion.Content>
                  <Tabs.Root
                    value={leftPanelSelectedTab}
                    onValueChange={leftPanelHandleTabChange}
                  >
                    <Tabs.List>
                      <Tabs.Trigger value="OT" label="Old Testament" />
                      <Tabs.Trigger value="NT" label="New Testament" />
                    </Tabs.List>

                    <FilterInput
                      placeholder="Filter Books..."
                      debouncedFilter={leftPanelDebouncedFilter}
                      handleChange={leftPanelHandleChange}
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
                          {leftPanelFilteredTestaments.map((book) => (
                            <Accordion.Item value={book.n} key={book.n}>
                              <Accordion.Trigger
                                label={book.n}
                                highlightBook={leftPanelSelectedBook === book.n}
                              />
                              <Accordion.Content>
                                <VerseGrid
                                  bookId={String(book.b)}
                                  bookName={book.n}
                                  verses={Array.from(
                                    { length: book.c },
                                    (_, i) => (i + 1).toString(),
                                  )}
                                  onVerseSelect={(
                                    bookId,
                                    bookName,
                                    verse,
                                    testament,
                                  ) => {
                                    leftPanelHandleVerseSelect(
                                      bookId,
                                      bookName,
                                      verse,
                                      testament,
                                    );
                                    handleMobileVerseSelect(
                                      testament,
                                      bookName,
                                      verse,
                                    );
                                  }}
                                  selectedBook={leftPanelSelectedBook}
                                  selectedVerse={leftPanelSelectedVerse}
                                  testament={book.t as TestamentEnum}
                                />
                              </Accordion.Content>
                            </Accordion.Item>
                          ))}
                        </Accordion.Root>
                      </Tabs.Content>

                      <Tabs.Content value="NT">
                        <Accordion.Root>
                          {leftPanelFilteredTestaments.map((book) => (
                            <Accordion.Item value={book.n} key={book.n}>
                              <Accordion.Trigger
                                label={book.n}
                                highlightBook={leftPanelSelectedBook === book.n}
                              />
                              <Accordion.Content>
                                <VerseGrid
                                  testament={book.t as TestamentEnum}
                                  bookId={String(book.b)}
                                  bookName={book.n}
                                  verses={Array.from(
                                    { length: book.c },
                                    (_, i) => (i + 1).toString(),
                                  )}
                                  onVerseSelect={(
                                    bookId,
                                    bookName,
                                    verse,
                                    testament,
                                  ) => {
                                    leftPanelHandleVerseSelect(
                                      bookId,
                                      bookName,
                                      verse,
                                      testament,
                                    );
                                    handleMobileVerseSelect(
                                      testament || "",
                                      bookName,
                                      verse,
                                    );
                                  }}
                                  selectedVerse={leftPanelSelectedVerse}
                                  selectedBook={leftPanelSelectedBook}
                                />
                              </Accordion.Content>
                            </Accordion.Item>
                          ))}
                        </Accordion.Root>
                      </Tabs.Content>
                    </div>
                  </Tabs.Root>
                </Accordion.Content>
              </Accordion.Item>
            </Accordion.Root>
          </div>
        )}
      </SelectDropdown.GroupedSelect.GroupedRoot>
    </div>
  );
};
