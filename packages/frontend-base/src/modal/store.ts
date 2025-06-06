import { atom } from "nanostores";

import type { ModalProps } from "./types";

export const $modal = atom<ModalProps[]>([]);

export function addModal(modal: ModalProps) {
  if (!modal.id) {
    modal.id = crypto.randomUUID();
  }

  $modal.set([...$modal.get(), { ...modal }]);
}

export function removeModal(id: string) {
  const newItems = $modal.get().filter((modal) => modal.id !== id);

  $modal.set([...newItems]);
}

export function removeAllModals() {
  $modal.set([]);
}
