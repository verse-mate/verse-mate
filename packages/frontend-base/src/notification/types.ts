import type { ReactNode } from "react";

export interface NotificationProps {
  id?: string;
  content?: ReactNode;
  autoCloseDelay?: number;
  disableAutoClose?: boolean;
  color?: string;
  appearance?: "discreet" | "outline";
  hideProgress?: boolean;
}
