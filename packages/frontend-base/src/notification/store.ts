import { atom } from "nanostores";

import { removeItem } from "../utils";
import type { NotificationProps } from "./types";

let NOTIFICATION_ID = 1;

export const $notifications = atom<NotificationProps[]>([]);

export function addNotification(notification: NotificationProps) {
  $notifications.set([
    ...$notifications.get(),
    { id: `notification-${NOTIFICATION_ID}`, ...notification },
  ]);
  NOTIFICATION_ID++;
}

export function removeNotification(notification: NotificationProps) {
  const newItems = removeItem($notifications.get(), notification);
  $notifications.set([...newItems]);
}

export function removeAllNotifications() {
  $notifications.set([]);
}
