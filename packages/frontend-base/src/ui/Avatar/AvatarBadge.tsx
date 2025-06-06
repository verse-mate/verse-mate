import { Badge, type BadgeProps } from "../Badge/Badge";
import styles from "./Avatar.module.css";

interface AvatarBadgeProps extends BadgeProps {
  position?: "topRight" | "bottomRight";
}

export function AvatarBadge({
  position = "bottomRight",
  ...props
}: AvatarBadgeProps) {
  return (
    <span className={`${styles.avatarBadge} ${styles[position]}`}>
      <Badge {...props} />
    </span>
  );
}
