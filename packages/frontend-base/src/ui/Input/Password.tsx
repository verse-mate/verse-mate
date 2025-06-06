"use client";

import { forwardRef, useCallback, useState } from "react";
import { Eye, EyeOff } from "react-feather";

import { Button } from "../Button/Button";
import { Input, type InputProps } from "./Input";
import styles from "./Input.module.css";
import { InputSlot } from "./Slot";

export const InputPassword = forwardRef<HTMLInputElement, InputProps>(
  ({ ...props }, ref) => {
    const [show, setShow] = useState(false);
    const toggle = useCallback(() => {
      setShow((e) => !e);
    }, []);
    return (
      <Input {...props} ref={ref} type={show ? "text" : "password"}>
        <InputSlot right padding="off">
          <Button
            variant="ghost"
            onClick={toggle}
            format="square"
            aria-label={"Password visibility toggle icon"}
            tabIndex={-1}
          >
            {show ? (
              <Eye size="16" />
            ) : (
              <EyeOff className={styles.dashedEye} size="16" />
            )}
          </Button>
        </InputSlot>
      </Input>
    );
  },
);
