"use client";

import { api } from "backend-api";
import { useEffect, useState } from "react";

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

export const Playground = () => {
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [userPrompts, setUserPrompts] = useState<UserPrompt[]>([]);
  const [selectedSystemPrompt, setSelectedSystemPrompt] = useState<string>("");
  const [selectedUserPrompt, setSelectedUserPrompt] = useState<string>("");
  const [bookName, setBookName] = useState("Genesis");
  const [chapterNumber, setChapterNumber] = useState(1);
  const [bibleVersion, setBibleVersion] = useState("NIV");
  const [model, setModel] = useState("gpt-4");
  const [effort, setEffort] = useState<"low" | "medium" | "high">("medium");
  const [sendChapterContext, setSendChapterContext] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrompts = async () => {
      try {
        const [systemPromptsResponse, userPromptsResponse] = await Promise.all([
          api.admin.prompts.system.get(),
          api.admin.prompts.user.get(),
        ]);

        if (systemPromptsResponse.data) {
          setSystemPrompts(systemPromptsResponse.data as SystemPrompt[]);
        }

        if (userPromptsResponse.data) {
          setUserPrompts(userPromptsResponse.data as UserPrompt[]);
        }
      } catch (err) {
        setError("Failed to fetch prompts. Please try again.");
        console.error(err);
      }
    };

    fetchPrompts();
  }, []);

  const handleRun = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const response = await api.admin.prompts.playground.post({
        system_prompt: selectedSystemPrompt,
        user_prompt: selectedUserPrompt,
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
    <div>
      <h2>Playground</h2>
      <div>
        <label>System Prompt:</label>
        <select
          value={selectedSystemPrompt}
          onChange={(e) => setSelectedSystemPrompt(e.target.value)}
        >
          <option value="">Select a system prompt</option>
          {systemPrompts.map((prompt) => (
            <option key={prompt.prompt_id} value={prompt.prompt}>
              {prompt.prompt}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>User Prompt:</label>
        <select
          value={selectedUserPrompt}
          onChange={(e) => setSelectedUserPrompt(e.target.value)}
        >
          <option value="">Select a user prompt</option>
          {userPrompts.map((prompt) => (
            <option key={prompt.id} value={prompt.prompt_template}>
              {prompt.template_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>Book Name:</label>
        <input
          type="text"
          value={bookName}
          onChange={(e) => setBookName(e.target.value)}
        />
      </div>
      <div>
        <label>Chapter Number:</label>
        <input
          type="number"
          value={chapterNumber}
          onChange={(e) => setChapterNumber(Number(e.target.value))}
        />
      </div>
      <div>
        <label>Bible Version:</label>
        <input
          type="text"
          value={bibleVersion}
          onChange={(e) => setBibleVersion(e.target.value)}
        />
      </div>
      <div>
        <label>Model:</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </div>
      <div>
        <label>Effort:</label>
        <select
          value={effort}
          onChange={(e) => setEffort(e.target.value as any)}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div>
        <label>Send Chapter Context:</label>
        <input
          type="checkbox"
          checked={sendChapterContext}
          onChange={(e) => setSendChapterContext(e.target.checked)}
        />
      </div>
      <button type="button" onClick={handleRun} disabled={loading}>
        {loading ? "Running..." : "Run"}
      </button>

      {error && <div style={{ color: "red" }}>{error}</div>}

      {result && (
        <div>
          <h3>Result:</h3>
          <pre>{result}</pre>
        </div>
      )}
    </div>
  );
};
