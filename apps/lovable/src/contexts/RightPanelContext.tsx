import { createContext, useContext } from 'react';

interface RightPanelContextValue {
  /** Call this instead of navigate(-1) or navigate('/menu') to go back in the right panel */
  goBack: () => void;
  /** True when rendering inside the desktop right panel */
  isRightPanel: boolean;
}

const RightPanelContext = createContext<RightPanelContextValue | null>(null);

export const RightPanelProvider = RightPanelContext.Provider;

/**
 * Returns right-panel navigation helpers if inside a desktop right panel,
 * or null if rendering normally (mobile / left panel).
 */
export function useRightPanel(): RightPanelContextValue | null {
  return useContext(RightPanelContext);
}
