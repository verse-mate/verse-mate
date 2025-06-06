import { AvatarBadge as Badge } from "./AvatarBadge";
import { AvatarImage, type AvatarProps } from "./AvatarImage";
import { AvatarUpload as Upload } from "./Upload";

export const Avatar = Object.assign(AvatarImage, {
  Badge,
  Upload,
});

export type { AvatarProps };
