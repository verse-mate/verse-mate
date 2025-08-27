"use client";

import { useState } from "react";

interface CreateSystemPromptModalProps {
  onClose: () => void;
  onSave: (prompt: string) => void;
}

export const CreateSystemPromptModal = ({
  onClose,
  onSave,
}: CreateSystemPromptModalProps) => {
  const [prompt, setPrompt] = useState("");

  const handleSave = () => {
    onSave(prompt);
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>Create System Prompt</h2>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={10}
          style={{ width: "100%" }}
        />
        <button type="button" onClick={handleSave}>
          Save
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
};
