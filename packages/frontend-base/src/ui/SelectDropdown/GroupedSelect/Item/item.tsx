import { CheckIcon } from "../../../Icons";
import styles from "./item.module.css";

type ItemProps = {
  className?: string;
  value: string;
  onClick: () => void;
  checked?: boolean;
  highlighted?: boolean;
};

const getItemStyles = (highlighted?: boolean) => {
  if (highlighted) {
    return {
      backgroundColor: "var(--dust)",
      color: "var(--snow)",
    };
  }
  return {};
};

const getSpanStyles = (highlighted?: boolean) => {
  if (highlighted) {
    return {
      backgroundColor: "var(--dust)",
      color: "var(--snow)",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    };
  }
  return {};
};

const getSvgStyles = (highlighted?: boolean) => {
  if (highlighted) {
    return {
      fill: "var(--snow)",
    };
  }
  return {};
};

export const GroupedItem = ({
  className,
  value,
  onClick,
  checked,
  highlighted,
}: ItemProps) => {
  const itemClasses = `${styles.item} ${className} ${checked ? styles.checked : ""}`;

  return (
    <div
      className={itemClasses}
      style={getItemStyles(highlighted)}
      onClick={onClick}
      onKeyUp={onClick}
      onKeyDown={onClick}
    >
      <span style={getSpanStyles(highlighted)}>{value}</span>
      {highlighted && <CheckIcon style={getSvgStyles(highlighted)} />}
    </div>
  );
};
