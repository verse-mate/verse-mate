"use client";
import { api } from "backend-api";
import { useCallback, useEffect, useRef, useState } from "react";
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
  book_name?: string | null;
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
  const [listLoading, setListLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monitoringId, setMonitoringId] = useState<string | null>(null);

  const [selectedModel, setSelectedModel] = useState<string>("gpt-5-mini");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedBibleVersion, setSelectedBibleVersion] =
    useState<string>("NASB1995");
  const [selectedExplanationTypes, setSelectedExplanationTypes] = useState<
    string[]
  >(["summary"]);
  const [skipExistingExplanations, setSkipExistingExplanations] =
    useState(true);

  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [bookDropdownOpen, setBookDropdownOpen] = useState(false);
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);

  const fetchBatchJobsOnly = useCallback(async () => {
    try {
      const response = await api.admin["batch-history"].get({ query: {} });
      if (response.data) {
        const jobs = Array.isArray(response.data)
          ? response.data.map((job) => ({
              ...job,
              id: String(job.id),
            }))
          : [];
        setBatchJobs(jobs);
        return jobs;
      }
      return [];
    } catch (err) {
      setError("Failed to fetch batch jobs");
      console.error("Error fetching batch jobs:", err);
      return [];
    }
  }, []);

  const fetchBatchJobs = useCallback(async () => {
    try {
      setListLoading(true);
      setError(null);
      await fetchBatchJobsOnly();
    } catch (err) {
      setError("Failed to fetch batch jobs");
      console.error("Error fetching batch jobs:", err);
    } finally {
      setListLoading(false);
    }
  }, [fetchBatchJobsOnly]);

  const refreshAndMonitorAll = useCallback(async () => {
    try {
      setListLoading(true);
      setError(null);

      // First fetch all jobs
      const jobs = await fetchBatchJobsOnly();

      // Monitor all active batches (not completed, failed, cancelled, or expired)
      const activeBatches = jobs.filter(
        (job) =>
          job.openai_batch_id &&
          ![
            "completed",
            "failed",
            "cancelled",
            "expired",
            "partial_failure",
          ].includes(job.status),
      );

      // Monitor each active batch in parallel
      if (activeBatches.length > 0) {
        console.log(
          `[BATCH_UI] Monitoring ${activeBatches.length} active batches`,
        );
        const monitorPromises = activeBatches.map(async (job) => {
          try {
            if (job.openai_batch_id) {
              await (api.admin.batch as any)[job.openai_batch_id].get();
            }
          } catch (err) {
            console.error(
              `Error monitoring batch ${job.openai_batch_id}:`,
              err,
            );
          }
        });

        await Promise.all(monitorPromises);

        // Fetch updated data after monitoring
        await fetchBatchJobsOnly();
      }
    } catch (err) {
      setError("Failed to refresh and monitor batch jobs");
      console.error("Error refreshing and monitoring batch jobs:", err);
    } finally {
      setListLoading(false);
    }
  }, [fetchBatchJobsOnly]);
  const hasFetchedRef = useRef(false);

  const handleCreateBatch = async () => {
    if (selectedBook === null) {
      setError("Please select a book");
      return;
    }

    if (selectedExplanationTypes.length === 0) {
      setError("Please select at least one explanation type");
      return;
    }

    try {
      setCreating(true);
      setError(null);
      await api.admin["batch-explanations"].post({
        type: "book",
        bookName: selectedBook,
        bibleVersion: selectedBibleVersion,
        model: selectedModel,
        explanationTypes: selectedExplanationTypes,
        skipExisting: skipExistingExplanations,
      });
      await fetchBatchJobs();
    } catch (err) {
      setError("Failed to create batch job");
      console.error("Error creating batch job:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleMonitorBatch = async (batchId: string) => {
    try {
      setMonitoringId(batchId);
      setError(null);
      await (api.admin.batch as any)[batchId].get();
      await fetchBatchJobs();
    } catch (err) {
      setError("Failed to monitor batch job");
      console.error("Error monitoring batch job:", err);
    } finally {
      setMonitoringId(null);
    }
  };

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchBatchJobs();
  }, [fetchBatchJobs]);

  const columns: TableColumn<BatchJob>[] = [
    {
      title: "ID",
      property: "id",
      className: styles.idColumn,
    },
    {
      title: "Book",
      property: "book_name",
      className: styles.bookColumn,
      render: (job) => (
        <span className={styles.nowrapColumn}>
          {job.book_name || "N/A"}
          {job.bible_version && (
            <span
              style={{ fontSize: "12px", color: "#666", marginLeft: "4px" }}
            >
              ({job.bible_version})
            </span>
          )}
        </span>
      ),
    },
    {
      title: "Type",
      property: "batch_type",
      className: styles.typeColumn,
    },
    {
      title: "OpenAI Batch ID",
      property: "openai_batch_id",
      className: styles.openaiBatchIdColumn,
    },
    {
      title: <span style={{ marginLeft: "50px" }}>Status</span>,
      property: "status",
      className: styles.statusColumn,
      render: (job) => (
        <span
          className={`${styles.status} ${styles.statusWithSpacing} ${
            styles[
              job.status === "in_progress"
                ? "inProgress"
                : job.status === "partial_failure"
                  ? "partialFailure"
                  : job.status
            ]
          }`}
        >
          {job.status === "partial_failure" ? "Partial Failure" : job.status}
        </span>
      ),
    },
    {
      title: "Cost",
      property: "actual_cost",
      className: styles.costColumn,
      render: (job) =>
        job.actual_cost ? `$${job.actual_cost.toFixed(4)}` : "N/A",
    },
    {
      title: "Created",
      property: "created_at",
      className: styles.createdColumn,
      render: (job) => new Date(job.created_at).toLocaleDateString(),
    },
    {
      title: "Actions",
      property: "id",
      className: styles.actionsColumn,
      render: (job) => (
        <Button
          variant="outlined"
          onClick={() => handleMonitorBatch(job.openai_batch_id || "")}
          disabled={
            !!monitoringId && monitoringId === (job.openai_batch_id || "")
          }
        >
          Monitor
        </Button>
      ),
    },
  ];

  const selectedBookData = testaments.find((book) => book.n === selectedBook);
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
              onValueChange={(val) => setSelectedModel(val)}
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
              onValueChange={(val) => setSelectedBook(val)}
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
              onValueChange={(val) => setSelectedBibleVersion(val)}
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
                    value={version.key}
                    icon={<CheckIcon />}
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
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontWeight: "bold",
            }}
          >
            <input
              type="checkbox"
              checked={skipExistingExplanations}
              onChange={(e) => setSkipExistingExplanations(e.target.checked)}
            />
            Don't replace existing explanations
          </label>
          <p
            style={{
              fontSize: "14px",
              color: "#666",
              marginTop: "4px",
              marginLeft: "24px",
            }}
          >
            When checked, only generates explanations for chapters that don't
            already have explanations of the selected types.
          </p>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <Button
            onClick={handleCreateBatch}
            disabled={
              creating ||
              selectedBook === null ||
              selectedExplanationTypes.length === 0
            }
            loading={creating}
          >
            {creating ? "Creating..." : "Create New Batch"}
          </Button>
          <Button
            variant="outlined"
            onClick={refreshAndMonitorAll}
            disabled={listLoading}
            loading={listLoading}
            style={{ marginLeft: "10px" }}
          >
            {listLoading ? "Refreshing..." : "Refresh & Monitor All"}
          </Button>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <Table
          columns={columns}
          data={batchJobs}
          isLoading={listLoading}
          zebra
        />
      </div>
    </div>
  );
};
