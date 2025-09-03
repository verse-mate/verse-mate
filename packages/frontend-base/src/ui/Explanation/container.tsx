import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { useSwipeable } from "react-swipeable";
import { useExplanation } from "../../hooks/useExplanation";
import { explanationTypes } from "../../utils/commentary-options";

type Props = {
  children: React.ReactNode;
};

export const Container = ({ children }: Props) => {
  const { explanationType, handleValueChange } = useExplanation();

  const currentIndex = explanationTypes.findIndex(
    (type) => type.value === explanationType,
  );

  const handleSwipeLeft = () => {
    // Move to next explanation type
    if (currentIndex < explanationTypes.length - 1) {
      const nextType = explanationTypes[currentIndex + 1];
      handleValueChange(nextType.value as ExplanationTypeEnum);
    }
  };

  const handleSwipeRight = () => {
    // Move to previous explanation type
    if (currentIndex > 0) {
      const prevType = explanationTypes[currentIndex - 1];
      handleValueChange(prevType.value as ExplanationTypeEnum);
    }
  };

  const swipeHandlers = useSwipeable({
    onSwipedLeft: handleSwipeLeft,
    onSwipedRight: handleSwipeRight,
    trackMouse: false,
    preventScrollOnSwipe: false,
    delta: 40,
    swipeDuration: 500,
  });

  return <div {...swipeHandlers}>{children}</div>;
};
