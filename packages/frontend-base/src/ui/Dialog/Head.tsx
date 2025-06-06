"use client";

import { Close, Description, Title } from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { X } from "react-feather";

import { Button } from "../Button/Button";
import styles from "./Dialog.module.css";

export interface DialogHead {
  children?: ReactNode;
  title?: string;
}

export function DialogHead({ children, title }: DialogHead) {
  return (
    <div className={styles.head}>
      <div
        className={styles.headLeftContent}
        hidden={Boolean(!children && !title)}
      >
        <Title hidden={Boolean(!title)} className={styles.title}>
          {title}
        </Title>
        {children}
      </div>

      <Close asChild>
        <Button appearance="text">
          <X color="var(--foreground)" />
        </Button>
      </Close>
    </div>
  );
}

export { Description };
