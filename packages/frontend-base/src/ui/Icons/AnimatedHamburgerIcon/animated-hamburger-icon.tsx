import type { SVGProps } from "react";
import { memo } from "react";
import styles from "./animated-hamburger-icon.module.css";

type Props = {
  isOpen: boolean;
  className?: string;
} & SVGProps<SVGSVGElement>;

const AnimatedHamburgerIconComponent = ({ isOpen, ...props }: Props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="2.2em"
    height="2.2em"
    fill="none"
    viewBox="10 -3 41 54"
    {...props}
  >
    <title>Hamburger Menu</title>
    <path
      className={`${styles.line} ${styles.line1} ${isOpen ? styles.open : ""}`}
      d="M10 14h28v3.2H10z"
      fill="#fff"
    />
    <path
      className={`${styles.line} ${styles.line2} ${isOpen ? styles.open : ""}`}
      d="M10 28h28v-3.2H10z"
      fill="#fff"
    />
    <path
      className={`${styles.line} ${styles.line3} ${isOpen ? styles.open : ""}`}
      d="M10 38.8h28v-3.2H10z"
      fill="#fff"
    />
  </svg>
);

export const AnimatedHamburgerIcon = memo(AnimatedHamburgerIconComponent);
