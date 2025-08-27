import type { SVGProps } from "react";

export const ChevronForward = (props: SVGProps<SVGSVGElement>) => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="-1 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M8.01544 21.6537L6.59619 20.2344L14.8307 11.9999L6.59619 3.76544L8.01544 2.34619L17.6692 11.9999L8.01544 21.6537Z"
        style={{ shapeRendering: "geometricPrecision" }}
      />
    </svg>
  );
};
