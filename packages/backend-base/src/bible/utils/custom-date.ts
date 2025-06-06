export const currentDate = () => {
  const currentDate = new Date();
  currentDate.setHours(currentDate.getHours() + 3);
  return currentDate;
};
