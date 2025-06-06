"use client";

import { AnimatePresence } from "framer-motion";

import { useStore } from "../utils/use-store";
import { Notification } from "./Notification";
import styles from "./Notifications.module.css";
import { $notifications, removeNotification } from "./store";

export function Notifications() {
  const notifications = useStore($notifications);

  return (
    <ul role="group" className={styles.notifications}>
      <AnimatePresence mode="popLayout">
        {notifications.map((item) => {
          return (
            <Notification
              key={item.id}
              {...item}
              onRemove={() => {
                removeNotification(item);
              }}
            />
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
