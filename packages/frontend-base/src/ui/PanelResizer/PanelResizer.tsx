import * as Icons from "../Icons";
import styles from "./panel-resizer.module.css";

type ResizerProps = {
  startResize: (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) => void;
};

export const PanelResizer = ({ startResize }: ResizerProps) => {
  return (
    <div className={styles.container}>
      <div
        onMouseDown={startResize}
        onTouchStart={startResize}
        className={styles.button}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = "#f8f8f8";
          (e.currentTarget as HTMLElement).style.transform =
            "translate(-50%, -50%) scale(1.1)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = "#fff";
          (e.currentTarget as HTMLElement).style.transform =
            "translate(-50%, -50%)";
        }}
      >
        <Icons.ResizeIcon
          style={{ minWidth: "12px", color: "var(--text-secondary)" }}
        />
      </div>
    </div>
  );
};
