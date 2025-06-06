import type { SVGProps } from "react";

export const VerseMateIcon = (props: SVGProps<SVGSVGElement>) => {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect x="0.5" y="0.5" width="39" height="39" rx="19.5" stroke="black" />
      <path
        d="M24.3027 23.7462V15.9183H25.2218L28.1514 20.1901L31.0809 15.9183H32V23.7462H31.0924V17.4056L28.1628 21.5991H28.1169L25.1873 17.4168V23.7462H24.3027Z"
        fill="#3E464D"
      />
      <path
        d="M11.458 23.8021L8 15.9183H9.01098L11.8716 22.6615L14.7437 15.9183H15.7202L12.2622 23.8021H11.458Z"
        fill="black"
      />
      <path d="M19.3313 32V8H20.0781V32H19.3313Z" fill="black" />
    </svg>
  );
};
