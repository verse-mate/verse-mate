import { useGetSearchParams, useSaveSearchParams } from "./useSearchParams";

export const useBibleVersion = () => {
  const { bibleVersion } = useGetSearchParams();
  const { saveBibleVersionOnURL } = useSaveSearchParams();

  return {
    bibleVersion: bibleVersion || "NASB1995",
    setBibleVersion: saveBibleVersionOnURL,
  };
};
