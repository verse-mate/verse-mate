"use client";

import { useState } from "react";

interface EditUserPromptModalProps {
  prompt: {
    id: number;
    prompt_template: string;
  };
  onClose: () => void;
  onSave: (id: number, newPrompt: string) => void;
}

export const EditUserPromptModal = ({
  prompt,
  onClose,
  onSave,
}: EditUserPromptModalProps) => {
  const [newPrompt, setNewPrompt] = useState(prompt.prompt_template);

  const handleSave = () => {
    onSave(prompt.id, newPrompt);
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>Edit User Prompt</h2>
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
