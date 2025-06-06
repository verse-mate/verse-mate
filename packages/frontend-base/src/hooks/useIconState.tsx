"use client";

import { useState } from "react";

export const useIconState = () => {
  const [activeIcons, setActiveIcons] = useState<Record<string, boolean>>({});

  const toggleIconState = (id: string) => {
    setActiveIcons((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const isIconActive = (id: string) => !!activeIcons[id];

  return {
    toggleIconState,
    isIconActive,
  };
};
