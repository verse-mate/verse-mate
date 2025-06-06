import type { SVGProps } from "react";

export const ResizeIcon = (props: SVGProps<SVGSVGElement>) => {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <mask
        id="mask0_3794_4026"
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="24"
        height="24"
      >
        <rect width="24" height="24" fill="#D9D9D9" />
      </mask>
      <g mask="url(#mask0_3794_4026)">
        <path
          d="M16.8558 16.6537L15.7923 15.6095L18.627 12.7595H13V11.25H18.627L15.802 8.40948L16.8558 7.36548L21.5 12.0095L16.8558 16.6537ZM7.15375 16.6537L2.5 12.0095L7.14425 7.36548L8.198 8.40948L5.373 11.25H11V12.7595H5.3635L8.198 15.6095L7.15375 16.6537Z"
          fill="black"
        />
      </g>
    </svg>
  );
};
