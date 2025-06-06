"use client";

import { formatIncompletePhoneNumber } from "libphonenumber-js";
import { type ChangeEvent, forwardRef, useCallback, useState } from "react";

import { Input, type InputProps } from "./Input";

export const InputSimpleFormatPhone = forwardRef<HTMLInputElement, InputProps>(
  ({ ...inputProps }, ref) => {
    const [formatted, setFormatted] = useState("");

    const handleOnChange = useCallback(
      (event: ChangeEvent<HTMLInputElement>) => {
        const newPhone = formatIncompletePhoneNumber(event.target.value);

        setFormatted(newPhone || event.target.value);
      },
      [],
    );

    return (
      <Input
        placeholder={"+00 000 000 000"}
        {...inputProps}
        ref={ref}
        type={"tel"}
        onChange={handleOnChange}
        value={
          inputProps.value
            ? formatIncompletePhoneNumber(String(inputProps.value)) ??
              inputProps.value
            : formatted
        }
      />
    );
  },
);
