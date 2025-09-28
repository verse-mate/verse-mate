import { useSwipeable } from "react-swipeable";
import { useChapter } from "../../hooks/useChapter";

type Props = {
  children: React.ReactNode;
  chapters?: number;
};

export const DesktopContainer = ({ children, chapters }: Props) => {
  const { handleNextChapter, handlePreviousChapter } = useChapter();
  const totalChapters = Number(chapters);
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (Number.isFinite(totalChapters)) handleNextChapter(totalChapters);
    },
    onSwipedRight: handlePreviousChapter,
    trackMouse: false,
    preventScrollOnSwipe: false,
    delta: 40,
    swipeDuration: 500,
  });

  return <div {...swipeHandlers}>{children}</div>;
};
