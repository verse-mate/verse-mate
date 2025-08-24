"use client";

import { AnimatePresence } from "framer-motion";
import { useStore } from "../utils/use-store";
import { Modal } from "./Modal";
import { $modal } from "./store";

export const ModalContainer = () => {
  const notifications = useStore($modal);

  return (
    <AnimatePresence mode="popLayout">
      {notifications.map((item) => {
        return <Modal key={item.id} {...item} />;
      })}
    </AnimatePresence>
  );
};
