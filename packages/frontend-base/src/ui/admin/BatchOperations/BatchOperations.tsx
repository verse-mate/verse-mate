"use client";
import { api } from "backend-api";
import { useCallback, useEffect, useState } from "react";
import { bibleVersions } from "../../../utils/bible-versions";
import { testaments } from "../../../utils/testaments";
import { Button } from "../../Button/Button";
import { CheckIcon, ChevronDownIcon } from "../../Icons";
import { SelectDropdown } from "../../SelectDropdown";
import { Table, type TableColumn } from "../../Table/Table";
import styles from "./BatchOperations.module.css";

interface BatchJob {
  id: string;
  batch_type: string;
  openai_batch_id: string | null;
  status: string;
  created_at: Date;
  actual_cost?: number | null;
  created_by: string;
  book_id?: number | null;
  bible_version?: string;
  model?: string;
  explanation_types?: string[];
  total_requests?: number;
  completed_requests?: number;
  failed_requests?: number;
}

interface ModelOption {
  value: string;
  label: string;
  inputCost: number;
  outputCost: number;
}

const modelOptions: ModelOption[] = [
  {
    value: "gpt-5",
    label: "GPT-5 ($1.25/$10.00 per 1M tokens)",
    inputCost: 1.25,
    outputCost: 10,
  },
  {
    value: "gpt-5-mini",
    label: "GPT-5 Mini ($0.25/$2.00 per 1M tokens)",
    inputCost: 0.25,
    outputCost: 2,
  },
  {
    value: "gpt-5-nano",
    label: "GPT-5 Nano ($0.05/$0.40 per 1M tokens)",
    inputCost: 0.05,
    outputCost: 0.4,
  },
  {
    value: "gpt-5-chat-latest",
    label: "GPT-5 Chat Latest ($1.25/$10.00 per 1M tokens)",
    inputCost: 1.25,
    outputCost: 10,
  },
];

export const BatchOperations = () => {
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedModel, setSelectedModel] = useState<string>("gpt-5-mini");
  const [selectedBook, setSelectedBook] = useState<number | null>(null);
  const [selectedBibleVersion, setSelectedBibleVersion] =
    useState<string>("NASB1995");
  const [selectedExplanationTypes, setSelectedExplanationTypes] = useState<
    string[]
  >(["summary"]);

  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [bookDropdownOpen, setBookDropdownOpen] = useState(false);
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);

  const fetchBatchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.admin["batch-history"].get({ query: {} });
      if (response.data) {
        setBatchJobs(
          Array.isArray(response.data)
            ? response.data.map((job) => ({
                ...job,
                id: String(job.id),
              }))
            : [],
        );
      }
    } catch (err) {
      setError("Failed to fetch batch jobs");
      console.error("Error fetching batch jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateBatch = async () => {
    if (!selectedBook) {
      setError("Please select a book");
      return;
    }

    if (selectedExplanationTypes.length === 0) {
      setError("Please select at least one explanation type");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await api.admin["batch-explanations"].post({
        type: "book",
        bookId: selectedBook,
        bibleVersion: selectedBibleVersion,
        model: selectedModel,
        explanationTypes: selectedExplanationTypes,
      });
      await fetchBatchJobs();
    } catch (err) {
      setError("Failed to create batch job");
      console.error("Error creating batch job:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleMonitorBatch = async (batchId: string) => {
    try {
      setLoading(true);
      setError(null);
      await (api.admin.batch as any)[batchId].get();
      await fetchBatchJobs();
    } catch (err) {
      setError("Failed to monitor batch job");
      console.error("Error monitoring batch job:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatchJobs();
  }, [fetchBatchJobs]);

  const columns: TableColumn<BatchJob>[] = [
    {
      title: "ID",
      property: "id",
    },
    {
      title: "Type",
      property: "batch_type",
    },
    {
      title: "OpenAI Batch ID",
      property: "openai_batch_id",
    },
    {
      title: "Status",
      property: "status",
      render: (job) => (
        <span
          className={`${styles.status} ${styles[job.status === "in_progress" ? "inProgress" : job.status]}`}
        >
          {job.status}
        </span>
      ),
    },
    {
      title: "Cost",
      property: "actual_cost",
      render: (job) =>
        job.actual_cost ? `$${job.actual_cost.toFixed(4)}` : "N/A",
    },
    {
      title: "Created",
      property: "created_at",
      render: (job) => new Date(job.created_at).toLocaleDateString(),
    },
    {
      title: "Actions",
      property: "id",
      render: (job) => (
        <Button
          variant="outlined"
          onClick={() => handleMonitorBatch(job.openai_batch_id || "")}
          disabled={loading}
        >
          Monitor
        </Button>
      ),
    },
  ];

  const selectedBookData = testaments.find((book) => book.b === selectedBook);
  const selectedVersionData = bibleVersions.find(
    (version) => version.key === selectedBibleVersion,
  );
  const selectedModelData = modelOptions.find(
    (model) => model.value === selectedModel,
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Batch Operations</h2>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div
        style={{
          marginBottom: "30px",
          padding: "20px",
          border: "1px solid #ccc",
          borderRadius: "8px",
        }}
      >
        <h3>Create New Batch</h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "20px",
            marginBottom: "20px",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Model:
            </label>
            <SelectDropdown.Root
              open={modelDropdownOpen}
              onOpenChange={setModelDropdownOpen}
            >
              <SelectDropdown.Trigger
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={selectedModelData?.label || "Select Model"}
                icon={<ChevronDownIcon />}
              />
              <SelectDropdown.Content align="start" style={{ width: "400px" }}>
                {modelOptions.map((model) => (
                  <SelectDropdown.Item
                    key={model.value}
                    value={model.value}
                    icon={<CheckIcon />}
                    onClick={() => {
                      setSelectedModel(model.value);
                      setModelDropdownOpen(false);
                    }}
                  >
                    {model.label}
                  </SelectDropdown.Item>
                ))}
              </SelectDropdown.Content>
            </SelectDropdown.Root>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Book:
            </label>
            <SelectDropdown.Root
              open={bookDropdownOpen}
              onOpenChange={setBookDropdownOpen}
            >
              <SelectDropdown.Trigger
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={selectedBookData?.n || "Select Book"}
                icon={<ChevronDownIcon />}
              />
              <SelectDropdown.Content
                align="start"
                style={{
                  width: "300px",
                  maxHeight: "400px",
                  overflowY: "auto",
                }}
              >
                {testaments.map((book) => (
                  <SelectDropdown.Item
                    key={book.b}
                    value={book.n}
                    icon={<CheckIcon />}
                    onClick={() => {
                      setSelectedBook(book.b);
                      setBookDropdownOpen(false);
                    }}
                  >
                    {book.n} ({book.t})
                  </SelectDropdown.Item>
                ))}
              </SelectDropdown.Content>
            </SelectDropdown.Root>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Bible Version:
            </label>
            <SelectDropdown.Root
              open={versionDropdownOpen}
              onOpenChange={setVersionDropdownOpen}
            >
              <SelectDropdown.Trigger
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={
                  selectedVersionData?.value || "Select Version"
                }
                icon={<ChevronDownIcon />}
              />
              <SelectDropdown.Content
                align="start"
                style={{
                  width: "300px",
                  maxHeight: "400px",
                  overflowY: "auto",
                }}
              >
                {bibleVersions.map((version) => (
                  <SelectDropdown.Item
                    key={version.key}
                    value={version.value}
                    icon={<CheckIcon />}
                    onClick={() => {
                      setSelectedBibleVersion(version.key);
                      setVersionDropdownOpen(false);
                    }}
                  >
                    {version.value}
                  </SelectDropdown.Item>
                ))}
              </SelectDropdown.Content>
            </SelectDropdown.Root>
          </div>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "bold",
            }}
          >
            Explanation Types:
          </label>
          <div style={{ display: "flex", gap: "10px" }}>
            {["summary", "detailed", "byline"].map((type) => (
              <label
                key={type}
                style={{ display: "flex", alignItems: "center", gap: "5px" }}
              >
                <input
                  type="checkbox"
                  checked={selectedExplanationTypes.includes(type)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedExplanationTypes([
                        ...selectedExplanationTypes,
                        type,
                      ]);
                    } else {
                      setSelectedExplanationTypes(
                        selectedExplanationTypes.filter((t) => t !== type),
                      );
                    }
                  }}
                />
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <Button
            onClick={handleCreateBatch}
            disabled={
              loading || !selectedBook || selectedExplanationTypes.length === 0
            }
            loading={loading}
          >
            {loading ? "Creating..." : "Create New Batch"}
          </Button>
          <Button
            variant="outlined"
            onClick={fetchBatchJobs}
            disabled={loading}
            style={{ marginLeft: "10px" }}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <Table columns={columns} data={batchJobs} isLoading={loading} zebra />
      </div>
    </div>
  );
};
