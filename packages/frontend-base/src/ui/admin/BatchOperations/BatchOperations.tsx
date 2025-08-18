"use client";
import { api } from "backend-api";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../../Button/Button";
import { Table, type TableColumn } from "../../Table/Table";
import styles from "./BatchOperations.module.css";

interface BatchJob {
  id: string;
  batch_type: string;
  openai_batch_id: string;
  status: string;
  createdAt: string;
  actual_cost?: number;
  created_by: string;
}

export const BatchOperations = () => {
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBatchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.admin["batch-history"].get({ query: {} });
      if (response.data) {
        setBatchJobs(Array.isArray(response.data) ? response.data : []);
      }
    } catch (err) {
      setError("Failed to fetch batch jobs");
      console.error("Error fetching batch jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateBatch = async () => {
    try {
      setLoading(true);
      setError(null);
      await api.admin["batch-explanations"].post({
        type: "book",
        bookId: 1,
        bibleVersion: "NASB1995",
        model: "gpt-4",
        explanationTypes: ["summary"],
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
      property: "createdAt",
      render: (job) => new Date(job.createdAt).toLocaleDateString(),
    },
    {
      title: "Actions",
      property: "id",
      render: (job) => (
        <Button
          variant="outlined"
          onClick={() => handleMonitorBatch(job.openai_batch_id)}
          disabled={loading}
        >
          Monitor
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Batch Operations</h2>
        <Button
          onClick={handleCreateBatch}
          loading={loading}
          disabled={loading}
        >
          Create New Batch
        </Button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableContainer}>
        <Table columns={columns} data={batchJobs} isLoading={loading} zebra />
      </div>

      <div className={styles.actions}>
        <Button variant="outlined" onClick={fetchBatchJobs} disabled={loading}>
          Refresh
        </Button>
      </div>
    </div>
  );
};
