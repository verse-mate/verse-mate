"use client";

import {
  Content,
  Portal,
  Provider,
  Root,
  type TooltipContentProps,
  Trigger,
} from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

import styles from "./Tooltip.module.css";

interface TooltipProps {
  children: ReactNode;
  label: ReactNode;
  side?: TooltipContentProps["side"];
  align?: TooltipContentProps["align"];
  sideOffset?: TooltipContentProps["align"];
  isEnabled?: boolean;
  withPortal?: boolean;
}

const ContentContainer = ({
  withPortal,
  children,
}: {
  withPortal: boolean;
  children: ReactNode;
}) => {
  if (withPortal) {
    return <Portal>{children}</Portal>;
  }

  return children;
};

export const Tooltip = ({
  children,
  label,
  align,
  side,
  isEnabled = true,
  withPortal = true,
}: TooltipProps) => {
  if (!isEnabled) {
    return children;
  }

  return (
    <Provider>
      <Root delayDuration={0}>
        <Trigger asChild>{children}</Trigger>

        <ContentContainer withPortal={withPortal}>
          <Content
            className={styles.content}
            align={align}
            side={side}
            sideOffset={8}
          >
            {label}
          </Content>
        </ContentContainer>
      </Root>
    </Provider>
  );
};
