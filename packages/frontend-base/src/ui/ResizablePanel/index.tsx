import type React from "react";

/**
 * ResizablePanel components - From Figma shadcn/ui
 * TODO: Implement in Phase 2.1
 * Wraps react-resizable-panels library
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
  // Placeholder - will use react-resizable-panels in Phase 2.1
  return (
    <div className={className} data-direction={direction}>
      {children}
    </div>
  );
}

interface ResizablePanelProps {
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  children: React.ReactNode;
  className?: string;
}

export function ResizablePanel({ children, className }: ResizablePanelProps) {
  // Placeholder - will use react-resizable-panels in Phase 2.1
  return <div className={className}>{children}</div>;
}

interface ResizableHandleProps {
  className?: string;
}

export function ResizableHandle({ className }: ResizableHandleProps) {
  // Placeholder - will use react-resizable-panels in Phase 2.1
  return <div className={className}>||</div>;
}
