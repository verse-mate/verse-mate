import { useState } from "react";

export const useHandleTab = () => {
  const [activeTab, setActiveTab] = useState("explanation");
  return { activeTab, setActiveTab };
};
