import type React from "react";

import styles from "./AnimatedCheck.module.css";

const CheckAnimatedIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      {...props}
      className={styles.scale}
    >
      <title>CheckAnimatedIcon</title>
      <path
        d="M12 24C18.6274 24 24 18.6274 24 12C24 5.37258 18.6274 0 12 0C5.37258 0 0 5.37258 0 12C0 18.6274 5.37258 24 12 24Z"
        fill="currentColor"
      />
      <path
        className={styles.check}
        d="M16 8L10.963 16L8 12"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default CheckAnimatedIcon;
