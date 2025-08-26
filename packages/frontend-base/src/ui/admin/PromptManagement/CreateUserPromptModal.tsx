"use client";

import { useState } from "react";

interface CreateUserPromptModalProps {
  onClose: () => void;
  onSave: (
    templateName: string,
    explanationType: string,
    promptTemplate: string,
  ) => void;
}

export const CreateUserPromptModal = ({
  onClose,
  onSave,
}: CreateUserPromptModalProps) => {
  const [templateName, setTemplateName] = useState("");
  const [explanationType, setExplanationType] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");

  const handleSave = () => {
    onSave(templateName, explanationType, promptTemplate);
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>Create User Prompt</h2>
        <input
          type="text"
          placeholder="Template Name"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Explanation Type"
          value={explanationType}
          onChange={(e) => setExplanationType(e.target.value)}
        />
        <textarea
          value={promptTemplate}
          onChange={(e) => setPromptTemplate(e.target.value)}
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
