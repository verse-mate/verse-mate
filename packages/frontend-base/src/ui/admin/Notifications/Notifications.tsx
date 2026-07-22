import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../Button/Button";
import styles from "./Notifications.module.css";
import {
  type BroadcastResult,
  getRecipientCount,
  sendBroadcast,
} from "./notificationsAdminApi";

const CONFIRM_WORD = "SEND";

/**
 * Admin broadcast (GH-281 / D-14). Sends an ad-hoc push to every active device.
 * Guardrails: shows the recipient count, requires typing SEND to confirm (the
 * blast is irreversible), and surfaces the server's deep-link validation error.
 */
export const Notifications = () => {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const flash = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), type === "error" ? 6000 : 4000);
  };

  const { data: recipientCount, isLoading: countLoading } = useQuery({
    queryKey: ["admin-notifications-recipient-count"],
    queryFn: getRecipientCount,
  });

  const broadcastMutation = useMutation({
    mutationFn: sendBroadcast,
    onSuccess: (result: BroadcastResult) => {
      flash("success", `Sent to ${result.recipientCount} device(s).`);
      setTitle("");
      setBody("");
      setDeepLink("");
      setConfirm("");
    },
    onError: (e: Error) => flash("error", e.message),
  });

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    confirm.trim() === CONFIRM_WORD &&
    !broadcastMutation.isPending;

  const handleSend = () => {
    if (!canSend) return;
    broadcastMutation.mutate({
      title: title.trim(),
      body: body.trim(),
      deepLink,
    });
  };

  return (
    <div className={styles.container}>
      <h2>Send Notification</h2>
      <p className={styles.intro}>
        Broadcasts a push to{" "}
        <span className={styles.count}>
          {countLoading ? "…" : recipientCount ?? 0}
        </span>{" "}
        active device(s). This is immediate and cannot be undone.
      </p>

      {message && (
        <div
          className={`${styles.message} ${
            message.type === "success"
              ? styles.messageSuccess
              : styles.messageError
          }`}
        >
          {message.text}
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="broadcast-title">
          Title
        </label>
        <input
          id="broadcast-title"
          className={styles.input}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New book available"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="broadcast-body">
          Body
        </label>
        <textarea
          id="broadcast-body"
          className={styles.textarea}
          value={body}
          maxLength={1000}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Psalms is now available in VerseMate."
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="broadcast-deeplink">
          Deep link (optional)
        </label>
        <input
          id="broadcast-deeplink"
          className={styles.input}
          value={deepLink}
          onChange={(e) => setDeepLink(e.target.value)}
          placeholder="versemate:///bible/19/1?verseStart=1"
        />
        <span className={styles.hint}>
          Must start with <code>versemate://</code> if provided. Leave blank to
          just open the app.
        </span>
      </div>

      <div className={styles.confirmRow}>
        <label className={styles.label} htmlFor="broadcast-confirm">
          Type {CONFIRM_WORD} to confirm this goes to all {recipientCount ?? 0}{" "}
          device(s)
        </label>
        <input
          id="broadcast-confirm"
          className={styles.input}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={CONFIRM_WORD}
        />
      </div>

      <div className={styles.actions}>
        <Button variant="contained" onClick={handleSend} disabled={!canSend}>
          {broadcastMutation.isPending ? "Sending…" : "Send broadcast"}
        </Button>
      </div>
    </div>
  );
};
