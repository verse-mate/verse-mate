"use client";

import { api } from "backend-api";
import { useEffect, useState } from "react";
import styles from "./Playground.module.css";

import ReactMarkdown from "react-markdown";

import { bibleVersions } from "../../../utils/bible-versions";

// Define types for the prompts based on the backend API
type SystemPrompt = {
  prompt_id: number;
  prompt: string;
  status: string;
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

export const Playground = () => {
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [userPrompts, setUserPrompts] = useState<UserPrompt[]>([]);
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBook = books.find((book) => book.name === bookName);
  const selectedUserPromptData = userPrompts.find(
    (p) => p.id === selectedUserPrompt,
  );

  useEffect(() => {
    if (selectedBook) {
      setChapterNumber(1);
    }
  }, [selectedBook]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [prompts, booksResponse] = await Promise.all([
          (async () => {
            const [systemPromptsResponse, userPromptsResponse] =
              await Promise.all([
                api.admin.prompts.system.get(),
                api.admin.prompts.user.get(),
              ]);
            return {
              system: systemPromptsResponse.data,
              user: userPromptsResponse.data,
            };
          })(),
          api.bible.books.get(),
        ]);

        if (prompts.system) {
          const systemPrompts = prompts.system as SystemPrompt[];
          setSystemPrompts(systemPrompts);
          const activeSystemPrompt = systemPrompts.find(
            (p) => p.status === "active",
          );
          if (activeSystemPrompt) {
            setSelectedSystemPrompt(activeSystemPrompt.prompt_id);
          }
        }

        if (prompts.user) {
          const userPrompts = prompts.user as UserPrompt[];
          setUserPrompts(userPrompts);
          const activeSummaryPrompt = userPrompts.find(
            (p) => p.explanation_type === "summary" && p.status === "active",
          );
          if (activeSummaryPrompt) {
            setSelectedUserPrompt(activeSummaryPrompt.id);
          }
        }

        if (booksResponse.data) {
          setBooks((booksResponse.data as any).books as any);
        }
      } catch (err) {
        setError("Failed to fetch initial data. Please try again.");
        console.error(err);
      }
    };

    fetchInitialData();
  }, []);

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
  }, [selectedBook, chapterNumber, bibleVersion, selectedUserPromptData]);

  const handleRun = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const systemPrompt =
        systemPrompts.find((p) => p.prompt_id === selectedSystemPrompt)
          ?.prompt || "";
      const userPrompt =
        userPrompts.find((p) => p.id === selectedUserPrompt)?.prompt_template ||
        "";

      const response = await api.admin.prompts.playground.post({
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        book_name: bookName,
        chapter_number: chapterNumber,
        bible_version: bibleVersion,
        model,
        effort,
        send_chapter_context: sendChapterContext,
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
          <label className={styles.label}>System Prompt:</label>
          <select
            value={selectedSystemPrompt}
            onChange={(e) => setSelectedSystemPrompt(Number(e.target.value))}
            className={styles.select}
          >
            <option value="">Select a system prompt</option>
            {systemPrompts.map((prompt) => (
              <option key={prompt.prompt_id} value={prompt.prompt_id}>
                System prompt {prompt.prompt_id}
              </option>
            ))}
          </select>
        </div>
        <div className={`${styles.formGroup} ${styles.userPromptsContainer}`}>
          <label className={styles.label}>User Prompt:</label>
          <select
            value={selectedUserPrompt}
            onChange={(e) => setSelectedUserPrompt(Number(e.target.value))}
            className={styles.select}
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
        </div>
        <div className={`${styles.formGroup} ${styles.bookName}`}>
          <label className={styles.label}>Book Name:</label>
          <select
            value={bookName}
            onChange={(e) => setBookName(e.target.value)}
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
    </div>
  );
};
