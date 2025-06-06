export const extractFileName = (url: string) => {
  const parts = url.split("/");
  const fileNameWithParams = parts.pop();
  return fileNameWithParams?.split("?")[0];
};
