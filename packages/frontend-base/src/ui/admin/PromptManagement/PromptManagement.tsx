"use client";

import { api } from "backend-api";
import { useCallback, useEffect, useState } from "react";
import PromptStatusEnum from "../../../../../database/src/models/public/PromptStatusEnum";
import { ConfirmationModal } from "./ConfirmationModal";
import { PromptDetailsModal } from "./PromptDetailsModal";
import styles from "./PromptManagement.module.css";

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

const EXPLANATION_TYPE_ORDER = ["summary", "byline", "detailed"];
const TOPIC_PROMPT_TYPES = [
  "topic-discovery",
  "topic-references",
  "topic-explanations",
];

type ModalMode = "closed" | "createSystem" | "createUser" | "edit" | "view";

export const PromptManagement = () => {
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [userPrompts, setUserPrompts] = useState<UserPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<
    SystemPrompt | UserPrompt | null
  >(null);
  const [modalMode, setModalMode] = useState<ModalMode>("closed");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<
    (() => void) | null
  >(null);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [explanationTypes, setExplanationTypes] = useState<string[]>([]);

  const fetchPrompts = useCallback(async () => {
    try {
      setLoading(true);
      const [
        systemPromptsResponse,
        userPromptsResponse,
        explanationTypesResponse,
      ] = await Promise.all([
        api.admin.prompts.system.get(),
        api.admin.prompts.user.get(),
        api.admin.prompts["explanation-types"].get(),
      ]);

      if (systemPromptsResponse.data) {
        const sortedSystemPrompts = (
          systemPromptsResponse.data as SystemPrompt[]
        ).sort((a, b) => a.prompt_id - b.prompt_id);
        setSystemPrompts(sortedSystemPrompts);
      }

      if (userPromptsResponse.data) {
        const sortedUserPrompts = (
          userPromptsResponse.data as UserPrompt[]
        ).sort((a, b) => a.id - b.id);
        setUserPrompts(sortedUserPrompts);
      }

      if (explanationTypesResponse.data) {
        // Custom sort order for explanation types
        const fetchedTypes = explanationTypesResponse.data as string[];
        const sortedAndFilteredTypes = [
          ...EXPLANATION_TYPE_ORDER.filter((type) =>
            fetchedTypes.includes(type),
          ),
          ...TOPIC_PROMPT_TYPES.filter((type) => fetchedTypes.includes(type)),
        ];
        setExplanationTypes(sortedAndFilteredTypes);
      }
    } catch (err) {
      setError("Failed to fetch prompts. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const handleConfirm = async () => {
    try {
      if (confirmationAction) {
        await confirmationAction();
      }
    } finally {
      setShowConfirmation(false);
      setConfirmationAction(null);
      setConfirmationMessage("");
    }
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setConfirmationAction(null);
    setConfirmationMessage("");
  };

  const handleRestoreDefaults = async () => {
    setConfirmationMessage(
      "Are you sure you want to restore all prompts to their default settings? This action cannot be undone.",
    );
    setConfirmationAction(() => async () => {
      try {
        await api.admin.prompts["restore-defaults"].post();
        await fetchPrompts(); // Refetch to update the UI
      } catch (err) {
        setError("Failed to restore default prompts.");
        console.error(err);
      }
    });
    setShowConfirmation(true);
  };

  const handleSetSystemPromptStatus = async (
    id: number,
    status: PromptStatusEnum,
  ) => {
    setConfirmationMessage(
      `Are you sure you want to set prompt ${id} to ${status}?`,
    );
    setConfirmationAction(() => async () => {
      try {
        await api.admin.prompts
          .system({ id: id.toString() })
          .status.put({ status });
        await fetchPrompts(); // Refetch to update the UI
      } catch (err) {
        setError(`Failed to set status for system prompt ${id}.`);
        console.error(err);
      }
    });
    setShowConfirmation(true);
  };

  const handleSetUserPromptStatus = async (
    id: number,
    status: PromptStatusEnum,
  ) => {
    setConfirmationMessage(
      `Are you sure you want to set prompt ${id} to ${status}?`,
    );
    setConfirmationAction(() => async () => {
      try {
        await api.admin.prompts
          .user({ id: id.toString() })
          .status.put({ status });
        await fetchPrompts(); // Refetch to update the UI
      } catch (err) {
        setError(`Failed to set status for user prompt ${id}.`);
        console.error(err);
      }
    });
    setShowConfirmation(true);
  };

  const handleDeleteSystemPrompt = async (id: number) => {
    setConfirmationMessage(
      `Are you sure you want to delete system prompt ${id}?`,
    );
    setConfirmationAction(() => async () => {
      try {
        await api.admin.prompts.system({ id: id.toString() }).delete();
        await fetchPrompts(); // Refetch to update the UI
      } catch (err) {
        setError(`Failed to delete system prompt ${id}.`);
        console.error(err);
      }
    });
    setShowConfirmation(true);
  };

  const handleDeleteUserPrompt = async (id: number) => {
    setConfirmationMessage(
      `Are you sure you want to delete user prompt ${id}?`,
    );
    setConfirmationAction(() => async () => {
      try {
        await api.admin.prompts.user({ id: id.toString() }).delete();
        await fetchPrompts(); // Refetch to update the UI
      } catch (err) {
        setError(`Failed to delete user prompt ${id}.`);
        console.error(err);
      }
    });
    setShowConfirmation(true);
  };

  const handleSavePrompt = async (
    id: number | null,
    newPrompt: string,
    templateName?: string,
    explanationType?: string,
  ) => {
    try {
      if (id === null) {
        // Create new prompt
        if (modalMode === "createSystem") {
          await api.admin.prompts.system.post({ prompt: newPrompt });
        } else if (
          modalMode === "createUser" &&
          templateName &&
          explanationType
        ) {
          await api.admin.prompts.user.post({
            template_name: templateName,
            explanation_type: explanationType as any,
            prompt_template: newPrompt,
          });
        }
      } else {
        // Edit existing prompt
        if (selectedPrompt && "prompt_id" in selectedPrompt) {
          await api.admin.prompts
            .system({ id: id.toString() })
            .put({ prompt: newPrompt });
        } else {
          await api.admin.prompts
            .user({ id: id.toString() })
            .put({ prompt_template: newPrompt });
        }
      }
      await fetchPrompts(); // Refetch to update the UI
      setSelectedPrompt(null);
      setModalMode("closed");
    } catch (err) {
      setError(`Failed to save prompt ${id}.`);
      console.error(err);
    }
  };

  const handleCreateSystemPromptClick = () => {
    setModalMode("createSystem");
    const activeSystemPrompt = systemPrompts.find(
      (p) => p.status === PromptStatusEnum.active,
    );
    setSelectedPrompt({
      prompt_id: 0,
      prompt: activeSystemPrompt ? activeSystemPrompt.prompt : "",
      status: "inactive",
      prompt_type: "explanation",
    }); // Dummy prompt for modal
  };

  const handleCreateUserPromptClick = () => {
    setModalMode("createUser");
    const initialExplanationType =
      explanationTypes && explanationTypes.length > 0
        ? explanationTypes[0]
        : "";
    const activeUserPrompt = userPrompts.find(
      (p) =>
        p.status === PromptStatusEnum.active &&
        p.explanation_type === initialExplanationType,
    );
    setSelectedPrompt({
      id: 0,
      template_name: "",
      explanation_type: initialExplanationType,
      prompt_template: activeUserPrompt ? activeUserPrompt.prompt_template : "",
      status: "inactive",
    }); // Dummy prompt for modal
  };

  const handleEditPromptClick = (prompt: SystemPrompt | UserPrompt) => {
    setSelectedPrompt(prompt);
    setModalMode("edit");
  };

  // Filter user prompts by type for better organization
  const explanationPrompts = userPrompts.filter((prompt) =>
    EXPLANATION_TYPE_ORDER.includes(prompt.explanation_type),
  );

  const topicPrompts = userPrompts.filter((prompt) =>
    TOPIC_PROMPT_TYPES.includes(prompt.explanation_type),
  );

  if (loading) {
    return <div>Loading prompts...</div>;
  }

  if (error) {
    return <div style={{ color: "red" }}>{error}</div>;
  }

  return (
    <div className={styles.container}>
      {modalMode !== "closed" && (
        <PromptDetailsModal
          mode={
            modalMode === "createSystem" || modalMode === "createUser"
              ? "create"
              : modalMode === "edit"
                ? "edit"
                : modalMode === "view"
                  ? "view"
                  : "edit"
          }
          prompt={selectedPrompt || undefined}
          onClose={() => {
            setSelectedPrompt(null);
            setModalMode("closed");
          }}
          onSave={handleSavePrompt}
          explanationTypes={explanationTypes}
          userPrompts={userPrompts}
        />
      )}

      {showConfirmation && (
        <ConfirmationModal
          message={confirmationMessage}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirmation}
        />
      )}

      <div className={styles.listsContainer}>
        <div className={styles.restoreDefaultsContainer}>
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className={styles.primaryButton}
          >
            Restore Default Prompts
          </button>
        </div>
        <div className={styles.listWrapper}>
          <div className={styles.headerWithButton}>
            <h2>System Prompts</h2>
            <span> &mdash; </span>
            <button
              type="button"
              onClick={handleCreateSystemPromptClick}
              className={styles.primaryButton}
            >
              Create System Prompt
            </button>
          </div>
          <ul className={styles.list}>
            {systemPrompts.map((prompt) => (
              <li key={prompt.prompt_id} className={styles.listItem}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPrompt(prompt);
                    setModalMode("view");
                  }}
                  className={`${styles.listItemButton} ${prompt.status === PromptStatusEnum.active ? styles.active : ""}`}
                >
                  {prompt.prompt_id} - {prompt.prompt_type} - {prompt.status}
                </button>
                <button
                  type="button"
                  onClick={() => handleEditPromptClick(prompt)}
                  className={styles.listItemButton}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSystemPrompt(prompt.prompt_id)}
                  className={styles.listItemButton}
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSetSystemPromptStatus(
                      prompt.prompt_id,
                      PromptStatusEnum.active,
                    )
                  }
                  disabled={prompt.status === PromptStatusEnum.active}
                  className={styles.listItemButton}
                >
                  Set Active
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.listWrapper}>
          <div className={styles.headerWithButton}>
            <h2>User Prompts - Explanations</h2>
            <span> &mdash; </span>
            <button
              type="button"
              onClick={handleCreateUserPromptClick}
              className={styles.primaryButton}
            >
              Create User Prompt
            </button>
          </div>
          <ul className={styles.list}>
            {explanationPrompts.map((prompt) => (
              <li key={prompt.id} className={styles.listItem}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPrompt(prompt);
                    setModalMode("view");
                  }}
                  className={`${styles.listItemButton} ${prompt.status === PromptStatusEnum.active ? styles.active : ""}`}
                >
                  {prompt.id} - {prompt.template_name} - {prompt.status}
                </button>
                <button
                  type="button"
                  onClick={() => handleEditPromptClick(prompt)}
                  className={styles.listItemButton}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteUserPrompt(prompt.id)}
                  className={styles.listItemButton}
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSetUserPromptStatus(
                      prompt.id,
                      PromptStatusEnum.active,
                    )
                  }
                  disabled={prompt.status === PromptStatusEnum.active}
                  className={styles.listItemButton}
                >
                  Set Active
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.listWrapper}>
          <div className={styles.headerWithButton}>
            <h2>User Prompts - Topics</h2>
            <span> &mdash; </span>
            <button
              type="button"
              onClick={handleCreateUserPromptClick}
              className={styles.primaryButton}
            >
              Create Topic Prompt
            </button>
          </div>
          <ul className={styles.list}>
            {topicPrompts.map((prompt) => (
              <li key={prompt.id} className={styles.listItem}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPrompt(prompt);
                    setModalMode("view");
                  }}
                  className={`${styles.listItemButton} ${prompt.status === PromptStatusEnum.active ? styles.active : ""}`}
                >
                  {prompt.id} - {prompt.template_name} - {prompt.status}
                </button>
                <button
                  type="button"
                  onClick={() => handleEditPromptClick(prompt)}
                  className={styles.listItemButton}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteUserPrompt(prompt.id)}
                  className={styles.listItemButton}
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSetUserPromptStatus(
                      prompt.id,
                      PromptStatusEnum.active,
                    )
                  }
                  disabled={prompt.status === PromptStatusEnum.active}
                  className={styles.listItemButton}
                >
                  Set Active
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.restoreDefaultsContainer}>
        <button
          type="button"
          onClick={handleRestoreDefaults}
          className={styles.primaryButton}
        >
          Restore Default Prompts
        </button>
      </div>
    </div>
  );
};
