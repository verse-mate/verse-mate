import type React from "react";
import { type ReactNode, createContext, useContext } from "react";
import { useNotes } from "../hooks/useNotes";

type NotesContextType = ReturnType<typeof useNotes>;

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export const NotesProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const notesValue = useNotes();

  return (
    <NotesContext.Provider value={notesValue}>{children}</NotesContext.Provider>
  );
};

export const useNotesContext = (): NotesContextType => {
  const context = useContext(NotesContext);
  if (context === undefined) {
    throw new Error("useNotesContext must be used within a NotesProvider");
  }
  return context;
};
