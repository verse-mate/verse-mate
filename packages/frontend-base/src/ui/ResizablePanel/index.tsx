import type React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import styles from "./resizable-panel.module.css";

/**
 * ResizablePanel components - Wraps react-resizable-panels library
 * Phase 2.1 - Implemented
 */

interface ResizablePanelGroupProps {
  direction: "horizontal" | "vertical";
  children: React.ReactNode;
  className?: string;
}

export function ResizablePanelGroup({
  direction,
  children,
  className,
}: ResizablePanelGroupProps) {
  return (
    <PanelGroup direction={direction} className={className}>
      {children}
    </PanelGroup>
  );
}

interface ResizablePanelProps {
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  children: React.ReactNode;
  className?: string;
}

export function ResizablePanel({
  defaultSize,
  minSize,
  maxSize,
  children,
  className,
}: ResizablePanelProps) {
  return (
    <Panel
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      className={className}
    >
      {children}
    </Panel>
  );
}

interface ResizableHandleProps {
  className?: string;
  withHandle?: boolean;
}

export function ResizableHandle({
  className,
  withHandle = true,
}: ResizableHandleProps) {
  return (
    <PanelResizeHandle className={`${styles.resizeHandle} ${className || ""}`}>
      {withHandle && <div className={styles.resizeHandleInner} />}
    </PanelResizeHandle>
  );
}
