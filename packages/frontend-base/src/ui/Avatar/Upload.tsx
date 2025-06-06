import { type InputHTMLAttributes, forwardRef } from "react";
import { Edit2 } from "react-feather";

import styles from "./Avatar.module.css";

export interface AvatarUploadProps
  extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
}

export const AvatarUpload = forwardRef<HTMLInputElement, AvatarUploadProps>(
  ({ id, ...props }, ref) => {
    return (
      <label htmlFor={id} className={styles.upload}>
        <input {...props} ref={ref} type="file" id={id} />

        <Edit2 />
      </label>
    );
  },
);

AvatarUpload.displayName = "AvatarUpload";
