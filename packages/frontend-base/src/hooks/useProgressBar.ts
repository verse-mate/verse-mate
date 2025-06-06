import { useEffect, useState } from "react";

type ProgressBarProps = {
  totalChapters?: number;
  currentVerse?: number | null;
};

export const useProgressBar = ({
  totalChapters,
  currentVerse,
}: ProgressBarProps) => {
  const parsedCurrentVerse = Number(currentVerse);
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    if (totalChapters && totalChapters > 0 && parsedCurrentVerse > 0) {
      const calculatedProgress = (parsedCurrentVerse / totalChapters) * 100;
      setProgress(Number(calculatedProgress.toFixed(0)));
    }
  }, [totalChapters, parsedCurrentVerse]);

  return {
    progress,
    setProgress,
  };
};
