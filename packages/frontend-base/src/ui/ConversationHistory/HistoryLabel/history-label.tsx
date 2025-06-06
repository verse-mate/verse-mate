import type React from "react";
import styles from "./history-label.module.css";

type HistoryLabelProps = {
  date: string;
  className?: string;
};

export const HistoryLabel: React.FC<HistoryLabelProps> = ({
  date,
  className,
}) => {
  const formatDateKey = (key: string): string => {
    switch (key) {
      case "today":
        return "Today";
      case "yesterday":
        return "Yesterday";
      case "lastSevenDays":
        return "Previous 7 days";
      default:
        return new Date(key).toLocaleDateString();
    }
  };

  return (
    <div className={`${styles.container} ${className}`}>
      <span>{formatDateKey(date)}</span>
    </div>
  );
};
