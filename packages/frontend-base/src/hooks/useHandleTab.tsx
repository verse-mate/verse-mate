import { useEffect, useState } from "react";

export const useHandleTab = () => {
  const [activeTab, setActiveTabState] = useState(() => {
    if (typeof window !== "undefined") {
      const savedTab = localStorage.getItem("activeTab");
      return savedTab || "explanation";
    }
    return "explanation";
  });

  const setActiveTab = (tab: string | ((prevState: string) => string)) => {
    setActiveTabState((prevState) => {
      const newState = typeof tab === "function" ? tab(prevState) : tab;
      if (typeof window !== "undefined") {
        localStorage.setItem("activeTab", newState);
      }
      return newState;
    });
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleStorageChange = () => {
        const savedTab = localStorage.getItem("activeTab");
        if (savedTab && savedTab !== activeTab) {
          setActiveTabState(savedTab);
        }
      };

      window.addEventListener("storage", handleStorageChange);
      return () => {
        window.removeEventListener("storage", handleStorageChange);
      };
    }
  }, [activeTab]);

  return { activeTab, setActiveTab };
};
