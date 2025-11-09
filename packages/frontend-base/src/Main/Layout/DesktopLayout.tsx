import type React from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../ui/ResizablePanel";
import styles from "./desktop-layout.module.css";

interface DesktopLayoutProps {
  leftPanel: React.ReactNode;
  centerPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  className?: string;
}

/**
 * DesktopLayout - 3-panel resizable layout for desktop view
 * Phase 2.2 - Implemented
 * - Left panel: Navigation (15% default, 10-30% range)
 * - Center panel: Bible text content (55% default, 40-80% range)
 * - Right panel: Commentary/Highlights (30% default, 20-40% range)
 */
export function DesktopLayout({
  leftPanel,
  centerPanel,
  rightPanel,
  className,
}: DesktopLayoutProps) {
  return (
    <div className={`${styles.container} ${className || ""}`}>
      <ResizablePanelGroup direction="horizontal">
        {/* Left Navigation Panel */}
        <ResizablePanel defaultSize={15} minSize={10} maxSize={30}>
          <div className={styles.leftPanel}>{leftPanel}</div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Center Bible Text Panel */}
        <ResizablePanel defaultSize={55} minSize={40} maxSize={80}>
          <div className={styles.centerPanel}>{centerPanel}</div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Right Commentary/Highlights Panel */}
        <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
          <div className={styles.rightPanel}>{rightPanel}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
