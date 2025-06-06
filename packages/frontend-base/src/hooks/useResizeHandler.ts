import { useRef, useState } from "react";

export const useResizeHandler = () => {
  const containerRef = useRef(null);
  const [leftWidth, setLeftWidth] = useState(65);
  const [rightWidth, setRightWidth] = useState(35);

  const startResize = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();

    const startX: number = "touches" in e ? e.touches[0].clientX : e.clientX;

    const containerWidth = (
      containerRef.current as HTMLElement | null
    )?.getBoundingClientRect().width;
    const startLeftWidth = leftWidth;
    const startRightWidth = rightWidth;

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      let clientX: number;
      if ("touches" in moveEvent) {
        clientX = moveEvent.touches[0].clientX;
      } else {
        clientX = moveEvent.clientX;
      }
      const deltaX = clientX - startX;

      let newLeftWidth = containerWidth
        ? (((startLeftWidth / 100) * containerWidth + deltaX) /
            containerWidth) *
          100
        : startLeftWidth;
      newLeftWidth = Math.max(40, Math.min(80, newLeftWidth));
      setLeftWidth(newLeftWidth);

      let newRightWidth = containerWidth
        ? (((startRightWidth / 100) * containerWidth - deltaX) /
            containerWidth) *
          100
        : startRightWidth;
      newRightWidth = Math.max(35, Math.min(65, newRightWidth));
      setRightWidth(newRightWidth);
    };

    const onEnd = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onEnd);
  };

  return {
    containerRef,
    leftWidth,
    rightWidth,
    startResize,
  };
};
