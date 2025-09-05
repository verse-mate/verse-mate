import { useSwipeable } from "react-swipeable";
import { useChapter } from "../../hooks/useChapter";

type Props = {
  children: React.ReactNode;
  chapters?: number;
};

export const Container = ({ children, chapters }: Props) => {
  const { handleNextChapter, handlePreviousChapter } = useChapter();

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => handleNextChapter(chapters),
    onSwipedRight: handlePreviousChapter,
    trackMouse: false,
    preventScrollOnSwipe: false,
    delta: 40,
    swipeDuration: 500,
  });

  return <div {...swipeHandlers}>{children}</div>;
};
