import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../Button/Button";
import { Dialog } from "../../Dialog";
import styles from "./TopicsAdmin.module.css";
import {
  createTopic,
  deleteTopic,
  getTopics,
  sortTopicsChronologically,
  updateTopic,
} from "./topicsAdminApi";

interface Topic {
  topic_id: string;
  name: string;
  description: string;
  category: string;
  sort_order: number | undefined;
  is_active: boolean;
}

export const TopicsAdmin = () => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [currentTopic, setCurrentTopic] = useState<Topic | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "EVENT",
    sort_order: undefined as number | undefined,
    is_active: true,
  });

  // State for confirmation dialogs
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTopicId, setDeleteTopicId] = useState<string | null>(null);
  const [sortConfirmOpen, setSortConfirmOpen] = useState(false);
  const [sortCategory, setSortCategory] = useState<string | null>(null);

  // State for success/error messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    data: topics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-topics"],
    queryFn: getTopics,
  });

  const createMutation = useMutation({
    mutationFn: createTopic,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-topics"] });
      resetForm();
      setSuccessMessage("Topic created successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (error: any) => {
      setErrorMessage(`Error creating topic: ${error.message}`);
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateTopic,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-topics"] });
      resetForm();
      setSuccessMessage("Topic updated successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (error: any) => {
      setErrorMessage(`Error updating topic: ${error.message}`);
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTopic,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-topics"] });
      setDeleteConfirmOpen(false);
      setDeleteTopicId(null);
      setSuccessMessage("Topic deleted successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (error: any) => {
      setDeleteConfirmOpen(false);
      setDeleteTopicId(null);
      setErrorMessage(`Error deleting topic: ${error.message}`);
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  const sortChronologicallyMutation = useMutation({
    mutationFn: sortTopicsChronologically,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-topics"] });
      setSortConfirmOpen(false);
      setSortCategory(null);
      setSuccessMessage(
        `Topics sorted chronologically successfully! ${data.sortedCount} topics reordered.`,
      );
      setTimeout(() => setSuccessMessage(null), 5000);
    },
    onError: (error: any) => {
      setSortConfirmOpen(false);
      setSortCategory(null);
      setErrorMessage(`Error sorting topics: ${error.message}`);
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  const resetForm = () => {
    setIsEditing(false);
    setCurrentTopic(null);
    setFormData({
      name: "",
      description: "",
      category: "EVENT",
      sort_order: undefined,
      is_active: true,
    });
  };

  const handleCreate = () => {
    const newTopic = {
      name: formData.name,
      description: formData.description,
      category: formData.category,
      sort_order: formData.sort_order,
      is_active: formData.is_active,
    };
    createMutation.mutate(newTopic);
  };

  const handleUpdate = () => {
    if (!currentTopic) return;

    const updatedTopic = {
      topic_id: currentTopic.topic_id,
      name: formData.name,
      description: formData.description,
      category: formData.category,
      sort_order: formData.sort_order,
      is_active: formData.is_active,
    };
    updateMutation.mutate(updatedTopic);
  };

  const handleDeleteClick = (topicId: string) => {
    setDeleteTopicId(topicId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (deleteTopicId) {
      deleteMutation.mutate(deleteTopicId);
    }
  };

  const handleSortClick = (category: string) => {
    setSortCategory(category);
    setSortConfirmOpen(true);
  };

  const handleSortConfirm = () => {
    if (sortCategory) {
      sortChronologicallyMutation.mutate({ category: sortCategory });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing) {
      handleUpdate();
    } else {
      handleCreate();
    }
  };

  const handleEdit = (topic: Topic) => {
    setCurrentTopic(topic);
    setIsEditing(true);
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    const checked =
      type === "checkbox" ? (e.target as HTMLInputElement).checked : undefined;

    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? checked
          : name === "sort_order" && value === ""
            ? undefined
            : name === "sort_order"
              ? Number(value)
              : value,
    }));
  };

  if (isLoading) return <div>Loading topics...</div>;
  if (error) return <div>Error loading topics: {(error as Error).message}</div>;

  // Group topics by category for easier management
  const topicsByCategory =
    topics?.reduce(
      (acc: Record<string, Topic[]>, topic) => {
        if (!acc[topic.category]) {
          acc[topic.category] = [];
        }
        acc[topic.category].push(topic);
        return acc;
      },
      {} as Record<string, Topic[]>,
    ) || {};

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Topics Management</h2>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className={styles.successMessage}>{successMessage}</div>
      )}
      {errorMessage && (
        <div className={styles.errorMessage}>{errorMessage}</div>
      )}

      <div className={styles.topicsForm}>
        <h3>{isEditing ? "Edit Topic" : "Create New Topic"}</h3>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="name">Name:</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="description">Description:</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={3}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="category">Category:</label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleInputChange}
            >
              <option value="EVENT">Event</option>
              <option value="PROPHECY">Prophecy</option>
              <option value="PARABLE">Parable</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="sort_order">Sort Order:</label>
            <input
              type="number"
              id="sort_order"
              name="sort_order"
              value={formData.sort_order || ""}
              onChange={handleInputChange}
            />
          </div>

          <div className={styles.formGroup}>
            <label>
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleInputChange}
              />
              Active
            </label>
          </div>

          <div className={styles.formActions}>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {isEditing ? "Update" : "Create"} Topic
            </Button>
            {isEditing && (
              <Button type="button" onClick={resetForm} variant="outlined">
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className={styles.topicsList}>
        <h3>Existing Topics</h3>

        {/* Add sort buttons for each category */}
        <div className={styles.categorySortActions}>
          <h4>Sort by Chronological Order</h4>
          <div>
            <Button
              type="button"
              onClick={() => handleSortClick("EVENT")}
              disabled={sortChronologicallyMutation.isPending}
              variant="outlined"
              className={styles.actionButton}
            >
              Sort Events Chronologically
            </Button>
            <Button
              type="button"
              onClick={() => handleSortClick("PROPHECY")}
              disabled={sortChronologicallyMutation.isPending}
              variant="outlined"
              className={styles.actionButton}
            >
              Sort Prophecies Chronologically
            </Button>
            <Button
              type="button"
              onClick={() => handleSortClick("PARABLE")}
              disabled={sortChronologicallyMutation.isPending}
              variant="outlined"
              className={styles.actionButton}
            >
              Sort Parables Chronologically
            </Button>
            <Button
              type="button"
              onClick={() => handleSortClick("THEME")}
              disabled={sortChronologicallyMutation.isPending}
              variant="outlined"
              className={styles.actionButton}
            >
              Sort Themes Alphabetically
            </Button>
          </div>
        </div>

        {/* Display topics grouped by category */}
        {Object.entries(topicsByCategory).map(([category, categoryTopics]) => (
          <div key={category} className={styles.categorySection}>
            <h4>{category} Topics</h4>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Sort Order</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categoryTopics.map((topic) => (
                  <tr key={topic.topic_id}>
                    <td>{topic.name}</td>
                    <td>{topic.description}</td>
                    <td>{topic.sort_order}</td>
                    <td>{topic.is_active ? "Yes" : "No"}</td>
                    <td>
                      <Button
                        type="button"
                        onClick={() => handleEdit(topic)}
                        variant="outlined"
                        className={styles.smallButton}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleDeleteClick(topic.topic_id)}
                        variant="outlined"
                        className={styles.smallButton}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) setDeleteTopicId(null);
        }}
      >
        <Dialog.Content>
          <Dialog.Head>Confirm Delete</Dialog.Head>
          <Dialog.Description>
            Are you sure you want to delete this topic? This action cannot be
            undone.
          </Dialog.Description>
          <Dialog.Footer>
            <Button
              onClick={() => {
                setDeleteConfirmOpen(false);
                setDeleteTopicId(null);
              }}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      {/* Sort Confirmation Dialog */}
      <Dialog
        open={sortConfirmOpen}
        onOpenChange={(open) => {
          setSortConfirmOpen(open);
          if (!open) setSortCategory(null);
        }}
      >
        <Dialog.Content>
          <Dialog.Head>Confirm Sort</Dialog.Head>
          <Dialog.Description>
            {sortCategory
              ? `Sort all ${sortCategory.toLowerCase()} topics chronologically?`
              : "Sort topics chronologically?"}
          </Dialog.Description>
          <Dialog.Footer>
            <Button
              onClick={() => {
                setSortConfirmOpen(false);
                setSortCategory(null);
              }}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSortConfirm}
              disabled={sortChronologicallyMutation.isPending}
            >
              {sortChronologicallyMutation.isPending ? "Sorting..." : "Sort"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </div>
  );
};
