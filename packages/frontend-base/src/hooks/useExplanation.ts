import { useQueryClient } from "@tanstack/react-query";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { useGetSearchParams, useSaveSearchParams } from "./useSearchParams";

export const useExplanation = () => {
  const queryClient = useQueryClient();
  const { explanationType } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();

  const handleValueChange = (value: ExplanationTypeEnum) => {
    saveSearchParams({ explanationType: value });
    queryClient.invalidateQueries({ queryKey: ["explanation"] });
  };

  return {
    explanationType,
    handleValueChange,
  };
};
