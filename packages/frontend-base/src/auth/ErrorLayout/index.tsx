import type { ReactNode } from "react";

import { Button } from "../../..";
import styles from "./ErrorLayout.module.css";

export type ErrorLayoutProps = {
  title: string;
  subTitle: string;
  icon: ReactNode;
  instructions?: string;
  redirectLabel?: string;
  footer: string | ReactNode;
  onClickRedirect?: () => void;
};

export const ErrorLayout = ({
  title,
  subTitle,
  icon,
  instructions,
  redirectLabel,
  footer,
  onClickRedirect,
}: ErrorLayoutProps) => {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.image}>{icon}</div>
      <h2 className={styles.subTitle}>{subTitle}</h2>
      {instructions && <p className={styles.instructions}>{instructions}</p>}
      {redirectLabel && (
        <Button className={styles.redirectButton} onClick={onClickRedirect}>
          {redirectLabel}
        </Button>
      )}
      <p className={styles.footer}>{footer}</p>
    </div>
  );
};
