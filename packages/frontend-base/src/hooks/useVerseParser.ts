import { useMutation } from "@tanstack/react-query";
import { api } from "backend-api";

const parseReferences = async ({
  content,
  bibleVersion,
}: {
  content: string;
  bibleVersion: string;
}) => {
  const response = await api.topics["parse-references"].post({
    content,
    bibleVersion,
  });
  return response.data?.parsedContent;
};

export const useVerseParser = () => {
  return useMutation({
    mutationFn: parseReferences,
  });
};
