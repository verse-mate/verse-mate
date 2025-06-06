export const removeItem = <T>(arr: T[], item: T) => {
  const index = arr.indexOf(item);
  return arr.toSpliced(index, 1);
};
