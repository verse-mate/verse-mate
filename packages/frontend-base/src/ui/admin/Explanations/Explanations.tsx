"use client";
import { api } from "backend-api";
import { useEffect, useState } from "react";
import { bibleVersions } from "../../../utils/bible-versions";
import { testaments } from "../../../utils/testaments";
import { Button } from "../../Button/Button";
import { Dialog } from "../../Dialog";
import { CheckIcon, ChevronDownIcon } from "../../Icons";
import { SelectDropdown } from "../../SelectDropdown";
import styles from "./Explanations.module.css";

const bookOptions = testaments;

export const Explanations = () => {
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | "all">("all");
  const [selectedBibleVersion, setSelectedBibleVersion] =
    useState<string>("NASB1995");

  // Dropdown states
  const [bookDropdownOpen, setBookDropdownOpen] = useState(false);
  const [chapterDropdownOpen, setChapterDropdownOpen] = useState(false);
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);

  const [isBibleBatch, setIsBibleBatch] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [promptsModalOpen, setPromptsModalOpen] = useState(false);
  const [settingPrompts, setSettingPrompts] = useState(false);

  const selectedBookData = bookOptions.find((book) => book.n === selectedBook);
  const selectedVersionData = bibleVersions.find(
    (version) => version.key === selectedBibleVersion,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset chapter when book changes
  useEffect(() => {
    setSelectedChapter("all");
  }, [selectedBook]);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const response = await api.admin.explanations.inactive.delete({
        isBibleBatch,
        bibleVersion: selectedBibleVersion,
        bookName: isBibleBatch ? undefined : selectedBook || undefined,
        chapter: isBibleBatch ? "all" : selectedChapter,
      });
      if (response.data) {
        alert(response.data.message);
      }
    } catch (err) {
      setError("Failed to delete inactive explanations.");
      console.error(err);
    } finally {
      setDeleting(false);
      setDeleteModalOpen(false);
    }
  };

  const handleSetDefaultPrompts = async () => {
    setSettingPrompts(true);
    console.log(
      "Setting default prompts to active with the following options:",
    );
    console.log("Whole Bible:", isBibleBatch);
    console.log("Bible Version:", selectedBibleVersion);
    if (!isBibleBatch) {
      console.log("Book:", selectedBook);
      console.log("Chapter:", selectedChapter);
    }
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSettingPrompts(false);
    setPromptsModalOpen(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Explanations</h2>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div
        style={{
          marginBottom: "30px",
          padding: "20px",
          border: "1px solid #ccc",
          borderRadius: "8px",
        }}
      >
        <h3>Actions</h3>
        <div style={{ marginBottom: "20px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontWeight: "bold",
            }}
          >
            <input
              type="checkbox"
              checked={isBibleBatch}
              onChange={(e) => setIsBibleBatch(e.target.checked)}
            />
            Select for whole Bible
          </label>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "20px",
            marginBottom: "20px",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Book:
            </label>
            <SelectDropdown.Root
              open={bookDropdownOpen}
              onOpenChange={setBookDropdownOpen}
              onValueChange={(val) => setSelectedBook(val)}
            >
              <SelectDropdown.Trigger
                disabled={isBibleBatch}
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={selectedBookData?.n || "Select Book"}
                icon={<ChevronDownIcon />}
              />
              <SelectDropdown.Content
                align="start"
                style={{
                  width: "300px",
                  maxHeight: "400px",
                  overflowY: "auto",
                }}
              >
                {testaments.map((book) => (
                  <SelectDropdown.Item
                    key={book.b}
                    value={book.n}
                    icon={<CheckIcon />}
                  >
                    {book.n} ({book.t})
                  </SelectDropdown.Item>
                ))}
              </SelectDropdown.Content>
            </SelectDropdown.Root>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Chapter:
            </label>
            <SelectDropdown.Root
              open={chapterDropdownOpen}
              onOpenChange={setChapterDropdownOpen}
              onValueChange={(val) => setSelectedChapter(Number(val) || "all")}
            >
              <SelectDropdown.Trigger
                disabled={isBibleBatch || !selectedBook}
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={
                  selectedChapter === "all"
                    ? "All Chapters"
                    : `Chapter ${selectedChapter}`
                }
                icon={<ChevronDownIcon />}
              />
              <SelectDropdown.Content
                align="start"
                style={{
                  width: "300px",
                  maxHeight: "400px",
                  overflowY: "auto",
                }}
              >
                <SelectDropdown.Item value="all" icon={<CheckIcon />}>
                  All Chapters
                </SelectDropdown.Item>
                {selectedBookData &&
                  Array.from(
                    { length: selectedBookData.c },
                    (_, i) => i + 1,
                  ).map((chapter) => (
                    <SelectDropdown.Item
                      key={chapter}
                      value={String(chapter)}
                      icon={<CheckIcon />}
                    >
                      Chapter {chapter}
                    </SelectDropdown.Item>
                  ))}
              </SelectDropdown.Content>
            </SelectDropdown.Root>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Bible Version:
            </label>
            <SelectDropdown.Root
              open={versionDropdownOpen}
              onOpenChange={setVersionDropdownOpen}
              onValueChange={(val) => setSelectedBibleVersion(val)}
            >
              <SelectDropdown.Trigger
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={
                  selectedVersionData?.value || "Select Version"
                }
                icon={<ChevronDownIcon />}
              />
              <SelectDropdown.Content
                align="start"
                style={{
                  width: "300px",
                  maxHeight: "400px",
                  overflowY: "auto",
                }}
              >
                {bibleVersions.map((version) => (
                  <SelectDropdown.Item
                    key={version.key}
                    value={version.key}
                    icon={<CheckIcon />}
                  >
                    {version.value}
                  </SelectDropdown.Item>
                ))}
              </SelectDropdown.Content>
            </SelectDropdown.Root>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Button
            variant="outlined"
            style={{ color: "red", borderColor: "red" }}
            onClick={() => setDeleteModalOpen(true)}
            disabled={!isBibleBatch && !selectedBook}
          >
            Delete Inactive Explanations
          </Button>
          <Button
            onClick={() => setPromptsModalOpen(true)}
            disabled={!isBibleBatch && !selectedBook}
          >
            Set Default Prompts to Active
          </Button>
        </div>
      </div>
      <Dialog
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        maxWidth="600px"
      >
        <Dialog.Content>
          <Dialog.Head>Confirm Deletion</Dialog.Head>
          <Dialog.Description>
            Are you sure you want to delete all inactive explanations based on
            the selected criteria? This action cannot be undone.
          </Dialog.Description>
          <Dialog.Footer>
            <Button
              onClick={() => setDeleteModalOpen(false)}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              loading={deleting}
              variant="outlined"
              style={{ color: "red", borderColor: "red" }}
            >
              {deleting ? "Deleting..." : "Confirm"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      <Dialog
        open={promptsModalOpen}
        onOpenChange={setPromptsModalOpen}
        maxWidth="600px"
      >
        <Dialog.Content>
          <Dialog.Head>Confirm Action</Dialog.Head>
          <Dialog.Description>
            Are you sure you want to set the default prompts to active for the
            selected criteria?
          </Dialog.Description>
          <Dialog.Footer>
            <Button
              onClick={() => setPromptsModalOpen(false)}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button onClick={handleSetDefaultPrompts} loading={settingPrompts}>
              {settingPrompts ? "Setting..." : "Confirm"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </div>
  );
};
