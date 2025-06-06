import { useState } from "react";

export const useHandleTab = () => {
  const [activeTab, setActiveTab] = useState("book");
  return { activeTab, setActiveTab };
};
