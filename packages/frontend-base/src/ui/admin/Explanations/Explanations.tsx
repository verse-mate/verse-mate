"use client";
import { api } from "backend-api";
import { useCallback, useEffect, useState } from "react";
import { addNotification } from "../../../notification/store";
import { bibleVersions } from "../../../utils/bible-versions";
import { testaments } from "../../../utils/testaments";
import { Button } from "../../Button/Button";
import { Dialog } from "../../Dialog";
import { CheckIcon, ChevronDownIcon } from "../../Icons";
import { Input } from "../../Input/Input";
import { SelectDropdown } from "../../SelectDropdown";
import { Table, type TableColumn } from "../../Table/Table";
import { ExplanationDetailModal } from "./ExplanationDetailModal";
import styles from "./Explanations.module.css";

const bookOptions = testaments;

interface Explanation {
  id: string;
  explanation_id: number;
  type: string;
  explanation: string;
  is_active: boolean;
  created_by_admin: boolean;
  version: number;
  created_at: Date;
  language_code: string;
}

export const Explanations = () => {
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | "all">("all");
  const [selectedBibleVersion, setSelectedBibleVersion] =
    useState<string>("NASB1995");
  const [versionToSetActive, setVersionToSetActive] = useState("");
  const [availableLanguages, setAvailableLanguages] = useState<
    { code: string; name: string; nativeName: string }[]
  >([]);
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");

  // Modal state
  const [selectedExplanation, setSelectedExplanation] =
    useState<Explanation | null>(null);

  // Dropdown states
  const [bookDropdownOpen, setBookDropdownOpen] = useState(false);
  const [chapterDropdownOpen, setChapterDropdownOpen] = useState(false);
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);

  const [isBibleBatch, setIsBibleBatch] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [promptsModalOpen, setPromptsModalOpen] = useState(false);
  const [settingPrompts, setSettingPrompts] = useState(false);
  const [activeModalOpen, setActiveModalOpen] = useState(false);
  const [settingActive, setSettingActive] = useState(false);
  const [settingVersionActive, setSettingVersionActive] = useState(false);
  const [refreshingLanguages, setRefreshingLanguages] = useState(false);

  // Table state
  const [explanations, setExplanations] = useState<Explanation[]>([]);
  const [loadingExplanations, setLoadingExplanations] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, _setItemsPerPage] = useState(50);
  const [totalItems, setTotalItems] = useState(0);

  const selectedBookData = bookOptions.find((book) => book.n === selectedBook);
  const selectedVersionData = bibleVersions.find(
    (version) => version.key === selectedBibleVersion,
  );

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const response = await api.admin.explanations.languages.get();
        if (response.data) {
          const mappedLanguages = (response.data as any[]).map((lang) => ({
            code: lang.language_code,
            name: lang.name,
            nativeName: lang.native_name,
          }));
          setAvailableLanguages(mappedLanguages);
        }
      } catch (error) {
        console.error("Failed to fetch available languages:", error);
      }
    };

    fetchLanguages();
  }, []);

  const fetchExplanations = useCallback(async () => {
    if (!isBibleBatch && !selectedBook) {
      setExplanations([]);
      return;
    }

    setLoadingExplanations(true);
    setError(null);
    try {
      const response = await api.admin.explanations.get({
        query: {
          isBibleBatch: String(isBibleBatch),
          languageCode: selectedLanguage,
          bookName: isBibleBatch ? undefined : selectedBook || undefined,
          chapter: String(isBibleBatch ? "all" : selectedChapter),
          limit: String(itemsPerPage),
          offset: String((currentPage - 1) * itemsPerPage),
        },
      });
      if (response.data) {
        const formattedData = response.data.explanations.map((exp: any) => ({
          ...exp,
          id: String(exp.explanation_id),
        }));
        setExplanations(formattedData);
        setTotalItems(response.data.total);
      }
    } catch (err) {
      setError("Failed to fetch explanations.");
      console.error(err);
    } finally {
      setLoadingExplanations(false);
    }
  }, [
    isBibleBatch,
    selectedBook,
    selectedChapter,
    selectedLanguage,
    currentPage,
    itemsPerPage,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset chapter when book changes
  useEffect(() => {
    setSelectedChapter("all");
    setCurrentPage(1);
  }, [selectedBook]);

  useEffect(() => {
    fetchExplanations();
  }, [fetchExplanations]);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const response = await api.admin.explanations.inactive.delete({
        isBibleBatch,
        languageCode: selectedLanguage,
        bookName: isBibleBatch ? undefined : selectedBook || undefined,
        chapter: isBibleBatch ? "all" : selectedChapter,
      });
      if (response.data) {
        addNotification({ content: response.data.message });
        fetchExplanations();
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
    setError(null);
    try {
      const response = await api.admin.explanations["set-defaults-active"].post(
        {
          isBibleBatch,
          languageCode: selectedLanguage,
          bookName: isBibleBatch ? undefined : selectedBook || undefined,
          chapter: isBibleBatch ? "all" : selectedChapter,
        },
      );
      if (response.data) {
        addNotification({ content: response.data.message });
        fetchExplanations();
      }
    } catch (err) {
      setError("Failed to set default prompts.");
      console.error(err);
    } finally {
      setSettingPrompts(false);
      setPromptsModalOpen(false);
    }
  };

  const handleSetActiveAsDefault = async () => {
    setSettingActive(true);
    setError(null);
    try {
      const response = await api.admin.explanations[
        "set-active-as-default"
      ].post({
        isBibleBatch,
        languageCode: selectedLanguage,
        bookName: isBibleBatch ? undefined : selectedBook || undefined,
        chapter: isBibleBatch ? "all" : selectedChapter,
      });
      if (response.data) {
        addNotification({ content: response.data.message });
        fetchExplanations();
      }
    } catch (err) {
      setError("Failed to set active explanations as default.");
      console.error(err);
    } finally {
      setSettingActive(false);
      setActiveModalOpen(false);
    }
  };

  const handleSetActiveVersion = async () => {
    if (!versionToSetActive) {
      setError("Please enter a version number.");
      return;
    }
    setSettingVersionActive(true);
    setError(null);
    try {
      const response = await api.admin.explanations[
        "set-specific-version-active"
      ].post({
        isBibleBatch,
        languageCode: selectedLanguage,
        bookName: isBibleBatch ? undefined : selectedBook || undefined,
        chapter: isBibleBatch ? "all" : selectedChapter,
        version: Number(versionToSetActive),
      });
      if (response.data) {
        addNotification({ content: response.data.message });
        fetchExplanations();
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("VERSION_MISMATCH")) {
        setError(
          "Error: Not all chapters in the selected scope have this version. No changes were made.",
        );
      } else {
        setError("Failed to set active version.");
      }
      console.error(err);
    } finally {
      setSettingVersionActive(false);
    }
  };

  const handleRefreshLanguages = async () => {
    setRefreshingLanguages(true);
    setError(null);
    try {
      const response = await api.admin.explanations[
        "refresh-language-stats"
      ].post({});
      if (response.data?.success) {
        addNotification({ content: "Language stats refreshed successfully." });
      }
    } catch (err) {
      setError("Failed to refresh language stats.");
      console.error(err);
    } finally {
      setRefreshingLanguages(false);
    }
  };

  const columns: TableColumn<Explanation>[] = [
    {
      title: "ID",
      property: "explanation_id",
      className: styles.idColumn,
      render: (exp) => (
        <button
          type="button"
          onClick={() => setSelectedExplanation(exp)}
          className={styles.clickableId}
        >
          {exp.explanation_id}
        </button>
      ),
    },
    {
      title: "Type",
      property: "type",
      className: styles.typeColumn,
      render: (exp) => <span className={styles.nowrapColumn}>{exp.type}</span>,
    },
    {
      title: "Language",
      property: "language_code",
      className: styles.languageColumn,
      render: (exp) => (
        <span className={styles.nowrapColumn}>{exp.language_code}</span>
      ),
    },
    {
      title: "Explanation",
      property: "explanation",
      className: styles.explanationColumn,
      render: (exp) => (
        <span className={styles.nowrapColumn} title={exp.explanation}>
          {exp.explanation}
        </span>
      ),
    },
    {
      title: "Status",
      property: "is_active",
      className: styles.statusColumn,
      render: (exp) => (
        <div className={styles.statusContainer}>
          {exp.is_active && <span className={styles.badgeActive}>Active</span>}
          {exp.created_by_admin && (
            <span className={styles.badgeDefault}>Default</span>
          )}
        </div>
      ),
    },
    {
      title: "Version",
      property: "version",
      className: styles.versionColumn,
      render: (exp) => (
        <span className={styles.nowrapColumn}>{exp.version}</span>
      ),
    },
    {
      title: "Created",
      property: "created_at",
      className: styles.createdColumn,
      render: (exp) => (
        <span className={styles.nowrapColumn}>
          {new Date(exp.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

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
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
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
              Language:
            </label>
            <SelectDropdown.Root
              open={languageDropdownOpen}
              onOpenChange={setLanguageDropdownOpen}
              onValueChange={(val) => setSelectedLanguage(val)}
            >
              <SelectDropdown.Trigger
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={
                  availableLanguages.find(
                    (lang) => lang.code === selectedLanguage,
                  )?.name || "Select Language"
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
                {availableLanguages.map((language) => (
                  <SelectDropdown.Item
                    key={language.code}
                    value={language.code}
                    icon={<CheckIcon />}
                  >
                    {language.name} ({language.nativeName})
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
              Bible Version (for Actions):
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
          <Button
            onClick={() => setActiveModalOpen(true)}
            disabled={!isBibleBatch && !selectedBook}
          >
            Set Active as Default
          </Button>
          <Button
            onClick={handleRefreshLanguages}
            loading={refreshingLanguages}
          >
            {refreshingLanguages ? "Refreshing..." : "Refresh Language Stats"}
          </Button>
        </div>
        <div
          style={{
            marginTop: "20px",
            display: "flex",
            gap: "10px",
            alignItems: "flex-end",
          }}
        >
          <div style={{ width: "238px" }}>
            <Input
              placeholder="Enter version to set active"
              value={versionToSetActive}
              onChange={(e) => setVersionToSetActive(e.target.value)}
            />
          </div>
          <Button
            onClick={handleSetActiveVersion}
            disabled={!versionToSetActive || settingVersionActive}
            loading={settingVersionActive}
          >
            {settingVersionActive ? "Setting..." : "Set Active Version"}
          </Button>
        </div>
      </div>

      <div className={styles.container}>
        <Table
          columns={columns}
          data={explanations}
          isLoading={loadingExplanations}
          zebra
        />
        <div className={styles.paginationControls}>
          <Button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span>
            Page {currentPage} of {Math.ceil(totalItems / itemsPerPage)}
          </span>
          <Button
            onClick={() =>
              setCurrentPage((prev) =>
                Math.min(prev + 1, Math.ceil(totalItems / itemsPerPage)),
              )
            }
            disabled={currentPage === Math.ceil(totalItems / itemsPerPage)}
          >
            Next
          </Button>
        </div>
      </div>

      <ExplanationDetailModal
        explanation={selectedExplanation}
        onClose={() => setSelectedExplanation(null)}
      />

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

      <Dialog
        open={activeModalOpen}
        onOpenChange={setActiveModalOpen}
        maxWidth="600px"
      >
        <Dialog.Content>
          <Dialog.Head>Confirm Action</Dialog.Head>
          <Dialog.Description>
            Are you sure you want to set the currently active explanations as
            the new default for the selected criteria? This will replace the old
            default.
          </Dialog.Description>
          <Dialog.Footer>
            <Button
              onClick={() => setActiveModalOpen(false)}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button onClick={handleSetActiveAsDefault} loading={settingActive}>
              {settingActive ? "Setting..." : "Confirm"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </div>
  );
};
