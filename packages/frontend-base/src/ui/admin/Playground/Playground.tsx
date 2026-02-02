"use client";

import { api } from "backend-api";
import { useCallback, useEffect, useState } from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import ReactMarkdown from "react-markdown";
import { bibleVersions } from "../../../utils/bible-versions";
import { Button } from "../../Button/Button";
import { Dialog } from "../../Dialog";
import styles from "./Playground.module.css";

// Define types for the prompts based on the backend API
type SystemPrompt = {
  prompt_id: number;
  prompt: string;
  status: string;
  prompt_type: string;
};

type UserPrompt = {
  id: number;
  template_name: string;
  explanation_type: string;
  prompt_template: string;
  status: string;
};

type BookType = {
  bookId: number;
  name: string;
  testament: string;
  genre: {
    n: string;
  };
  chapters: any[];
};

const EXPLANATION_TYPE_ORDER = ["summary", "byline", "detailed"];
const STORAGE_KEY = "versemate_playground_state";

export const Playground = () => {
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [userPrompts, setUserPrompts] = useState<UserPrompt[]>([]);
  const [selectedPromptType, setSelectedPromptType] =
    useState<string>("system");
  const [selectedSystemPrompt, setSelectedSystemPrompt] = useState<number | "">(
    "",
  );
  const [selectedUserPrompt, setSelectedUserPrompt] = useState<number | "">("");
  const [books, setBooks] = useState<BookType[]>([]);
  const [bookName, setBookName] = useState("Hebrews");
  const [chapterNumber, setChapterNumber] = useState(1);
  const [bibleVersion, setBibleVersion] = useState("NASB1995");
  const [model, setModel] = useState("gpt-5");
  const [effort, setEffort] = useState<"low" | "medium" | "high">("medium");
  const [sendChapterContext, setSendChapterContext] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [activeExplanation, setActiveExplanation] = useState<string | null>(
    null,
  );
  const [editableSystemPrompt, setEditableSystemPrompt] = useState<string>("");
  const [editableUserPrompt, setEditableUserPrompt] = useState<string>("");
  const [maxOutputTokens, setMaxOutputTokens] = useState<number>(50000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal and Save States
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [promptToSave, setPromptToSave] = useState<{
    type: "system" | "user";
    id: number;
    oldValue: string;
    newValue: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        if (state.selectedPromptType)
          setSelectedPromptType(state.selectedPromptType);
        if (state.selectedSystemPrompt)
          setSelectedSystemPrompt(state.selectedSystemPrompt);
        if (state.selectedUserPrompt)
          setSelectedUserPrompt(state.selectedUserPrompt);
        if (state.bookName) setBookName(state.bookName);
        if (state.chapterNumber) setChapterNumber(state.chapterNumber);
        if (state.bibleVersion) setBibleVersion(state.bibleVersion);
        if (state.model) setModel(state.model);
        if (state.effort) setEffort(state.effort);
        if (state.sendChapterContext !== undefined)
          setSendChapterContext(state.sendChapterContext);
        if (state.editableSystemPrompt)
          setEditableSystemPrompt(state.editableSystemPrompt);
        if (state.editableUserPrompt)
          setEditableUserPrompt(state.editableUserPrompt);
        if (state.maxOutputTokens) setMaxOutputTokens(state.maxOutputTokens);
      } catch (e) {
        console.error("Failed to load playground state from localStorage", e);
      }
    }
    setIsInitialized(true);
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (!isInitialized) return; // Prevent overwriting localStorage with defaults during initial render

    const stateToSave = {
      selectedPromptType,
      selectedSystemPrompt,
      selectedUserPrompt,
      bookName,
      chapterNumber,
      bibleVersion,
      model,
      effort,
      sendChapterContext,
      editableSystemPrompt,
      editableUserPrompt,
      maxOutputTokens,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [
    selectedPromptType,
    selectedSystemPrompt,
    selectedUserPrompt,
    bookName,
    chapterNumber,
    bibleVersion,
    model,
    effort,
    sendChapterContext,
    editableSystemPrompt,
    editableUserPrompt,
    maxOutputTokens,
    isInitialized,
  ]);

  const selectedBook = books.find((book) => book.name === bookName);
  const selectedUserPromptData = userPrompts.find(
    (p) => p.id === selectedUserPrompt,
  );

  const currentSystemPromptData = systemPrompts.find(
    (p) => p.prompt_id === selectedSystemPrompt,
  );
  const isSystemPromptModified =
    currentSystemPromptData &&
    editableSystemPrompt.replace(/\r\n/g, "\n").trim() !==
      currentSystemPromptData.prompt.replace(/\r\n/g, "\n").trim();

  const currentUserPromptData = userPrompts.find(
    (p) => p.id === selectedUserPrompt,
  );
  const isUserPromptModified =
    currentUserPromptData &&
    editableUserPrompt.replace(/\r\n/g, "\n").trim() !==
      currentUserPromptData.prompt_template.replace(/\r\n/g, "\n").trim();

  useEffect(() => {
    if (isInitialized && selectedBook) {
      // Only reset if the current chapter is out of bounds for the new book
      if (chapterNumber > selectedBook.chapters.length) {
        setChapterNumber(1);
      }
    }
  }, [selectedBook, isInitialized, chapterNumber]);

  const fetchPrompts = useCallback(async () => {
    try {
      const [systemPromptsResponse, userPromptsResponse] = await Promise.all([
        api.admin.prompts.system.get(),
        api.admin.prompts.user.get(),
      ]);

      if (systemPromptsResponse.data) {
        const systemPrompts = systemPromptsResponse.data as SystemPrompt[];
        setSystemPrompts(systemPrompts);
      }

      if (userPromptsResponse.data) {
        const userPrompts = userPromptsResponse.data as UserPrompt[];
        setUserPrompts(userPrompts);
      }
    } catch (err) {
      console.error("Failed to fetch prompts:", err);
    }
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        await fetchPrompts();
        const booksResponse = await api.bible.books.get();

        if (booksResponse.data) {
          setBooks((booksResponse.data as any).books as any);
        }
      } catch (err) {
        setError("Failed to fetch initial data. Please try again.");
        console.error(err);
      }
    };

    fetchInitialData();
  }, [fetchPrompts]);

  useEffect(() => {
    if (!isInitialized) return; // Wait for localStorage to be checked first

    // Check if we already have data from localStorage
    const savedState = localStorage.getItem(STORAGE_KEY);
    const hasSavedState = !!savedState;

    // Set initial system prompt if not already set by localStorage
    if (
      systemPrompts.length > 0 &&
      selectedSystemPrompt === "" &&
      !hasSavedState
    ) {
      const activeSystemPrompt = systemPrompts.find(
        (p) => p.status === "active" && p.prompt_type === "system",
      );
      if (activeSystemPrompt) {
        setSelectedSystemPrompt(activeSystemPrompt.prompt_id);
        setEditableSystemPrompt(activeSystemPrompt.prompt);
      }
    }

    // Set initial user prompt if not already set by localStorage
    if (userPrompts.length > 0 && selectedUserPrompt === "" && !hasSavedState) {
      const activeSummaryPrompt = userPrompts.find(
        (p) => p.explanation_type === "summary" && p.status === "active",
      );
      if (activeSummaryPrompt) {
        setSelectedUserPrompt(activeSummaryPrompt.id);
        setEditableUserPrompt(activeSummaryPrompt.prompt_template);
      }
    }
  }, [
    systemPrompts,
    userPrompts,
    isInitialized,
    selectedSystemPrompt,
    selectedUserPrompt,
  ]);

  useEffect(() => {
    const fetchActiveExplanation = async () => {
      if (
        selectedBook &&
        chapterNumber &&
        bibleVersion &&
        selectedUserPromptData
      ) {
        try {
          const response = await api.admin.prompts.explanation.existing.get({
            query: {
              book_name: selectedBook.name,
              chapter_number: chapterNumber.toString(),
              bible_version: bibleVersion,
              explanation_type: selectedUserPromptData.explanation_type,
            },
          });
          if (response.data) {
            setActiveExplanation(response.data || null);
            if (
              selectedPromptType === "translate" &&
              response.data &&
              !editableUserPrompt // Only auto-fill if currently empty to avoid overwriting cached work
            ) {
              setEditableUserPrompt(response.data);
            }
          } else {
            setActiveExplanation(null);
          }
        } catch (err) {
          console.error("Failed to fetch active explanation:", err);
          setActiveExplanation(null);
        }
      }
    };
    fetchActiveExplanation();
  }, [
    selectedBook,
    chapterNumber,
    bibleVersion,
    selectedUserPromptData,
    selectedPromptType,
    editableUserPrompt,
  ]);

  const handlePromptTypeChange = (type: string) => {
    setSelectedPromptType(type);
    const activePromptForType = systemPrompts.find(
      (p) => p.status === "active" && p.prompt_type === type,
    );
    if (activePromptForType) {
      setSelectedSystemPrompt(activePromptForType.prompt_id);
      setEditableSystemPrompt(activePromptForType.prompt);
    } else {
      setSelectedSystemPrompt("");
      setEditableSystemPrompt("");
    }

    if (type === "translate" && activeExplanation) {
      setEditableUserPrompt(activeExplanation);
    }
  };

  const handleSystemPromptChange = (id: number) => {
    setSelectedSystemPrompt(id);
    const prompt = systemPrompts.find((p) => p.prompt_id === id);
    if (prompt) {
      setEditableSystemPrompt(prompt.prompt);
      if (prompt.prompt_type !== selectedPromptType) {
        setSelectedPromptType(prompt.prompt_type);
      }
    }
  };

  const handleUserPromptChange = (id: number) => {
    setSelectedUserPrompt(id);
    const prompt = userPrompts.find((p) => p.id === id);
    if (prompt) {
      setEditableUserPrompt(prompt.prompt_template);
    }
  };

  const handleResetSystemPrompt = () => {
    if (currentSystemPromptData) {
      setEditableSystemPrompt(currentSystemPromptData.prompt);
    }
  };

  const handleResetUserPrompt = () => {
    if (currentUserPromptData) {
      setEditableUserPrompt(currentUserPromptData.prompt_template);
    }
  };

  const openSystemPromptDiff = () => {
    if (currentSystemPromptData) {
      setPromptToSave({
        type: "system",
        id: currentSystemPromptData.prompt_id,
        oldValue: currentSystemPromptData.prompt,
        newValue: editableSystemPrompt,
      });
      setDiffModalOpen(true);
    }
  };

  const openUserPromptDiff = () => {
    if (currentUserPromptData) {
      setPromptToSave({
        type: "user",
        id: currentUserPromptData.id,
        oldValue: currentUserPromptData.prompt_template,
        newValue: editableUserPrompt,
      });
      setDiffModalOpen(true);
    }
  };

  const handleConfirmSave = async () => {
    if (!promptToSave) return;

    try {
      setSaving(true);
      if (promptToSave.type === "system") {
        await api.admin.prompts
          .system({ id: promptToSave.id.toString() })
          .put({ prompt: promptToSave.newValue });
      } else {
        await api.admin.prompts
          .user({ id: promptToSave.id.toString() })
          .put({ prompt_template: promptToSave.newValue });
      }

      await fetchPrompts();
      setDiffModalOpen(false);
      setPromptToSave(null);
    } catch (err) {
      console.error("Failed to save prompt:", err);
      setError("Failed to save prompt to database.");
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const response = await api.admin.prompts.playground.post({
        system_prompt: editableSystemPrompt,
        user_prompt: editableUserPrompt,
        prompt_type: selectedPromptType,
        book_name: bookName,
        chapter_number: chapterNumber,
        bible_version: bibleVersion,
        model,
        effort,
        send_chapter_context: sendChapterContext,
        max_output_tokens: maxOutputTokens,
      });

      if (response.data) {
        setResult(response.data.result);
      }
    } catch (err) {
      setError("Failed to run playground. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${styles.container} ${styles.playground}`}>
      <h2 className={styles.title}>Playground</h2>
      <div className={styles.form}>
        <div className={`${styles.formGroup} ${styles.systemPrompt}`}>
          <label className={styles.label}>System Prompt Type:</label>
          <select
            value={selectedPromptType}
            onChange={(e) => handlePromptTypeChange(e.target.value)}
            className={styles.select}
            style={{ marginBottom: "10px" }}
          >
            {Array.from(new Set(systemPrompts.map((p) => p.prompt_type))).map(
              (type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ),
            )}
          </select>

          <label className={styles.label}>System Prompt:</label>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              value={selectedSystemPrompt}
              onChange={(e) => handleSystemPromptChange(Number(e.target.value))}
              className={styles.select}
              style={{ flex: 1 }}
            >
              <option value="">Select a system prompt</option>
              {systemPrompts
                .filter((p) => p.prompt_type === selectedPromptType)
                .map((prompt) => (
                  <option key={prompt.prompt_id} value={prompt.prompt_id}>
                    {prompt.status === "active" ? "★ " : ""}
                    Prompt {prompt.prompt_id} ({prompt.status})
                  </option>
                ))}
            </select>
            <Button
              variant="outlined"
              onClick={handleResetSystemPrompt}
              disabled={!isSystemPromptModified}
            >
              Reset
            </Button>
            <Button
              variant="contained"
              onClick={openSystemPromptDiff}
              disabled={!isSystemPromptModified}
            >
              Save to DB
            </Button>
          </div>
          <textarea
            value={editableSystemPrompt}
            onChange={(e) => setEditableSystemPrompt(e.target.value)}
            className={styles.textarea}
            rows={10}
            style={{ width: "100%", marginTop: "10px" }}
          />
        </div>
        <div className={`${styles.formGroup} ${styles.userPromptsContainer}`}>
          <label className={styles.label}>User Prompt Template:</label>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              value={selectedUserPrompt}
              onChange={(e) => handleUserPromptChange(Number(e.target.value))}
              className={styles.select}
              style={{ flex: 1 }}
            >
              <option value="">Select a user prompt</option>
              {userPrompts
                .sort((a, b) => {
                  const indexA = EXPLANATION_TYPE_ORDER.indexOf(
                    a.explanation_type,
                  );
                  const indexB = EXPLANATION_TYPE_ORDER.indexOf(
                    b.explanation_type,
                  );
                  return indexA - indexB;
                })
                .map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.template_name} ({prompt.explanation_type})
                  </option>
                ))}
            </select>
            <Button
              variant="outlined"
              onClick={handleResetUserPrompt}
              disabled={!isUserPromptModified}
            >
              Reset
            </Button>
            <Button
              variant="contained"
              onClick={openUserPromptDiff}
              disabled={!isUserPromptModified}
            >
              Save to DB
            </Button>
          </div>
          <textarea
            value={editableUserPrompt}
            onChange={(e) => setEditableUserPrompt(e.target.value)}
            className={styles.textarea}
            rows={10}
            style={{ width: "100%", marginTop: "10px" }}
          />
        </div>
        <div className={`${styles.formGroup} ${styles.bookName}`}>
          <label className={styles.label}>Book Name:</label>
          <select
            value={bookName}
            onChange={(e) => {
              setBookName(e.target.value);
              setChapterNumber(1);
            }}
            className={styles.select}
          >
            {books
              .sort((a, b) => a.bookId - b.bookId)
              .map((book) => (
                <option key={book.bookId} value={book.name}>
                  {book.name}
                </option>
              ))}
          </select>
        </div>
        <div className={`${styles.formGroup} ${styles.chapterNumber}`}>
          <label className={styles.label}>Chapter Number:</label>
          <div className={styles.chapterGrid}>
            {selectedBook &&
              Array.from(
                { length: selectedBook.chapters.length },
                (_, i) => i + 1,
              ).map((chapter) => (
                <button
                  key={chapter}
                  type="button"
                  className={`${styles.chapterButton} ${
                    chapterNumber === chapter ? styles.selected : ""
                  }`}
                  onClick={() => setChapterNumber(chapter)}
                >
                  {chapter}
                </button>
              ))}
          </div>
        </div>
        <div className={`${styles.formGroup} ${styles.bibleVersion}`}>
          <label className={styles.label}>Bible Version:</label>
          <select
            value={bibleVersion}
            onChange={(e) => setBibleVersion(e.target.value)}
            className={styles.select}
          >
            {bibleVersions.map((version) => (
              <option key={version.key} value={version.key}>
                {version.value}
              </option>
            ))}
          </select>
        </div>
        <div className={`${styles.formGroup} ${styles.model}`}>
          <label className={styles.label}>Model:</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={styles.select}
          >
            <option value="gpt-5">GPT-5</option>
            <option value="gpt-5-mini">GPT-5 Mini</option>
            <option value="gpt-5-nano">GPT-5 Nano</option>
          </select>
        </div>
        <div className={`${styles.formGroup} ${styles.maxTokens}`}>
          <label className={styles.label}>Max Tokens:</label>
          <input
            type="number"
            value={maxOutputTokens}
            onChange={(e) =>
              setMaxOutputTokens(Number.parseInt(e.target.value))
            }
            className={styles.input}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
            }}
          />
        </div>
        <div className={`${styles.formGroup} ${styles.effort}`}>
          <label className={styles.label}>Effort:</label>
          <select
            value={effort}
            onChange={(e) =>
              setEffort(e.target.value as "low" | "medium" | "high")
            }
            className={styles.select}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className={`${styles.formGroup} ${styles.sendChapterContext}`}>
          <div className={styles.checkboxContainer}>
            <input
              type="checkbox"
              checked={sendChapterContext}
              onChange={(e) => setSendChapterContext(e.target.checked)}
            />
            <label className={styles.label}>Send Chapter Context:</label>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleRun}
        disabled={loading}
        className={styles.button}
      >
        {loading ? "Running..." : "Run"}
      </button>

      {error && <div className={styles.error}>{error}</div>}

      {loading && (
        <div className={styles.resultContainer}>
          <div className={styles.resultBox}>
            <h3 className={styles.resultTitle}>Playground Result:</h3>
            <div>Loading...</div>
          </div>
          <div className={styles.resultBox}>
            <h3 className={styles.resultTitle}>Active Explanation (DB):</h3>
            <div>Loading...</div>
          </div>
        </div>
      )}

      {result && !loading && (
        <div className={styles.resultContainer}>
          <div className={styles.resultBox}>
            <h3 className={styles.resultTitle}>Playground Result:</h3>
            <ReactMarkdown className={styles.resultMarkdown}>
              {result}
            </ReactMarkdown>
          </div>
          <div className={styles.resultBox}>
            <h3 className={styles.resultTitle}>Active Explanation (DB):</h3>
            {activeExplanation ? (
              <ReactMarkdown className={styles.resultMarkdown}>
                {activeExplanation}
              </ReactMarkdown>
            ) : (
              <p>No active explanation found for this selection.</p>
            )}
          </div>
        </div>
      )}

      {/* Prompt Diff Modal */}
      <Dialog
        open={diffModalOpen}
        onOpenChange={setDiffModalOpen}
        maxWidth="1000px"
      >
        <Dialog.Content>
          <Dialog.Head>Confirm Changes</Dialog.Head>
          <Dialog.Description>
            Are you sure you want to save these changes to the database? This
            will affect all future generation batches using this prompt.
          </Dialog.Description>

          <div
            style={{
              margin: "20px 0",
              border: "1px solid #eee",
              borderRadius: "4px",
              overflowY: "auto",
              maxHeight: "60vh",
            }}
          >
            {promptToSave && (
              <ReactDiffViewer
                oldValue={promptToSave.oldValue.replace(/\r\n/g, "\n").trim()}
                newValue={promptToSave.newValue.replace(/\r\n/g, "\n").trim()}
                splitView={true}
                leftTitle="Current (Database)"
                rightTitle="Edited (Playground)"
                compareMethod={DiffMethod.WORDS}
                styles={{
                  variables: {
                    light: {
                      diffViewerBackground: "#fff",
                      addedBackground: "#e6ffed",
                      addedColor: "#24292e",
                      removedBackground: "#ffeef0",
                      removedColor: "#24292e",
                      wordAddedBackground: "#acf2bd",
                      wordRemovedBackground: "#fdb8c0",
                    },
                  },
                  line: {
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                  },
                }}
              />
            )}
          </div>

          <Dialog.Footer>
            <Button variant="outlined" onClick={() => setDiffModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirmSave}
              loading={saving}
            >
              Confirm & Save
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </div>
  );
};
