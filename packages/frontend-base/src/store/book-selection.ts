import { atom } from "nanostores";

// Create a global store for the selected book name
export const selectedBookStore = atom<string | null>(null);

// Helper function to update the selected book
export function updateSelectedBook(bookName: string | null) {
  selectedBookStore.set(bookName);
}
