import type { SVGProps } from "react";

import styles from "./ThreeDotsLoadingIcon.module.css";

function ThreeDotsLoadingIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
      className={`${styles.dotTyping} ${props.className}`}
    >
      <title>ThreeDotsLoadingIcon</title>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

export default ThreeDotsLoadingIcon;
