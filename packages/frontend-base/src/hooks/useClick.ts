import { type RefObject, useEffect } from "react";

export type UseClickProps = {
  refs: RefObject<HTMLElement>[];
  onClickInside?: () => void | Promise<void>;
  onClickOutside?: () => void | Promise<void>;
};

export const useClick = ({
  refs,
  onClickInside,
  onClickOutside,
}: UseClickProps) => {
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;

      const isClickInside = refs.some((ref) => ref.current?.contains(target));

      if (isClickInside) {
        return onClickInside?.();
      }

      return onClickOutside?.();
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [refs, onClickInside, onClickOutside]);
};
