"use client";

import { useEffect, useState } from "react";
import { Footer as FooterComponent } from "../../ui/Footer";
import styles from "./footer.module.css";

export const Footer = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollableElement = document.querySelector(
        '[data-scroll-container="main"]',
      );
      if (!scrollableElement) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollableElement;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
      setIsVisible(isNearBottom);
    };

    let ticking = false;
    const throttledHandleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    const scrollableElement = document.querySelector(
      '[data-scroll-container="main"]',
    );
    if (scrollableElement) {
      scrollableElement.addEventListener("scroll", throttledHandleScroll);
      handleScroll();
    }

    return () => {
      if (scrollableElement) {
        scrollableElement.removeEventListener("scroll", throttledHandleScroll);
      }
    };
  }, []);

  return (
    <FooterComponent.Root
      className={`${styles.footer} ${isVisible ? styles.visible : styles.hidden}`}
    >
      <FooterComponent.Content>
        <FooterComponent.Logo />
      </FooterComponent.Content>
    </FooterComponent.Root>
  );
};
