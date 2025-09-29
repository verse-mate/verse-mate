import type { SVGProps } from "react";

export const ChevronBackward = (props: SVGProps<SVGSVGElement>) => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="1 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M15.9846 2.34631L17.4038 3.76556L9.16931 12.0001L17.4038 20.2346L15.9846 21.6538L6.33081 12.0001L15.9846 2.34631Z"
        fill="currentColor"
        style={{ shapeRendering: "geometricPrecision" }}
      />
    </svg>
  );
};
