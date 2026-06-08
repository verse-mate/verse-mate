import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../Button/Button";
import { Dialog } from "../../Dialog";
import styles from "./DailyVerses.module.css";
import {
  type DailyVerse,
  type DailyVerseInput,
  createDailyVerse,
  createDailyVerseTag,
  deleteDailyVerse,
  getDailyVerseHistory,
  getDailyVerseTags,
  getDailyVerses,
  updateDailyVerse,
} from "./dailyVersesAdminApi";

const emptyForm = {
  book_id: 1,
  chapter_number: 1,
  verse_start: 1,
  verse_end: "" as number | "",
  note: "",
  is_active: true,
  tag_ids: [] as string[],
};

export const DailyVerses = () => {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newTag, setNewTag] = useState({ slug: "", label: "" });
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const flash = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), type === "error" ? 5000 : 3000);
  };

  const { data: verses, isLoading } = useQuery({
    queryKey: ["admin-daily-verses"],
    queryFn: () => getDailyVerses(false),
  });
  const { data: tags } = useQuery({
    queryKey: ["admin-daily-verse-tags"],
    queryFn: getDailyVerseTags,
  });
  const { data: history } = useQuery({
    queryKey: ["admin-daily-verse-history"],
    queryFn: getDailyVerseHistory,
  });

  const invalidateVerses = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-daily-verses"] });

  const buildInput = (): DailyVerseInput => ({
    book_id: Number(form.book_id),
    chapter_number: Number(form.chapter_number),
    verse_start: Number(form.verse_start),
    verse_end: form.verse_end === "" ? null : Number(form.verse_end),
    note: form.note.trim() === "" ? null : form.note,
    is_active: form.is_active,
    tag_ids: form.tag_ids,
  });

  const createMutation = useMutation({
    mutationFn: createDailyVerse,
    onSuccess: () => {
      invalidateVerses();
      resetForm();
      flash("success", "Daily verse created.");
    },
    onError: (e: any) => flash("error", `Create failed: ${e.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: DailyVerseInput }) =>
      updateDailyVerse(id, input),
    onSuccess: () => {
      invalidateVerses();
      resetForm();
      flash("success", "Daily verse updated.");
    },
    onError: (e: any) => flash("error", `Update failed: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDailyVerse,
    onSuccess: () => {
      invalidateVerses();
      setDeleteId(null);
      flash("success", "Daily verse deactivated.");
    },
    onError: (e: any) => {
      setDeleteId(null);
      flash("error", `Delete failed: ${e.message}`);
    },
  });

  const createTagMutation = useMutation({
    mutationFn: createDailyVerseTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-daily-verse-tags"] });
      setNewTag({ slug: "", label: "" });
      flash("success", "Tag added.");
    },
    onError: (e: any) => flash("error", `Add tag failed: ${e.message}`),
  });

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, input: buildInput() });
    } else {
      createMutation.mutate(buildInput());
    }
  };

  const handleEdit = (v: DailyVerse) => {
    setEditingId(v.id);
    setForm({
      book_id: v.book_id,
      chapter_number: v.chapter_number,
      verse_start: v.verse_start,
      verse_end: v.verse_end ?? "",
      note: v.note ?? "",
      is_active: v.is_active,
      tag_ids: v.tags.map((t) => t.id),
    });
  };

  const toggleTag = (tagId: string) => {
    setForm((prev) => ({
      ...prev,
      tag_ids: prev.tag_ids.includes(tagId)
        ? prev.tag_ids.filter((id) => id !== tagId)
        : [...prev.tag_ids, tagId],
    }));
  };

  if (isLoading) return <div>Loading daily verses…</div>;

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Daily Verses (Verse of the Day)</h2>
      </div>

      {/* D-26: editing today's verse takes effect on the next user refresh. */}
      <div className={styles.banner}>
        Changes to today's verse take effect on the next widget refresh — there
        may be a brief inconsistency window.
      </div>

      {message && (
        <div
          className={
            message.type === "success"
              ? styles.successMessage
              : styles.errorMessage
          }
        >
          {message.text}
        </div>
      )}

      <div className={styles.form}>
        <h3>{editingId ? "Edit Verse" : "Add Verse"}</h3>
        <form onSubmit={handleSubmit}>
          <div className={styles.row}>
            <div className={styles.formGroup}>
              <label htmlFor="book_id">Book ID (1–66):</label>
              <input
                type="number"
                id="book_id"
                min={1}
                max={66}
                value={form.book_id}
                onChange={(e) =>
                  setForm((p) => ({ ...p, book_id: Number(e.target.value) }))
                }
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="chapter_number">Chapter:</label>
              <input
                type="number"
                id="chapter_number"
                min={1}
                value={form.chapter_number}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    chapter_number: Number(e.target.value),
                  }))
                }
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="verse_start">Verse start:</label>
              <input
                type="number"
                id="verse_start"
                min={1}
                value={form.verse_start}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    verse_start: Number(e.target.value),
                  }))
                }
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="verse_end">Verse end (optional):</label>
              <input
                type="number"
                id="verse_end"
                min={1}
                value={form.verse_end}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    verse_end:
                      e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="note">Note (optional):</label>
            <textarea
              id="note"
              rows={2}
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
            />
          </div>

          <div className={styles.formGroup}>
            <span className={styles.label}>Tags:</span>
            <div className={styles.tagChecklist}>
              {(tags ?? []).map((tag) => (
                <label key={tag.id} className={styles.tagCheckbox}>
                  <input
                    type="checkbox"
                    checked={form.tag_ids.includes(tag.id)}
                    onChange={() => toggleTag(tag.id)}
                  />
                  {tag.label}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm((p) => ({ ...p, is_active: e.target.checked }))
                }
              />
              Active
            </label>
          </div>

          <div className={styles.formActions}>
            <Button type="submit" disabled={saving}>
              {editingId ? "Update" : "Add"} Verse
            </Button>
            {editingId && (
              <Button type="button" variant="outlined" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className={styles.list}>
        <h3>Curated Pool ({verses?.length ?? 0})</h3>
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Tags</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(verses ?? []).map((v) => (
              <tr key={v.id}>
                <td>
                  {v.book_id}:{v.chapter_number}:{v.verse_start}
                  {v.verse_end ? `-${v.verse_end}` : ""}
                </td>
                <td>{v.tags.map((t) => t.slug).join(", ")}</td>
                <td>{v.is_active ? "Yes" : "No"}</td>
                <td>
                  <Button
                    type="button"
                    variant="outlined"
                    className={styles.smallButton}
                    onClick={() => handleEdit(v)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outlined"
                    className={styles.smallButton}
                    onClick={() => setDeleteId(v.id)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.manageTags}>
        <h3>Manage Tags</h3>
        <div className={styles.tagList}>
          {(tags ?? []).map((tag) => (
            <span key={tag.id} className={styles.tagPill}>
              {tag.label} ({tag.slug})
            </span>
          ))}
        </div>
        <form
          className={styles.tagForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (newTag.slug && newTag.label) createTagMutation.mutate(newTag);
          }}
        >
          <input
            type="text"
            placeholder="slug (e.g. lament)"
            value={newTag.slug}
            onChange={(e) =>
              setNewTag((p) => ({ ...p, slug: e.target.value.trim() }))
            }
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            title="lowercase, hyphen-separated"
          />
          <input
            type="text"
            placeholder="Label (e.g. Lament)"
            value={newTag.label}
            onChange={(e) =>
              setNewTag((p) => ({ ...p, label: e.target.value }))
            }
          />
          <Button type="submit" disabled={createTagMutation.isPending}>
            Add Tag
          </Button>
        </form>
      </div>

      <div className={styles.history}>
        <h3>Recent Picks</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {(history ?? []).map((h) => (
              <tr key={h.id}>
                <td>{String(h.pick_date).slice(0, 10)}</td>
                <td>
                  {h.book_id}:{h.chapter_number}:{h.verse_start}
                  {h.verse_end ? `-${h.verse_end}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <Dialog.Content>
          <Dialog.Head>Confirm Delete</Dialog.Head>
          <Dialog.Description>
            Deactivate this verse? It will be removed from the rotation (soft
            delete).
          </Dialog.Description>
          <Dialog.Footer>
            <Button variant="outlined" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </div>
  );
};
