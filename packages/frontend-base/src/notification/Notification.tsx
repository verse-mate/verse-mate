"use client";

import { motion, usePresence } from "framer-motion";
import {
  type CSSProperties,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { X } from "react-feather";

import styles from "./Notifications.module.css";
import type { NotificationProps } from "./types";

const whileDrag = {
  opacity: 0.5,
};

const dragConstraints = {
  left: 0,
  right: 0,
};

const transition = {
  type: "spring",
  stiffness: 800,
  damping: 40,
};

const animate = {
  scale: 1,
  opacity: 1,
};

const exit = {
  scale: 0.9,
  opacity: 0,
};

const progressInitial = {
  transform: "translateX(0)",
};

const progressAnimate = {
  transform: "translateX(-100%)",
};

const initial = { scale: 0.8, opacity: 0 };

const DEFAULT_TIMEOUT = 5000;

export const Notification = forwardRef<
  HTMLLIElement,
  NotificationProps & { onRemove: () => void }
>(
  (
    {
      id,
      content,
      onRemove,
      autoCloseDelay,
      disableAutoClose,
      appearance = "outline",
      color = "var(--dust)",
      hideProgress = false,
    },
    ref,
  ) => {
    const [isPresent, safeToRemove] = usePresence();

    const [timeoutRef, setTimeoutRef] = useState<
      ReturnType<typeof setTimeout> | undefined
    >(undefined);

    // biome-ignore lint/correctness/useExhaustiveDependencies: TODO: Should be reviwed
    useEffect(() => {
      if (disableAutoClose) {
        return;
      }

      setTimeoutRef(
        setTimeout(() => {
          onRemove();
        }, autoCloseDelay || DEFAULT_TIMEOUT),
      );

      return () => clearTimeout(timeoutRef);
    }, []);

    const progressBarAnimate = useMemo(() => {
      return {
        ease: "linear",
        duration: autoCloseDelay
          ? autoCloseDelay / 1000
          : DEFAULT_TIMEOUT / 1000,
        type: "keyframes",
      };
    }, [autoCloseDelay]);

    const handleOnClose = useCallback(() => {
      onRemove();
      safeToRemove?.();
      clearTimeout(timeoutRef);
    }, [onRemove, safeToRemove, timeoutRef]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: TODO: Should be reviwed
    useEffect(() => {
      if (!isPresent) {
        safeToRemove?.();
        clearTimeout(timeoutRef);
      }
    }, [isPresent]);

    return (
      <motion.li
        ref={ref}
        id={id}
        layout
        drag="x"
        style={{ "--color": color } as CSSProperties}
        className={`${styles.notificationContainer} ${styles[appearance]}`}
        whileDrag={whileDrag}
        dragElastic={0.2}
        dragConstraints={dragConstraints}
        onDragEnd={(_, info) => {
          if (info.offset.x < -500 || info.offset.x > 0) {
            handleOnClose();
          }
        }}
        transition={transition}
        initial={initial}
        animate={animate}
        exit={exit}
      >
        <div className={styles.notificationContent}>
          <div>{content}</div>

          <button
            type="button"
            onClick={handleOnClose}
            className={styles.closeButton}
          >
            <X />
          </button>
        </div>

        {!disableAutoClose && !hideProgress && (
          <div className={styles.progressBar}>
            <motion.div
              className={styles.bar}
              initial={progressInitial}
              animate={progressAnimate}
              transition={progressBarAnimate}
            />
          </div>
        )}
      </motion.li>
    );
  },
);
