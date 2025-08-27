import { CancelIcon, CheckCircleIcon, CircleIcon } from "../../..";
import { Text } from "../../ui/Text/Text";
import { regex } from "../lib";
import styles from "./PasswordRequirements.module.css";

type PasswordValidationsType =
  | "length"
  | "specialCharacter"
  | "number"
  | "lowercase"
  | "uppercase";

interface PasswordValidation {
  type: PasswordValidationsType;
  checked?: boolean;
  text: string;
  regExp: RegExp;
}

const PasswordValidations: PasswordValidation[] = [
  {
    type: "length",
    regExp: regex.PASSWORD_MIN_LENGTH_REGEX,
    text: "Minimum of 8 characters",
  },
  {
    type: "number",
    regExp: regex.PASSWORD_AT_LEAST_ONE_NUMBER,
    text: "At least 1 numeric character",
  },
  {
    type: "lowercase",
    regExp: regex.PASSWORD_AT_LEAST_ONE_LETTER,
    text: "At least 1 letter",
  },
];

export const PasswordRequirements = ({ password }: { password?: string }) => {
  return (
    <span className={styles.listWrapper}>
      {PasswordValidations.map((item) => {
        const isValid =
          password !== undefined ? item.regExp.test(password) : false;

        return (
          <div key={item.text} className={styles.listItem}>
            {isValid ? (
              <CheckCircleIcon color="var(--dust)" />
            ) : (password?.length ?? 0) > 0 ? (
              <CancelIcon color="var(--error)" />
            ) : (
              <CircleIcon color="var(--gray)" />
            )}{" "}
            <Text color="var(--gray)" size="16px">
              {item.text}
            </Text>
          </div>
        );
      })}
    </span>
  );
};
