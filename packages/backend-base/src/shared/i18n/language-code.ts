import { ValidationError } from "../../common/errors";

const LANGUAGE_CODE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/;
const LANGUAGE_CODE_MAX_LENGTH = 35;

export function isLanguageCode(value: string): boolean {
  return (
    value.length <= LANGUAGE_CODE_MAX_LENGTH &&
    LANGUAGE_CODE_PATTERN.test(value)
  );
}

export function assertLanguageCode(value: string): void {
  if (!isLanguageCode(value)) {
    throw new ValidationError(
      "Invalid language code format. Expected a language code such as 'en', 'pt-BR' or 'zh-Hans'.",
    );
  }
}
