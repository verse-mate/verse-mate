import type { SVGProps } from "react";

export interface BookmarkIconProps extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export const BookmarkIcon = ({
  className,
  filled,
  ...props
}: BookmarkIconProps) => {
  const isFilled = filled || className?.includes("bookmarkedIcon");

  return (
    <svg
      width="14"
      height="18"
      viewBox="0 0 14 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {isFilled ? (
        // Filled version - single path with no inner cutout
        <path d="M0.5 17.25V2.30775C0.5 1.80258 0.675 1.375 1.025 1.025C1.375 0.675 1.80258 0.5 2.30775 0.5H11.6923C12.1974 0.5 12.625 0.675 12.975 1.025C13.325 1.375 13.5 1.80258 13.5 2.30775V17.25L7 14.4615L0.5 17.25Z" />
      ) : (
        // Outline version - with the inner cutout
        <path d="M0.5 17.25V2.30775C0.5 1.80258 0.675 1.375 1.025 1.025C1.375 0.675 1.80258 0.5 2.30775 0.5H11.6923C12.1974 0.5 12.625 0.675 12.975 1.025C13.325 1.375 13.5 1.80258 13.5 2.30775V17.25L7 14.4615L0.5 17.25ZM2 14.95L7 12.8L12 14.95V2.30775C12 2.23075 11.9679 2.16025 11.9038 2.09625C11.8398 2.03208 11.7692 2 11.6923 2H2.30775C2.23075 2 2.16025 2.03208 2.09625 2.09625C2.03208 2.16025 2 2.23075 2 2.30775V14.95Z" />
      )}
    </svg>
  );
};
