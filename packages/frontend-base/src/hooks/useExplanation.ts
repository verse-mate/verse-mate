import { useQueryClient } from "@tanstack/react-query";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { AnalyticsEvent, analytics } from "../analytics";
import { useGetSearchParams, useSaveSearchParams } from "./useSearchParams";

export const useExplanation = () => {
  const queryClient = useQueryClient();
  const { explanationType } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();

  const handleValueChange = (value: ExplanationTypeEnum) => {
    // Track EXPLANATION_TAB_CHANGED event
    // Map ExplanationTypeEnum values to the expected tab names
    const tabMap: Record<string, "summary" | "byline" | "detailed"> = {
      summary: "summary",
      byline: "byline",
      detailed: "detailed",
    };

    const tab = tabMap[value] || "summary";
    analytics.track(AnalyticsEvent.EXPLANATION_TAB_CHANGED, { tab });

    saveSearchParams({ explanationType: value });
    queryClient.invalidateQueries({ queryKey: ["explanation"] });
  };

  return {
    explanationType,
    handleValueChange,
  };
};
