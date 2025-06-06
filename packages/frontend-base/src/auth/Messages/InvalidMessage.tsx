import type { ReactNode } from "react";
import { AlertCircle } from "react-feather";

import { Text } from "../../ui/Text/Text";
import styles from "./styles.module.css";

interface InvalidMessageProps {
  title: string;
  disclaimer: string;
  children?: ReactNode;
}

export function InvalidMessage({
  children,
  disclaimer,
  title,
}: InvalidMessageProps) {
  return (
    <div className={styles.container}>
      <div className={styles.head}>
        <AlertCircle size="48" color="var(--error)" />
        <Text variant="h2" weight="bold" color="var(--error)" size="1.5rem">
          {title}
        </Text>
        <Text color="var(--neutral)">{disclaimer}</Text>
      </div>

      {children}
    </div>
  );
}
