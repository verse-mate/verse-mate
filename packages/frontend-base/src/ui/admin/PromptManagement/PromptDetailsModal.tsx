"use client";

import { useEffect, useRef, useState } from "react";
import PromptStatusEnum from "../../../../../database/src/models/public/PromptStatusEnum";
import styles from "./PromptDetailsModal.module.css";

type UserPrompt = {
  id: number;
  template_name: string;
  explanation_type: string;
  prompt_template: string;
  status: string;
};

interface PromptDetailsModalProps {
  mode: "view" | "edit" | "create";
  prompt?: {
    prompt_id?: number;
    id?: number;
    prompt?: string;
    prompt_template?: string;
    template_name?: string;
    explanation_type?: string;
  };
  onClose: () => void;
  onSave: (
    id: number | null,
    newPrompt: string,
    templateName?: string,
    explanationType?: string,
  ) => void;
  explanationTypes?: string[]; // For user prompt creation/editing
  userPrompts?: UserPrompt[]; // Added for pre-filling user prompts
}

const getDefaultTemplateName = (explanationType: string) => {
  switch (explanationType) {
    case "summary":
      return "summary_template";
    case "byline":
      return "byline_template";
    case "detailed":
      return "detailed_template";
    default:
      return "New User Prompt";
  }
};

export const PromptDetailsModal = ({
  mode,
  prompt,
  onClose,
  onSave,
  explanationTypes,
  userPrompts,
}: PromptDetailsModalProps) => {
  const [currentMode, setCurrentMode] = useState(mode);
  const [editedPromptContent, setEditedPromptContent] = useState(() => {
    if (mode === "create") {
      if (prompt && "prompt_id" in prompt) {
        return prompt.prompt || ""; // System prompt
      }
      if (prompt && "id" in prompt) {
        return prompt.prompt_template || ""; // User prompt
      }
    }
    return prompt?.prompt || prompt?.prompt_template || ""; // Existing prompt or fallback
  });
  const [editedTemplateName, setEditedTemplateName] = useState(
    prompt?.template_name || "",
  );
  const [editedExplanationType, setEditedExplanationType] = useState(
    prompt?.explanation_type || explanationTypes?.[0] || "",
  );
  const [
    hasTemplateNameBeenManuallyEdited,
    setHasTemplateNameBeenManuallyEdited,
  ] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    if (currentMode === "create" && !hasTemplateNameBeenManuallyEdited) {
      setEditedTemplateName(getDefaultTemplateName(editedExplanationType));
    }

    if (
      currentMode === "create" &&
      prompt &&
      "id" in prompt &&
      userPrompts &&
      editedExplanationType
    ) {
      const activeUserPrompt = userPrompts.find(
        (p) =>
          p.status === PromptStatusEnum.active &&
          p.explanation_type === editedExplanationType,
      );
      setEditedPromptContent(
        activeUserPrompt ? activeUserPrompt.prompt_template : "",
      );
    }
  }, [
    editedExplanationType,
    currentMode,
    hasTemplateNameBeenManuallyEdited,
    userPrompts,
    prompt,
  ]);

  const handleSave = () => {
    if (currentMode === "create") {
      if (prompt && "prompt_id" in prompt) {
        // Creating system prompt
        onSave(null, editedPromptContent);
      } else {
        // Creating user prompt
        onSave(
          null,
          editedPromptContent,
          editedTemplateName,
          editedExplanationType,
        );
      }
    } else {
      // Editing existing prompt
      const id = prompt?.prompt_id || prompt?.id;
      if (id) {
        onSave(id, editedPromptContent);
      }
    }
    onClose();
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} ref={modalRef}>
        <h2>{currentMode === "create" ? "Create Prompt" : "Prompt Details"}</h2>
        {currentMode === "create" && prompt && !("prompt_id" in prompt) && (
          <div className={styles.inputGroup}>
            <label>Template Name:</label>
            <input
              type="text"
              value={editedTemplateName}
              onChange={(e) => {
                setEditedTemplateName(e.target.value);
                setHasTemplateNameBeenManuallyEdited(true);
              }}
            />
          </div>
        )}
        {currentMode === "create" && prompt && !("prompt_id" in prompt) && (
          <div className={styles.inputGroup}>
            <label>Explanation Type:</label>
            <select
              value={editedExplanationType}
              onChange={(e) => setEditedExplanationType(e.target.value)}
            >
              {explanationTypes?.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        )}
        {currentMode === "create" || currentMode === "edit" ? (
          <textarea
            className={styles.promptText}
            value={editedPromptContent}
            onChange={(e) => setEditedPromptContent(e.target.value)}
            style={{ height: "800px" }}
          />
        ) : (
          <pre className={styles.promptText}>
            {prompt?.prompt || prompt?.prompt_template}
          </pre>
        )}
        <div className={styles.buttonContainer}>
          {currentMode === "create" ? (
            <>
              <button type="button" onClick={handleSave}>
                Create
              </button>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </>
          ) : currentMode === "edit" ? (
            <>
              <button type="button" onClick={handleSave}>
                Save
              </button>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setCurrentMode("edit")}>
                Edit
              </button>
              <button type="button" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
