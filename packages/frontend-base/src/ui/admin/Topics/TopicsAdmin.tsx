import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateTopic,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-topics"] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTopic,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-topics"] });
    },
  });

  const sortChronologicallyMutation = useMutation({
    mutationFn: sortTopicsChronologically,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-topics"] });
      alert("Topics sorted chronologically successfully!");
    },
    onError: (error: any) => {
      alert(`Error sorting topics: ${error.message}`);
    },
  });

  useEffect(() => {
    if (currentTopic) {
      setFormData({
        name: currentTopic.name,
        description: currentTopic.description || "",
        category: currentTopic.category,
        sort_order: currentTopic.sort_order,
        is_active: currentTopic.is_active ?? true,
      });
    }
  }, [currentTopic]);

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

  const handleDelete = (topicId: string) => {
    if (window.confirm("Are you sure you want to delete this topic?")) {
      deleteMutation.mutate(topicId);
    }
  };

  const handleSortChronologically = (category: string) => {
    if (
      window.confirm(
        `Sort all ${category.toLowerCase()} topics chronologically?`,
      )
    ) {
      sortChronologicallyMutation.mutate({ category });
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
    <div className="admin-topics">
      <h2>Topics Management</h2>

      <div className="topics-form">
        <h3>{isEditing ? "Edit Topic" : "Create New Topic"}</h3>
        <form onSubmit={handleSubmit}>
          <div>
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

          <div>
            <label htmlFor="description">Description:</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={3}
            />
          </div>

          <div>
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

          <div>
            <label htmlFor="sort_order">Sort Order:</label>
            <input
              type="number"
              id="sort_order"
              name="sort_order"
              value={formData.sort_order || ""}
              onChange={handleInputChange}
            />
          </div>

          <div>
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

          <div className="form-actions">
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {isEditing ? "Update" : "Create"} Topic
            </button>
            {isEditing && (
              <button type="button" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="topics-list">
        <h3>Existing Topics</h3>

        {/* Add sort buttons for each category */}
        <div className="category-sort-actions">
          <h4>Sort by Chronological Order</h4>
          <div>
            <button
              type="button"
              onClick={() => handleSortChronologically("EVENT")}
              disabled={sortChronologicallyMutation.isPending}
            >
              Sort Events Chronologically
            </button>
            <button
              type="button"
              onClick={() => handleSortChronologically("PROPHECY")}
              disabled={sortChronologicallyMutation.isPending}
            >
              Sort Prophecies Chronologically
            </button>
            <button
              type="button"
              onClick={() => handleSortChronologically("PARABLE")}
              disabled={sortChronologicallyMutation.isPending}
            >
              Sort Parables Chronologically
            </button>
          </div>
        </div>

        {/* Display topics grouped by category */}
        {Object.entries(topicsByCategory).map(([category, categoryTopics]) => (
          <div key={category} className="category-section">
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
                      <button type="button" onClick={() => handleEdit(topic)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(topic.topic_id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
};
