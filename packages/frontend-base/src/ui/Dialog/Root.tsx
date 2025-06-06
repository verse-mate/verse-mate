"use client";

import {
  Content,
  Overlay,
  Portal,
  Root,
  type DialogProps as RootProps,
} from "@radix-ui/react-dialog";
import type { CSSProperties, ReactNode } from "react";

import styles from "./Dialog.module.css";

export interface DialogProps extends RootProps {
  children: ReactNode;
  maxWidth?: CSSProperties["maxWidth"];
}

export function DialogRoot({ children, maxWidth, ...rootProps }: DialogProps) {
  return (
    <Root {...rootProps}>
      <Portal>
        <Overlay className={styles.overlay}>
          <Content className={styles.content} style={{ maxWidth }}>
            {children}
          </Content>
        </Overlay>
      </Portal>
    </Root>
  );
}
