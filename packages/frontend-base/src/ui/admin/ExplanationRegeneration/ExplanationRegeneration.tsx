"use client";
import { api } from "backend-api";
import { useState } from "react";
import { Button } from "../../Button/Button";
import styles from "./ExplanationRegeneration.module.css";

export const ExplanationRegeneration = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    bibleVersion: "NASB1995",
    explanationType: "summary",
    bookId: "",
    chapterId: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.bookId || !formData.chapterId) {
      setError("Please fill in all required fields");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const response = await api.admin.explanation.regenerate.post({
        bookId: Number(formData.bookId),
        chapterNumber: Number(formData.chapterId),
        explanationType: formData.explanationType,
        bibleVersion: formData.bibleVersion,
      });

      if (response.data) {
        setSuccess("Explanation regeneration started successfully");
        setFormData({
          bibleVersion: "NASB1995",
          explanationType: "summary",
          bookId: "",
          chapterId: "",
        });
      }
    } catch (err) {
      setError("Failed to start explanation regeneration");
      console.error("Error regenerating explanation:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className={styles.container}>
      <h2>Explanation Regeneration</h2>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="bibleVersion">Bible Version:</label>
          <select
            id="bibleVersion"
            name="bibleVersion"
            value={formData.bibleVersion}
            onChange={handleInputChange}
            className={styles.select}
          >
            <option value="NASB1995">NASB 1995</option>
            <option value="ESV">ESV</option>
            <option value="NIV">NIV</option>
            <option value="KJV">KJV</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="explanationType">Explanation Type:</label>
          <select
            id="explanationType"
            name="explanationType"
            value={formData.explanationType}
            onChange={handleInputChange}
            className={styles.select}
          >
            <option value="summary">Summary</option>
            <option value="detailed">Detailed</option>
            <option value="verse_by_verse">Verse by Verse</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="bookId">Book ID:</label>
          <input
            type="number"
            id="bookId"
            name="bookId"
            value={formData.bookId}
            onChange={handleInputChange}
            className={styles.input}
            placeholder="Enter book ID"
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="chapterId">Chapter ID:</label>
          <input
            type="number"
            id="chapterId"
            name="chapterId"
            value={formData.chapterId}
            onChange={handleInputChange}
            className={styles.input}
            placeholder="Enter chapter ID"
            required
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {success && <div className={styles.success}>{success}</div>}

        <div className={styles.actions}>
          <Button type="submit" loading={loading} disabled={loading}>
            Regenerate Explanation
          </Button>
        </div>
      </form>
    </div>
  );
};
