"use client";

import { useState } from "react";

interface EditSystemPromptModalProps {
  prompt: {
    prompt_id: number;
    prompt: string;
  };
  onClose: () => void;
  onSave: (id: number, newPrompt: string) => void;
}

export const EditSystemPromptModal = ({
  prompt,
  onClose,
  onSave,
}: EditSystemPromptModalProps) => {
  const [newPrompt, setNewPrompt] = useState(prompt.prompt);

  const handleSave = () => {
    onSave(prompt.prompt_id, newPrompt);
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>Edit System Prompt</h2>
        <textarea
          value={newPrompt}
          onChange={(e) => setNewPrompt(e.target.value)}
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
